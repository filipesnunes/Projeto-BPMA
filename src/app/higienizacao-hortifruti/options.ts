export const INITIAL_HORTIFRUTI_OPTIONS = [
  "Alface",
  "Rúcula",
  "Agrião",
  "Tomate",
  "Cebola",
  "Cenoura",
  "Pepino",
  "Morango"
] as const;

export const INITIAL_PRODUTO_UTILIZADO_OPTIONS = ["Cloro"] as const;

export function normalizeOption(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function normalizeCatalogName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function resolveAllowedOption(
  inputValue: string,
  options: readonly string[]
): string | null {
  const normalizedInput = normalizeOption(inputValue);

  if (!normalizedInput) {
    return null;
  }

  return (
    options.find((option) => normalizeOption(option) === normalizedInput) ?? null
  );
}
