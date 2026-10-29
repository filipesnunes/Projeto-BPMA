import Link from "next/link";
import { getCurrentUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { formatAppDateInput, getAppDate, parseAppDateInput } from "@/lib/date-time";

type Module = "temperatura" | "oleo" | "amostras" | "rastreabilidade";
const paths = { temperatura: "/controle-temperatura-equipamentos", oleo: "/controle-qualidade-oleo", amostras: "/controle-buffet-amostras", rastreabilidade: "/rastreabilidade-recebimento" };
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";

// Incomplete projections stay out of sanitary reports. Read their immutable draft
// through the workflow relation instead of weakening the global measurement filter.
export async function CompatibleWorkflowRecords({ module, history, query, operationalDate, historyRange }: {
  module: Module; history: boolean; query: Record<string, string | string[] | undefined>; operationalDate?: Date; historyRange?: {gte:Date;lte:Date};
}) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, `modulo.${module}.acessar`)) return null;
  const fullHistory = hasPermission(user, `modulo.${module}.acessar_historico`) || hasPermission(user, `modulo.${module}.editar_historico`);
  const date = parseAppDateInput(first(query.filtroData) || first(query.data) || first(query.dia));
  const month = Number(first(query.filtroMes));
  const year = Number(first(query.filtroAno));
  const dateFilter = !fullHistory ? getAppDate() : date ?? (year >= 2020 && year <= 2100 ? {
    gte: new Date(Date.UTC(year, month >= 1 && month <= 12 ? month - 1 : 0, 1)),
    lt: new Date(Date.UTC(year, month >= 1 && month <= 12 ? month : 12, 1))
  } : undefined);
  const units = await prisma.fluxoOperacional.findMany({
    where: { modulo: module, excluidoEm: null,
      ...(history ? { dataReferencia: historyRange??dateFilter, ...(historyRange&&date?{AND:{dataReferencia:date}}:{}) } : { OR: [{ preenchimentoCompleto: false }, { estado: "REABERTO" }] }),
      ...(!history && !fullHistory ? { OR: [{ dataReferencia: operationalDate ?? getAppDate(), preenchimentoCompleto: false }, { estado: "REABERTO" }] } : {}),
      ...(!history && operationalDate ? { dataReferencia: operationalDate } : {})
    },
    include: { temperatura: true, oleo: true, amostras: { where: { excluidoEm: null }, take: 1, include: { servico: true } }, recebimento: true, assinaturaVigente: true },
    orderBy: [{ dataReferencia: "desc" }, { criadoEm: "desc" }]
  });
  if (!units.length) return null;
  const ids = [...new Set(units.map(unit=>Number(unit.chave.split(":")[0])).filter(Number.isSafeInteger))];
  const catalog = module === "temperatura" ? await prisma.controleTemperaturaEquipamentoOpcao.findMany({where:{id:{in:ids}},select:{id:true,nome:true}})
    : module === "amostras" ? await prisma.controleBuffetAmostraServico.findMany({where:{id:{in:ids}},select:{id:true,nome:true}}) : [];
  const names = new Map(catalog.map(item=>[item.id,item.nome]));
  return <section className="bpma-card space-y-3" aria-label="Preenchimentos salvos e revisões">
    <h2 className="text-lg font-semibold">{history ? "Validações e preenchimentos salvos" : "Continuar preenchimentos e revisões"}</h2>
    <p className="text-sm">Os dados salvos antes e depois da atualização permanecem disponíveis. Uma revisão pendente exige nova assinatura.</p>
    <ul className="divide-y divide-slate-200 dark:divide-slate-700">{units.map(unit => {
      const base = paths[module];
      const url = module === "rastreabilidade" ? `${base}/nota/${unit.recebimento?.id}` : module === "amostras" ? `${base}/servico/${unit.chave.split(":")[0]}?data=${formatAppDateInput(unit.dataReferencia)}` : `${base}/fluxo?chave=${encodeURIComponent(unit.chave)}`;
      const label = unit.temperatura?.equipamento ?? (module === "temperatura" ? names.get(Number(unit.chave.split(":")[0])) ?? `Equipamento ${unit.chave.split(":")[0]}` : null) ?? unit.amostras[0]?.servico.nome ?? (module === "amostras" ? names.get(Number(unit.chave.split(":")[0])) ?? `Serviço ${unit.chave.split(":")[0]}` : null) ?? (unit.recebimento ? `Nota ${unit.recebimento.notaFiscal} — ${unit.recebimento.fornecedor}` : "Verificação do óleo");
      return <li key={unit.id} className="flex flex-wrap items-center justify-between gap-3 py-3 [overflow-wrap:anywhere]">
        <div><p className="font-medium">{label} — {formatAppDateInput(unit.dataReferencia)}{module === "temperatura" ? ` — ${unit.chave.split(":")[2] === "MANHA" ? "Manhã" : "Tarde"}` : ""}</p>
          <p className="text-sm">{unit.estado === "REABERTO" ? "Revisão pendente — nova assinatura necessária" : unit.assinaturaVigente ? `Assinado por ${unit.assinaturaVigente.usuarioNome}` : unit.preenchimentoCompleto ? "Preenchimento salvo — aguardando assinatura" : "Preenchimento em andamento"}</p></div>
        <Link className="btn-secondary" href={url}>{unit.assinaturaVigente ? "Consultar registro" : "Abrir registro"}</Link>
      </li>;
    })}</ul>
  </section>;
}
