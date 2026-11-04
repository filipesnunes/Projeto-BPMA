import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/permissions";
import { refreshWorkflowActor } from "./workflow-adapter";
import { buffetItemOrder } from "./item-ordering";

type RevisionRow={id:number;nome:string;ativo:boolean;ordem:number;updatedAt:Date};
export function buffetCatalogRevision(items:readonly RevisionRow[]) {
  return createHash("sha256").update(JSON.stringify([...items].sort((a,b)=>a.id-b.id).map(item=>[item.id,item.nome,item.ativo,item.ordem,item.updatedAt.toISOString()]))).digest("hex");
}
export async function lockBuffetCatalog(tx:Prisma.TransactionClient,authenticated:AuthenticatedUser,expected:string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"amostras-catalog-order"}), 17326)`;
  const actor=await refreshWorkflowActor(tx,authenticated);
  if(!hasPermission(actor,"modulo.amostras.gerenciar_cadastros"))throw Error("Sem permissão para gerenciar os itens de Buffet / Amostras.");
  const items=await tx.controleBuffetAmostraItem.findMany({orderBy:buffetItemOrder});
  if(!/^[a-f0-9]{64}$/.test(expected)||buffetCatalogRevision(items)!==expected)throw Error("A lista de itens foi alterada. Recarregue antes de tentar novamente.");
  return items;
}
export async function writeActiveBuffetOrder(tx:Prisma.TransactionClient,ids:readonly number[]) {
  if(!ids.length)return;
  const values=Prisma.join(ids.map((id,index)=>Prisma.sql`(${id}::int,${index+1}::int)`));
  await tx.$executeRaw(Prisma.sql`UPDATE controle_buffet_amostra_item AS item
    SET ordem=positions.ordem, "updatedAt"=CURRENT_TIMESTAMP
    FROM (VALUES ${values}) AS positions(id,ordem)
    WHERE item.id=positions.id AND item.ativo=true AND item.ordem<>positions.ordem`);
}
