import type { Prisma } from "@prisma/client";

export const buffetItemOrder = [{ ordem: "asc" }, { nome: "asc" }, { id: "asc" }] satisfies Prisma.ControleBuffetAmostraItemOrderByWithRelationInput[];
export const buffetLinkedItemOrder = [{ item: { ordem: "asc" } }, { item: { nome: "asc" } }, { item: { id: "asc" } }] satisfies Prisma.ControleBuffetAmostraItemServicoOrderByWithRelationInput[];
export const buffetManagementItemOrder:Prisma.ControleBuffetAmostraItemOrderByWithRelationInput[]=[{ativo:"desc"},...buffetItemOrder];

// Reorder only known catalog slots; removed items keep their relative slots.
// The objects (classification/equipment/answers) always come from the manifest.
export function presentBuffetManifest<T extends { id: number }>(manifest: readonly T[], catalogInOrder: readonly { id: number }[]): T[] {
  const rank=new Map(catalogInOrder.map((item,index)=>[item.id,index]));
  const sorted=manifest.filter(item=>rank.has(item.id)).sort((a,b)=>rank.get(a.id)!-rank.get(b.id)!);
  let cursor=0;
  return manifest.map(item=>rank.has(item.id)?sorted[cursor++]:item);
}
