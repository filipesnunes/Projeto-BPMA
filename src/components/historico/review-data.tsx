import type { Prisma } from "@prisma/client";

const labels: Record<string,string> = { id:"Registro", itemNome:"Item", nome:"Nome", equipamento:"Equipamento", data:"Data operacional", dataExecucao:"Data de execução",
  primeiraTc:"Temperatura do alimento", tcEquipamento:"Temperatura do equipamento", temperatura:"Temperatura", temperaturaAmbiente:"Temperatura ambiente", percentualFita:"Percentual da fita",
  observacao:"Observação", observacoes:"Observações", acaoCorretiva:"Ação corretiva", horarioExecucao:"Horário de execução", horarioNaoInformado:"Horário não informado", justificativaHorario:"Justificativa do horário",
  assinaturaResponsavel:"Executor declarado", responsavel:"Responsável", responsavelNome:"Responsável", status:"Situação", turno:"Turno", records:"Registros", itens:"Itens", area:"Área", atividade:"Atividade" };
export function ReviewData({value}:{value:Prisma.JsonValue}) {
  if (value===null) return <span>Não informado</span>;
  if (Array.isArray(value)) return <div className="space-y-3">{value.map((entry,index)=><div key={index} className="rounded border p-3"><ReviewData value={entry}/></div>)}</div>;
  if (typeof value==="object") return <dl className="grid gap-2 sm:grid-cols-2">{Object.entries(value).filter(([key])=> !/fluxo|versao|createdAt|updatedAt|exclui|foto|imagem|hash|(^id$)|Id$|bytes|mime/i.test(key)).map(([key,entry])=><div key={key} className="min-w-0 break-words"><dt className="text-xs text-slate-500">{labels[key]??key.replace(/([A-Z])/g," $1")}</dt><dd><ReviewData value={entry??null}/></dd></div>)}</dl>;
  return <span>{typeof value==="boolean" ? value?"Sim":"Não" : String(value)}</span>;
}

export function ReviewAudit({value}:{value:string|null}) {
  try {
    const evidence=JSON.parse(value??"") as {natureza?:string;ressalvas?:string[];justificativa?:string};
    return <div><p>{evidence.natureza}</p><p>{evidence.justificativa}</p><ul>{evidence.ressalvas?.map((warning,index)=><li key={index}>{warning}</li>)}</ul></div>;
  } catch { return <span>{value}</span>; }
}
