import "server-only";
import sharp from "sharp";
import { parseImageUploadFromFormData } from "@/lib/image-upload";

export const HOTEL_LOGO_MAX_BYTES = 2 * 1024 * 1024;
const FORMATS: Record<string, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" };

export async function parseHotelLogo(formData: FormData) {
  const value = formData.get("logoHotel");
  if (value == null || (value instanceof File && value.size === 0 && !value.name)) return null;
  if (!(value instanceof File) || value.size === 0) throw new Error("Selecione uma imagem válida para a logomarca.");
  const upload = await parseImageUploadFromFormData({ formData, key: "logoHotel", maxBytes: HOTEL_LOGO_MAX_BYTES });
  if (!upload) return null;
  try {
    const decoder = sharp(upload.buffer, { failOn: "warning", limitInputPixels: 16_000_000 });
    const metadata = await decoder.metadata();
    const mimeType = FORMATS[metadata.format ?? ""];
    if (!mimeType || !metadata.width || !metadata.height || (metadata.pages ?? 1) > 1) throw new Error();
    if (upload.mimeType !== mimeType && !(mimeType === "image/jpeg" && upload.mimeType === "image/jpg")) throw new Error();
    // Metadata alone does not guarantee that pixel data is intact.
    await decoder.raw().toBuffer();
    return { buffer: upload.buffer, mimeType, fileName: upload.fileName.slice(0, 180) };
  } catch {
    throw new Error("Imagem inválida. Selecione uma logomarca PNG, JPG ou WebP estática e íntegra.");
  }
}
