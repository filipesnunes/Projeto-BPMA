import "server-only";
import { Prisma, type PrismaClient } from "@prisma/client";
import { buffetRecordValues, prepareBuffetRow } from "./row-save";
import type { AuthenticatedUser } from "@/lib/auth-session";
import type { BuffetDraft } from "./workflow-adapter";
import { buffetProgress } from "./progress";

// The caller supplies a plain Prisma client, without operational report filters.
// No session/permission registration, no updates, no automatic regularization.
export async function auditBuffetPending(prisma: PrismaClient) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const [records, flows] = await Promise.all([
      tx.controleBuffetAmostraRegistro.findMany({ where: { excluidoEm: null }, orderBy: { id: "asc" } }),
      tx.fluxoOperacional.findMany({ where: { modulo: "amostras", excluidoEm: null }, include: { versoes: { orderBy: { versao: "desc" } }, eventos: { select: { id: true, operacao: true, versaoNova: true, criadoEm: true } } } })
    ]);
    const results: Array<Record<string, unknown> & { classe: string }> = [];
    for (const record of records.filter(row => row.status === "PENDENTE")) {
      const flow = flows.find(unit => unit.id === record.fluxoId), version = flow?.versoes[0];
      const draft = version?.rascunho as unknown as BuffetDraft | undefined;
      const manifestItem = record.itemExtra ? record : draft?.manifest.find(item => item.id === record.itemId);
      const item = manifestItem ? { nome: "Item", classificacao: manifestItem.classificacao, usaGarrafaTermica: manifestItem.usaGarrafaTermica } : { nome: "Item", classificacao: record.classificacao, usaGarrafaTermica: record.usaGarrafaTermica };
      const rowKey = record.itemExtra ? `extra-${record.id}` : `item-${record.itemId}`;
      const actor = { id: record.responsavelUsuarioId, nomeCompleto: "Identidade omitida", perfil: record.responsavelPerfil } as AuthenticatedUser;
      const validate = async (values: Record<string, string>) => {
        const form = new FormData(); for (const [key, value] of Object.entries(values)) form.set(rowKey + "-" + key, value);
        try { const result = await prepareBuffetRow(tx, { form, rowKey, date: record.data, item, actor, old: record }); return { complete: result.payload?.status === "PREENCHIDO" || result.payload?.status === "NAO_SERVIDO", issues: result.issues }; }
        catch (error) { return { complete: false, issues: [error instanceof Error && !/prisma|p20\d|transaction/i.test(error.message) ? error.message : "Falha na validação; conferir evidências."] }; }
      };
      const persisted = await validate(buffetRecordValues(record));
      const storedDraft = draft?.rows[rowKey];
      const draftResult = storedDraft ? await validate(storedDraft) : null;
      const duplicate = record.itemId !== null && records.some(row => row.id !== record.id && row.itemId === record.itemId && row.servicoId === record.servicoId && +row.data === +record.data && row.fluxoId !== record.fluxoId);
      const snapshot = version?.dados as { records?: Array<Record<string, unknown>> } | undefined;
      const snapshotRow = snapshot?.records?.find(row => row.id === record.id);
      const diverges = snapshotRow && ["status", "tcEquipamento", "primeiraTc", "acaoCorretiva", "horarioExecucao"].some(key => (snapshotRow[key]??null) !== (record[key as keyof typeof record]??null));
      const priorFilled = flow?.versoes.some(revision => (revision.dados as { records?: Array<{ id: number; status: string }> })?.records?.some(row => row.id === record.id && ["PREENCHIDO", "ASSINADO"].includes(row.status)));
      const draftDiffers = storedDraft && ["tcEquipamento", "primeiraTc", "acaoCorretiva", "temperaturaTipo", "naoServido"].some(key => storedDraft[key] && storedDraft[key] !== buffetRecordValues(record)[key]);
      const classe = duplicate || diverges ? "D" : record.fluxoId && (!flow || !manifestItem || !snapshotRow) ? "E" : persisted.complete ? "A" : draftDiffers ? "C" : !record.fluxoId && !record.horarioExecucao && !record.horarioNaoInformado ? "E" : "B";
      results.push({ classe, registroId: record.id, servicoId: record.servicoId, itemId: record.itemId, data: record.data.toISOString().slice(0, 10), fluxoId: record.fluxoId, versao: version?.versao ?? null, responsavelId: record.responsavelUsuarioId, camposAusentesOuInvalidos: persisted.issues, rascunhoValidado: draftResult?.complete ?? false, preenchidoEmVersaoAnterior: Boolean(priorFilled), divergenciaSnapshot: Boolean(diverges), duplicidadeLegadoVersionado: duplicate, eventos: flow?.eventos ?? [], observacao: classe === "A" ? "Dados persistidos satisfazem a validação atual, mas o status continua PENDENTE; conferir a versão e autorizar regularização individual." : classe === "E" ? "Faltam evidências para reconstruir as regras/autoria do salvamento." : classe === "C" ? "Há dados diferentes apenas no rascunho; não tratá-los como aferição persistida." : classe === "D" ? "Conferir representações e versões antes de qualquer alteração." : "Pendência de validação dos dados persistidos." });
    }
    for (const flow of flows) {
      const draft = flow.versoes[0]?.rascunho as unknown as BuffetDraft | undefined;
      const version=flow.versoes[0];
      if(version&&draft?.manifest){
        const progress=buffetProgress(records.filter(record=>record.fluxoId===flow.id),draft.manifest);
        if(flow.preenchimentoCompleto!==progress.complete||version.resolvidos!==progress.resolved||version.obrigatorios!==Math.max(progress.required,1))results.push({classe:"D",registroId:null,fluxoId:flow.id,versao:flow.versao,observacao:"Indicadores persistidos do fluxo/versão divergem dos status dos itens no manifesto.",indicadoresPersistidos:{completo:flow.preenchimentoCompleto,resolvidos:version.resolvidos,obrigatorios:version.obrigatorios},indicadoresDosItens:progress});
      }
      for (const item of draft?.manifest ?? []) {
        if (records.some(record => record.fluxoId === flow.id && record.itemId === item.id)) continue;
        const row = draft?.rows[`item-${item.id}`];
        if (!row || !["tcEquipamento", "primeiraTc", "acaoCorretiva", "observacao"].some(key => row[key])) continue;
        results.push({ classe: "C", registroId: null, itemId: item.id, servicoId: Number(flow.chave.split(":")[0]), fluxoId: flow.id, versao: flow.versao, data: flow.dataReferencia.toISOString().slice(0, 10), observacao: "Campos existem somente no rascunho; não há aferição projetada para este item." });
      }
    }
    return { somenteLeitura: true, politica: "buffet-pendencias-v1", observacao: "Classificação com as regras e o catálogo disponíveis nesta leitura. A não é autorização de atualização; C não é aferição concluída. Sem correção automática e sem nomes pessoais.", quantidades: Object.fromEntries(["A", "B", "C", "D", "E"].map(key => [key, results.filter(row => row.classe === key).length])), resultados: results };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 120000 });
}
