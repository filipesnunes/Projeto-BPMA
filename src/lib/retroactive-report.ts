import "server-only";
import { prisma } from "./prisma";
import { formatAppDateTime } from "./date-time";
import type { OperationalSignatureModuleCode } from "./module-signatures";
const escape = (text: unknown) => String(text??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
export async function appendRetroactiveReviews(html: string, module: OperationalSignatureModuleCode, month: number, year: number) {
  const prefix=`${year}-${String(month).padStart(2,"0")}-`;
  const logs=await prisma.logAssinatura.findMany({where:{modulo:module,referenciaId:{startsWith:prefix},observacao:{contains:'"REVISAO_RETROATIVA"'}},orderBy:{assinadoEm:"asc"}});
  if(!logs.length)return html;
  const entries=logs.map(log=>{
    const evidence=JSON.parse(log.observacao!) as {natureza:string;justificativa:string;ressalvas:string[];fluxoId?:string;versao?:number;registros?:number[]};
    return `<article><p><strong>${escape(evidence.natureza)}</strong> — ${escape(log.nomeCompleto)} em ${escape(formatAppDateTime(log.assinadoEm))}. Data operacional: ${escape(log.referenciaId)}.</p><p>${escape(evidence.justificativa)}</p><ul>${evidence.ressalvas.map(w=>`<li>${escape(w)}</li>`).join("")}</ul></article>`;
  }).join("");
  return html.replace("</body>",`<section style="margin-top:20px;font-size:11px"><h2>Trilha de revisões retroativas</h2><p>Estas revisões foram realizadas nas datas indicadas. A situação vigente de cada registro permanece indicada na tabela.</p>${entries}</section></body>`);
}
