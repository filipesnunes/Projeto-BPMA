export const INITIAL_RECEBIMENTO_CATEGORIAS = [
  { nome: "Congelados", temperaturaMaxima: -12 },
  { nome: "Pescados", temperaturaMaxima: 3 },
  { nome: "Carnes", temperaturaMaxima: 7 },
  {
    nome: "Alimentos prontos preparados com carnes e pescados crus",
    temperaturaMaxima: 5
  },
  { nome: "Demais produtos", temperaturaMaxima: 10 },
  {
    nome: "Produtos de panificação e confeitaria com recheios refrigerados",
    temperaturaMaxima: 5
  }
] as const;

export const RECEBIMENTO_ORIENTACOES = [
  "Transporte e entregador adequados: veículo limpo e em bom estado, entregador uniformizado e limpo.",
  "Embalagem adequada: íntegra, sem furos, amassamentos, ferrugens, trincas, com rótulo íntegro e legível.",
  "Aspecto sensorial adequado: sem mau cheiro, sem sinais de descongelamento e sem bolor.",
  "Se temperatura, transporte, aspecto sensorial ou embalagem estiverem em não conformidade, ação corretiva é obrigatória."
] as const;

export function normalizeCatalogName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeOption(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}
