import { ModuloDocumento } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export async function getExigirFotoEmAlertaCritico(): Promise<boolean> {
  const config = await prisma.moduloConfiguracao.findUnique({
    where: { modulo: ModuloDocumento.CONTROLE_TEMPERATURA },
    select: { exigirFotoEmAlertaCritico: true }
  });
  return config?.exigirFotoEmAlertaCritico ?? true;
}
