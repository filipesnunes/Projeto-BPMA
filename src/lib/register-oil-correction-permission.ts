import "server-only";
import { PERMISSION_DEFINITIONS } from "./permissions";
import { prisma } from "@/lib/prisma";
// Catalog metadata only. Existing profile grants are NEVER changed by a login.
export async function registerOilCorrectionPermission() {
  const codes=["modulo.oleo.editar_registros_mes_vigente","modulo.oleo.reabrir_registro"];
  for(const code of codes) {
    const definition=PERMISSION_DEFINITIONS.find(permission=>permission.codigo===code)!;
    const existing=await prisma.permissao.findUnique({where:{codigo:code}});
    if(!existing || existing.nome!==definition.nome || existing.descricao!==definition.descricao) {
      await prisma.permissao.upsert({where:{codigo:code},create:definition,update:definition});
    }
  }
}

