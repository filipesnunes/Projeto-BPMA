import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ReportIdentity } from "@/lib/report-identity";
import { parseHotelLogo } from "@/lib/hotel-logo-upload";
import { logoDimensionsFromForm, normalizeLogoDimensions } from "@/lib/logo-dimensions";

export function defaultUnitName(): string {
  return process.env.STAYSAFE_UNIT_NAME?.trim() || process.env.BPMA_UNIT_NAME?.trim() || "Unidade não informada";
}

export async function getVisualPersonalization() {
  try {
    return await prisma.personalizacaoVisual.findUnique({ where: { id: 1 } });
  } catch (error) {
    // Read only the previous fields during the rollout of the dimensions migration.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022" &&
      /logoLargura|logoAlturaMaxima/.test(String(error.meta?.column ?? error.message))) {
      const previous = await prisma.personalizacaoVisual.findUnique({ where: { id: 1 }, select: {
        id: true, nomeUnidade: true, logoDados: true, logoMimeType: true, logoNomeArquivo: true,
        atualizadoPorUsuarioId: true, criadoEm: true, atualizadoEm: true
      } });
      return previous ? { ...previous, ...normalizeLogoDimensions({}) } : null;
    }
    // Optional visual settings must not break existing reports before their first migration.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021" &&
      String(error.meta?.table ?? error.message).includes("personalizacao_visual")) return null;
    throw error;
  }
}

export async function getReportIdentity(): Promise<ReportIdentity> {
  const config = await getVisualPersonalization();
  const mime = config?.logoMimeType;
  const supported = mime && ["image/png", "image/jpeg", "image/webp"].includes(mime);
  return {
    ...normalizeLogoDimensions(config ?? {}),
    unitName: config?.nomeUnidade?.trim() || defaultUnitName(),
    logoDataUrl: supported && config?.logoDados?.length
      ? `data:${mime};base64,${Buffer.from(config.logoDados).toString("base64")}` : null
  };
}

// Called only by the administrative actions after their authorization check.
export async function saveVisualPersonalization(formData: FormData, userId: number) {
  const rawName = formData.get("nomeUnidade");
  if (rawName != null && typeof rawName !== "string") throw new Error("Informe um nome de unidade válido.");
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (name.length > 120 || /[\x00-\x1f\x7f]/.test(name)) throw new Error("Informe um nome de unidade válido, com até 120 caracteres.");
  const logo = await parseHotelLogo(formData);
  const data = { nomeUnidade: name || null, atualizadoPorUsuarioId: userId, ...logoDimensionsFromForm(formData),
    ...(logo ? { logoDados: Uint8Array.from(logo.buffer), logoMimeType: logo.mimeType, logoNomeArquivo: logo.fileName } : {}) };
  return prisma.personalizacaoVisual.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
}

export async function removeHotelLogo(userId: number) {
  // Update only the image fields; an existing unit name is preserved.
  return prisma.personalizacaoVisual.upsert({ where: { id: 1 },
    create: { id: 1, atualizadoPorUsuarioId: userId },
    update: { logoDados: null, logoMimeType: null, logoNomeArquivo: null, atualizadoPorUsuarioId: userId }
  });
}

export async function restoreVisualDefaults(userId: number) {
  const data = { nomeUnidade: null, logoDados: null, logoMimeType: null, logoNomeArquivo: null, atualizadoPorUsuarioId: userId,
    ...normalizeLogoDimensions({}) };
  return prisma.personalizacaoVisual.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
}
