import 'server-only';
import { Prisma, StatusOperacionalEquipamento, StatusTemperaturaEquipamento, TipoOpcaoTemperaturaEquipamento, TurnoTemperaturaEquipamento } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { formatAppDateInput, parseAppDateInput } from '@/lib/date-time';
import { correctiveActionWithPersistence, previousScheduledShift } from './persistence';
import { parseTemperatureInput, findMatchingTemperatureRule, getAutomaticCorrectiveAction, isCorrectiveActionRequired } from './utils';
function getInputValue(form: FormData, key: string) { const value=form.get(key); return typeof value==='string'?value.trim():''; }
function getConfiguredEquipmentShifts(equipment: {
  turnoManha: boolean;
  turnoTarde: boolean;
}): TurnoTemperaturaEquipamento[] {
  const shifts: TurnoTemperaturaEquipamento[] = [];

  if (equipment.turnoManha) {
    shifts.push(TurnoTemperaturaEquipamento.MANHA);
  }

  if (equipment.turnoTarde) {
    shifts.push(TurnoTemperaturaEquipamento.TARDE);
  }

  return shifts;
}


function parseOperationalStatusValue(value: string): StatusOperacionalEquipamento {
  if (value === StatusOperacionalEquipamento.MANUTENCAO) {
    return StatusOperacionalEquipamento.MANUTENCAO;
  }

  if (value === StatusOperacionalEquipamento.INATIVO) {
    return StatusOperacionalEquipamento.INATIVO;
  }

  return StatusOperacionalEquipamento.EM_OPERACAO;
}


export async function getRegistroPayload(formData: FormData, responsavelLogado: string, context: { data: Date; turno: TurnoTemperaturaEquipamento }, db: Prisma.TransactionClient = prisma) {
  const equipamentoInput = getInputValue(formData, "equipamento");
  const temperaturaAferidaInput = getInputValue(formData, "temperaturaAferida");
  const observacaoInput =
    getInputValue(formData, "observacaoStatusOperacional") ||
    getInputValue(formData, "observacoes");
  const statusOperacionalEquipamento = parseOperationalStatusValue(
    getInputValue(formData, "statusOperacionalEquipamento")
  );

  if (!equipamentoInput) {
    throw new Error("Preencha todos os campos obrigatórios do registro.");
  }

  if (!responsavelLogado.trim()) {
    throw new Error("Não foi possível identificar o usuário logado para o campo Responsável.");
  }

  const equipamentoOption = await db.controleTemperaturaEquipamentoOpcao.findFirst({ where: { tipo: TipoOpcaoTemperaturaEquipamento.EQUIPAMENTO, nome: equipamentoInput, ativo: true } });
  if (!equipamentoOption) {
    throw new Error("O equipamento selecionado não existe ou está inativo.");
  }

  if (!equipamentoOption.categoriaEquipamento) {
    throw new Error("O equipamento selecionado está sem categoria configurada.");
  }

  const turnosConferencia = getConfiguredEquipmentShifts(equipamentoOption);
  if (turnosConferencia.length === 0) {
    throw new Error("O equipamento selecionado está sem turnos de conferência configurados.");
  }

  if (statusOperacionalEquipamento !== StatusOperacionalEquipamento.EM_OPERACAO) {
    return {
      equipamento: equipamentoOption.nome,
      categoriaEquipamento: equipamentoOption.categoriaEquipamento,
      turnosConferencia,
      statusOperacionalEquipamento,
      temperaturaAferida: null,
      status: StatusTemperaturaEquipamento.CONFORME,
      acaoCorretiva: null,
      responsavel: responsavelLogado.trim(),
      observacoes: null,
      observacaoStatusOperacional: observacaoInput || null
    };
  }

  if (!temperaturaAferidaInput) {
    throw new Error("Informe a temperatura aferida do equipamento em operação.");
  }

  const temperaturaAferida = parseTemperatureInput(temperaturaAferidaInput);
  if (temperaturaAferida === null) {
    throw new Error("Informe uma temperatura válida.");
  }

  const categoriaParametro = await db.controleTemperaturaCategoriaParametro.findFirst({ where: { categoria: equipamentoOption.categoriaEquipamento } });

  if (!categoriaParametro) {
    throw new Error(
      "A categoria deste equipamento está sem parâmetros configurados. Atualize em Gerenciar Opções."
    );
  }

  const regrasAtivas = await db.controleTemperaturaCategoriaRegra.findMany({
    where: {
      categoriaId: categoriaParametro.id,
      isActive: true
    },
    orderBy: [{ ordem: "asc" }, { id: "asc" }]
  });

  if (regrasAtivas.length === 0) {
    throw new Error(
      "A categoria deste equipamento está sem regras de temperatura ativas. Atualize em Gerenciar Opções."
    );
  }

  const regraCorrespondente = findMatchingTemperatureRule(
    temperaturaAferida,
    regrasAtivas
  );

  if (!regraCorrespondente) {
    throw new Error(
      "Não existe regra de temperatura correspondente para esta categoria. Ajuste as regras em Gerenciar Opções."
    );
  }

  const status = regraCorrespondente.status;
  let acaoCorretiva =
    regraCorrespondente.acaoCorretiva.trim() ||
    getAutomaticCorrectiveAction(status, categoriaParametro);

  if (status === "ALERTA" && /persistir\s+no\s+turno\s+seguinte/i.test(acaoCorretiva)) {
    const previousShift = previousScheduledShift(formatAppDateInput(context.data), context.turno, turnosConferencia);
    const previous = await db.controleTemperaturaEquipamento.findFirst({
      where: { equipamento: equipamentoOption.nome, data: parseAppDateInput(previousShift.data)!, turno: previousShift.turno },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { equipamento: true, categoriaEquipamento: true, data: true, turno: true, statusOperacionalEquipamento: true, temperaturaAferida: true, status: true }
    });
    acaoCorretiva = correctiveActionWithPersistence({ equipamento: equipamentoOption.nome,
      categoria: equipamentoOption.categoriaEquipamento, data: formatAppDateInput(context.data), turno: context.turno,
      shifts: turnosConferencia, rule: { ...regraCorrespondente, acaoCorretiva }, rules: regrasAtivas,
      previous: previous ? { ...previous, data: formatAppDateInput(previous.data) } : null });
  }

  if (isCorrectiveActionRequired(status) && !acaoCorretiva) {
    throw new Error(
      "A Ação Corretiva é obrigatória quando a temperatura estiver em Alerta ou Crítico."
    );
  }

  return {
    equipamento: equipamentoOption.nome,
    categoriaEquipamento: equipamentoOption.categoriaEquipamento,
    turnosConferencia,
    statusOperacionalEquipamento,
    temperaturaAferida,
    status,
    acaoCorretiva,
    responsavel: responsavelLogado.trim(),
    observacoes: observacaoInput || null,
    observacaoStatusOperacional: null
  };
}
