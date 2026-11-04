import "server-only";
import { prisma } from "@/lib/prisma";
import type { PerfilUsuario } from "@prisma/client";

// Presentation only. Never persist these aliases or manufacture a signature.
// Legacy columns are not evidence of a current versioned signature.
export async function currentRecordSignatures<T extends { fluxoId?: string | null }>(rows: T[], module: "temperatura" | "oleo" | "amostras"): Promise<T[]> {
  const ids = [...new Set(rows.flatMap(row => row.fluxoId ? [row.fluxoId] : []))];
  if (!ids.length) return rows;
  const units = await prisma.fluxoOperacional.findMany({where:{id:{in:ids},modulo:module,excluidoEm:null},include:{assinaturaVigente:true}});
  const byId = new Map(units.map(unit => [unit.id, unit]));
  return rows.map(row => {
    if (!row.fluxoId) return row;
    const unit = byId.get(row.fluxoId);
    const signature = unit?.estado === "FECHADO" ? unit.assinaturaVigente : null;
    const fields = module === "oleo" ? { assinaturaSupervisorNome:signature?.usuarioNome??null, assinaturaSupervisorEm:signature?.assinadoEm??null, assinaturaSupervisorPerfil:signature?.usuarioPerfil??null }
      : { assinaturaNutricionistaNome:signature?.usuarioNome??null, assinaturaNutricionistaDataHora:signature?.assinadoEm??null, assinaturaNutricionistaPerfil:signature?.usuarioPerfil??null };
    return { ...row, ...fields };
  });
}

// A blanket signature from the old model cannot imply that newer versions were
// signed. Keep the original evidence in storage, and scope its display honestly.
type DaySignatureView = { dataReferencia: Date; usuarioNomeSnapshot: string; usuarioPerfilSnapshot: PerfilUsuario | null; assinadoEm: Date; observacao?: string | null };
export async function scopedLegacyDaySignatures(signatures: DaySignatureView[], module: string, dates = signatures.map(signature=>signature.dataReferencia)): Promise<DaySignatureView[]> {
  if (!dates.length) return signatures;
  const where = {data:{in:dates},fluxoId:null};
  const [units,legacy] = await Promise.all([
    prisma.fluxoOperacional.findMany({where:{modulo:module,excluidoEm:null,dataReferencia:{in:dates}},include:{assinaturaVigente:true}}),
    module === "temperatura" ? prisma.controleTemperaturaEquipamento.findMany({where,select:{data:true}})
      : module === "oleo" ? prisma.controleQualidadeOleoRegistro.findMany({where,select:{data:true}})
      : module === "amostras" ? prisma.controleBuffetAmostraRegistro.findMany({where,select:{data:true}})
      : prisma.rastreabilidadeRecebimentoNota.findMany({where,select:{data:true}})
  ]);
  const key = (date:Date)=>date.toISOString().slice(0,10);
  const legacyDays = new Set(legacy.map(row=>key(row.data)));
  const old = new Map(signatures.map(signature=>[key(signature.dataReferencia),signature]));
  const result:DaySignatureView[] = [];
  for (const date of new Map(dates.map(date=>[key(date),date])).values()) {
    const day = key(date), scoped = units.filter(unit=>key(unit.dataReferencia)===day);
    const previous = old.get(day);
    if (!scoped.length) { if (previous) result.push(previous); continue; }
    if (scoped.some(unit=>unit.estado!=="FECHADO"||!unit.assinaturaVigente)) continue;
    if (legacyDays.has(day)) { if (previous) result.push(previous); continue; }
    // Display a summary of real current evidence, without creating a daily row.
    const evidence = scoped.map(unit=>unit.assinaturaVigente!).sort((a,b)=>+b.assinadoEm-+a.assinadoEm);
    const names = [...new Set(evidence.map(signature=>signature.usuarioNome))];
    result.push({dataReferencia:date,usuarioNomeSnapshot:names.join(", "),usuarioPerfilSnapshot:names.length===1?evidence[0].usuarioPerfil as PerfilUsuario:null,assinadoEm:evidence[0].assinadoEm,observacao:`Resumo de assinaturas vigentes: ${[...new Set(evidence.map(signature=>signature.id))].join(", ")}`});
  }
  return result;
}
