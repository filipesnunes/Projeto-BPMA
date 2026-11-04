import { prisma } from "@/lib/prisma";
import { formatAppDateTime } from "@/lib/date-time";

export async function BuffetSignatureHistory({flowId,currentId}:{flowId:string;currentId:string|null}){
  const links=await prisma.fluxoAssinaturaVinculo.findMany({where:{fluxoId:flowId},include:{assinatura:true},orderBy:{versao:"desc"}});
  if(!links.length)return null;
  return <details className="bpma-card"><summary>Assinaturas do serviço — atuais e anteriores</summary><ul className="space-y-2">{links.map(link=><li key={link.assinaturaId}>
    {link.assinatura.usuarioNome} — {formatAppDateTime(link.assinatura.assinadoEm)} — versão {link.versao} — {link.assinatura.mecanismo} — {link.assinaturaId===currentId?"Vigente":"Histórica; não valida a versão atual"}
  </li>)}</ul></details>;
}
