export const LOGO_WIDTH = { default: 120, min: 40, max: 240 };
export const LOGO_HEIGHT = { default: 56, min: 24, max: 120 };

export function normalizeLogoDimensions(values: { logoLargura?: unknown; logoAlturaMaxima?: unknown }) {
  const safe = (value: unknown, limits: typeof LOGO_WIDTH) =>
    typeof value === "number" && Number.isInteger(value) && value >= limits.min && value <= limits.max
      ? value : limits.default;
  return { logoLargura: safe(values.logoLargura, LOGO_WIDTH), logoAlturaMaxima: safe(values.logoAlturaMaxima, LOGO_HEIGHT) };
}

export function logoDimensionsFromForm(formData: FormData) {
  const number = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" && value.trim() ? Number(value) : undefined;
  };
  return normalizeLogoDimensions({logoLargura: number("logoLargura"), logoAlturaMaxima: number("logoAlturaMaxima")});
}
