type ParsedImageUpload = {
  fileName: string;
  mimeType: string;
  base64: string;
};

type ParseImageUploadParams = {
  formData: FormData;
  key: string;
  required?: boolean;
  requiredMessage?: string;
  maxBytes?: number;
};

const DEFAULT_MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

export async function parseImageUploadFromFormData(
  params: ParseImageUploadParams
): Promise<ParsedImageUpload | null> {
  const value = params.formData.get(params.key);
  const required = params.required ?? false;
  const maxBytes = params.maxBytes ?? DEFAULT_MAX_IMAGE_BYTES;

  if (!(value instanceof File) || value.size === 0) {
    if (required) {
      throw new Error(
        params.requiredMessage ??
          "Envie uma imagem para concluir esta operação."
      );
    }

    return null;
  }

  if (!value.type.startsWith("image/")) {
    throw new Error("O arquivo enviado deve ser uma imagem.");
  }

  if (value.size > maxBytes) {
    throw new Error("A imagem excede o limite de 5MB.");
  }

  const buffer = Buffer.from(await value.arrayBuffer());

  return {
    fileName: value.name,
    mimeType: value.type,
    base64: buffer.toString("base64")
  };
}

export function getImageDataUrl(mimeType: string | null, base64: string | null): string | null {
  if (!mimeType || !base64) {
    return null;
  }

  return `data:${mimeType};base64,${base64}`;
}
