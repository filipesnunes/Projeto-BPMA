"use server";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getCurrentUserForAction } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { buffetCatalogRevision, lockBuffetCatalog, writeActiveBuffetOrder } from "../catalog-order";
import { buffetManagementItemOrder } from "../item-ordering";

export type BuffetOrderResult={ok:true;revision:string;positions:Array<{id:number;ordem:number;ativo:boolean}>}|{ok:false;message:string};
export async function saveBuffetItemOrderAction(input:unknown):Promise<BuffetOrderResult> {
  try {
    const actor=await getCurrentUserForAction();
    if(!input||typeof input!=="object"||!("ids" in input)||!("revision" in input)||!Array.isArray(input.ids)||typeof input.revision!=="string")throw Error("Sequência de itens inválida.");
    const ids:unknown[]=input.ids;
    if(ids.length>20000||ids.some(id=>typeof id!=="number"||!Number.isSafeInteger(id)||id<1)||new Set(ids).size!==ids.length)throw Error("A sequência contém IDs inválidos ou duplicados.");
    const revision=input.revision;
    const result=await prisma.$transaction(async tx=>{
      const items=await lockBuffetCatalog(tx,actor,revision),active=items.filter(item=>item.ativo);
      const allowed=new Set(active.map(item=>item.id));
      if(ids.length!==active.length||ids.some(id=>!allowed.has(id as number)))throw Error("Envie todos os itens ativos, sem incluir itens inativos ou desconhecidos.");
      await writeActiveBuffetOrder(tx,ids as number[]);
      const saved=await tx.controleBuffetAmostraItem.findMany({orderBy:buffetManagementItemOrder});
      return {revision:buffetCatalogRevision(saved),positions:saved.map(({id,ordem,ativo})=>({id,ordem,ativo}))};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    revalidatePath("/controle-buffet-amostras","layout");
    return {ok:true,...result};
  } catch(error) {
    return {ok:false,message:error instanceof Error&&!/prisma|p20\d{2}|transaction|stack/i.test(error.message)?error.message:"Não foi possível confirmar a nova ordem. Recarregue a lista e tente novamente."};
  }
}
