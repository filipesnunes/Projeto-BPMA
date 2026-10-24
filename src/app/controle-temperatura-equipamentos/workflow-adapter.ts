import "server-only";
import { Prisma, type ControleTemperaturaEquipamento } from "@prisma/client";
import type { WorkflowAdapter, WorkflowContent } from "@/lib/operational-workflow/contracts";
import type { WorkflowSignatureBridge } from "@/lib/operational-workflow/service";
import { formatAppDateInput, getAppDate, getAppNow, parseAppDateInput } from "@/lib/date-time";
import { assertProcedureTime, operationalTime } from "@/lib/procedure-time";
import { parseImageUploadFromFormData } from "@/lib/image-upload";
import { TEMPERATURE_EVIDENCE_IMAGE_MAX_BYTES } from "@/lib/image-upload-rules";
import { getRegistroPayload } from "./record-payload";
import { hasPermission, getDefaultPermissionCodes } from "@/lib/permissions";
import { canSignModuleDay } from "@/lib/module-signatures";
import { verifyPassword } from "@/lib/password";
import type { AuthenticatedUser } from "@/lib/auth-session";

export type TemperatureDraft = Record<string, string>;
const fields = ["temperaturaAferida", "statusOperacionalEquipamento", "observacaoStatusOperacional", "horarioAfericao", "horarioNaoInformado", "justificativaHorario"];
export function parseTemperatureKey(key: string) {
  const match = /^(\d+):(\d{4}-\d{2}-\d{2}):(MANHA|TARDE)(?::[a-f0-9-]{36})?$/.exec(key);
  const date = match && parseAppDateInput(match[2]);
  if (!match || !date || !Number.isSafeInteger(Number(match[1])) || Number(match[1]) < 1) throw new Error("Aferição inválida.");
  return { equipmentId: Number(match[1]), date, shift: match[3] as "MANHA" | "TARDE" };
}

export function temperatureSnapshot(record: ControleTemperaturaEquipamento): Prisma.InputJsonObject {
  // Signature metadata is evidence about this content, never part of the content itself.
  const { assinaturaNutricionistaUsuarioId, assinaturaNutricionistaNome, assinaturaNutricionistaPerfil,
    assinaturaNutricionistaDataHora, updatedAt, ...content } = record;
  void assinaturaNutricionistaUsuarioId; void assinaturaNutricionistaNome; void assinaturaNutricionistaPerfil;
  void assinaturaNutricionistaDataHora; void updatedAt;
  return JSON.parse(JSON.stringify(content));
}

export async function refreshWorkflowActor(tx: Prisma.TransactionClient, authenticated: AuthenticatedUser): Promise<AuthenticatedUser> {
  const session = await tx.usuarioSessao.findFirst({ where: { id: authenticated.sessaoId, usuarioId: authenticated.id, expiraEm: { gt: getAppNow() } } });
  const user = await tx.usuario.findUnique({ where: { id: authenticated.id }, include: { perfilAcesso: { include: {
    permissoes: { where: { permitido: true }, include: { permissao: true } }
  } } } });
  if (!session || !user || user.status !== "ATIVO" || user.obrigarTrocaSenha || user.perfilAcesso?.ativo === false) throw new Error("Sessão inválida ou perfil inativo.");
  return { ...authenticated, perfil: user.perfil, nomeCompleto: user.nomeCompleto, nomeUsuario: user.nomeUsuario,
    perfilAcessoId: user.perfilAcessoId, permissoes: user.perfilAcesso ? user.perfilAcesso.permissoes.map(p => p.permissao.codigo) : getDefaultPermissionCodes(user.perfil) };
}

export const temperatureAdapter: WorkflowAdapter = {
  module: "temperatura",
  async load(tx, key) {
    const { equipmentId, date, shift } = parseTemperatureKey(key);
    const equipment = await tx.controleTemperaturaEquipamentoOpcao.findUnique({ where: { id: equipmentId } });
    if (!equipment || equipment.tipo !== "EQUIPAMENTO") throw new Error("Equipamento não encontrado.");
    const identity = key.split(":").slice(0, 3).join(":");
    const duplicate = await tx.fluxoOperacional.findFirst({ where: { modulo: "temperatura", excluidoEm: null,
      chave: { not: key }, OR: [{ chave: identity }, { chave: { startsWith: identity + ":" } }] } });
    if (duplicate) throw new Error("Este equipamento já possui registro para este dia/turno. Abra a aferição existente.");
    const existing = await tx.controleTemperaturaEquipamento.findFirst({ where: { equipamento: equipment.nome, data: date, turno: shift, fluxoId: null } });
    return { date, legacy: Boolean(existing), content: { snapshot: {}, draft: {}, complete: false, resolved: 0, required: 1 } };
  },
  async save(tx, key, input, user, unit) {
    if (!(input instanceof FormData)) throw new Error("Formulário inválido.");
    const { equipmentId, date, shift } = parseTemperatureKey(key);
    const equipment = await tx.controleTemperaturaEquipamentoOpcao.findUniqueOrThrow({ where: { id: equipmentId } });
    if (!equipment.ativo || !(shift === "MANHA" ? equipment.turnoManha : equipment.turnoTarde)) throw new Error("Equipamento/turno não disponível para preenchimento.");
    const previous = await tx.fluxoOperacional.findUniqueOrThrow({ where: { id: unit.id }, include: { temperatura: true, versoes: { orderBy: { versao: "desc" }, take: 1 } } });
    const oldDraft = (previous.versoes[0]?.rascunho ?? {}) as TemperatureDraft;
    const draft: TemperatureDraft = {};
    for (const field of fields) {
      const value = input.get(field); draft[field] = typeof value === "string" ? value.trim() : "";
      if (draft[field].length > 4000) throw new Error("Texto excede o limite de 4000 caracteres.");
    }
    if (!["EM_OPERACAO", "INATIVO", "MANUTENCAO"].includes(draft.statusOperacionalEquipamento)) throw new Error("Situação do equipamento inválida.");
    const photo = await parseImageUploadFromFormData({ formData: input, key: "fotoDesvio", maxBytes: TEMPERATURE_EVIDENCE_IMAGE_MAX_BYTES });
    draft.fotoBase64 = photo?.base64 ?? oldDraft.fotoBase64 ?? previous.temperatura?.fotoBase64 ?? "";
    draft.fotoMimeType = photo?.mimeType ?? oldDraft.fotoMimeType ?? previous.temperatura?.fotoMimeType ?? "";
    draft.fotoNome = photo?.fileName ?? oldDraft.fotoNome ?? previous.temperatura?.fotoNome ?? "";
    draft.fotoUrl = oldDraft.fotoUrl ?? previous.temperatura?.fotoUrl ?? "";
    const operating = draft.statusOperacionalEquipamento === "EM_OPERACAO";
    const retroactive = formatAppDateInput(date) < formatAppDateInput(getAppDate());
    let complete = !operating || Boolean(draft.temperaturaAferida);
    if (operating && retroactive && !draft.horarioAfericao && draft.horarioNaoInformado !== "true") complete = false;
    if (operating && draft.horarioNaoInformado === "true" && (!retroactive || !draft.justificativaHorario)) complete = false;
    const payloadForm = new FormData();
    for (const field of fields) payloadForm.set(field, draft[field]);
    payloadForm.set("equipamento", equipment.nome);
    const payload = complete ? await getRegistroPayload(payloadForm, user.nomeCompleto, { data: date, turno: shift }, tx) : null;
    const settings = await tx.moduloConfiguracao.findUnique({ where: { modulo: "CONTROLE_TEMPERATURA" } });
    if (payload && operating && payload.status !== "CONFORME" && (settings?.exigirFotoEmAlertaCritico ?? true) && !draft.fotoBase64 && !draft.fotoUrl) complete = false;
    if (!complete || !payload) {
      if (input.get("intent") === "complete") throw new Error("Preencha temperatura, horário e evidência obrigatória antes de concluir. Você pode salvar o rascunho.");
      return { snapshot: {}, draft, complete: false, resolved: 0, required: 1 };
    }
    const unknown = operating && draft.horarioNaoInformado === "true";
    const time = !operating || unknown ? null : retroactive ? draft.horarioAfericao : previous.temperatura?.horarioAfericao || operationalTime(getAppNow());
    if (time !== null) assertProcedureTime(time, date);
    const { turnosConferencia, ...data } = payload; void turnosConferencia;
    const projected = { ...data, data: date, turno: shift, horarioAfericao: time,
      horarioNaoInformado: unknown, justificativaHorario: unknown ? draft.justificativaHorario : null,
      fotoNome: operating ? draft.fotoNome || null : null, fotoMimeType: operating ? draft.fotoMimeType || null : null,
      fotoBase64: operating ? draft.fotoBase64 || null : null, fotoUrl: operating ? draft.fotoUrl || null : null,
      ...(photo ? { fotoTamanhoBytes: photo.size, fotoCriadoEm: getAppNow(), fotoCriadoPorUsuarioId: user.id } : {}) };
    const record = previous.temperatura
      ? await tx.controleTemperaturaEquipamento.update({ where: { id: previous.temperatura.id }, data: projected })
      : await tx.controleTemperaturaEquipamento.create({ data: { ...projected, fluxoId: unit.id } });
    draft.horarioAfericao = time ?? "";
    return { snapshot: temperatureSnapshot(record), draft, complete: true, resolved: 1, required: 1 };
  }
};

export function temperatureSignatureBridge(password: string, daily: boolean): WorkflowSignatureBridge {
  return {
    module: "temperatura", mechanism: daily ? "ASSINATURA_DIARIA" : "REVISAO_INDIVIDUAL",
    async validate(tx, unit): Promise<WorkflowContent> {
      const source = await tx.fluxoOperacional.findUniqueOrThrow({ where: { id: unit.id }, include: {
        temperatura: true, versoes: { where: { versao: unit.versao } }
      } });
      const version = source.versoes[0];
      if (!source.temperatura || source.temperatura.excluidoEm || !version?.completo) throw new Error("Aferição incompleta ou excluída.");
      return { snapshot: temperatureSnapshot(source.temperatura), draft: version.rascunho as Prisma.InputJsonObject,
        complete: true, resolved: 1, required: 1 };
    },
    async sign(tx, user, units, signedAt) {
      if (daily ? !canSignModuleDay(user, "temperatura") : !hasPermission(user, "modulo.temperatura.assinar_historico")) throw new Error("Sem permissão para esta assinatura.");
      if (!daily && units.length !== 1) throw new Error("A revisão individual abrange uma única aferição.");
      const day = formatAppDateInput(units[0].dataReferencia);
      if (units.some(unit => formatAppDateInput(unit.dataReferencia) !== day)) throw new Error("A assinatura diária deve abranger uma única data.");
      const credentials = await tx.usuario.findUniqueOrThrow({ where: { id: user.id }, select: { senhaHash: true } });
      if (!password.trim() || !verifyPassword(password.trim(), credentials.senhaHash)) throw new Error("Senha inválida para confirmar a assinatura.");
      // Versioned daily scope lives in FluxoAssinatura; never create a blanket
      // legacy daily row that could implicitly validate unsigned legacy records.
      const log = await tx.logAssinatura.create({ data: { usuarioId: user.id, nomeUsuario: user.nomeUsuario,
        nomeCompleto: user.nomeCompleto, perfil: user.perfil, tipo: daily ? "RESPONSAVEL_TECNICO" : "REVISAO_NUTRICIONISTA",
        modulo: "temperatura", referenciaId: day, assinadoEm: signedAt,
        observacao: JSON.stringify({ mecanismo: daily ? "DIARIA" : "INDIVIDUAL", unidades: units.map(u => ({ id: u.id, versao: u.versao })) }) } });
      return `log:${log.id}`;
    }
  };
}
