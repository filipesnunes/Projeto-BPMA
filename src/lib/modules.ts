export type AppModule = {
  name: string;
  href: string;
};

export const modules: AppModule[] = [
  { name: "Higienização de Hortifruti", href: "/higienizacao-hortifruti" },
  {
    name: "Controle de Temperatura de Equipamentos",
    href: "/controle-temperatura-equipamentos"
  },
  { name: "Controle de Qualidade do Óleo", href: "/controle-qualidade-oleo" },
  {
    name: "Rastreabilidade de Recebimento",
    href: "/rastreabilidade-recebimento"
  },
  { name: "Controle de Buffet / Amostras", href: "/controle-buffet-amostras" },
  { name: "Plano de Limpeza", href: "/plano-limpeza" }
];
