import { StatusPlanoLimpeza, TurnoPlanoLimpeza } from "@prisma/client";

export const DAILY_AREAS = [
  "Almoxarifado",
  "Área de Louças",
  "Área de Polimento",
  "Cozinha Central",
  "Garde Manger",
  "Garde Menger 2",
  "Refeitório",
  "Restaurante",
  "Cozinha"
] as const;

export const WEEKLY_AREAS = [
  "Cozinha Central",
  "Açougue",
  "Área de Hortifruti",
  "Área de Louças",
  "Confeitarias",
  "Garde Manger",
  "Bar Lobby e Restaurante",
  "Ático",
  "Room Service",
  "Refeitório",
  "Almoxarifado de Bebidas"
] as const;

export const WEEKLY_DAY_OPTIONS = [
  { value: "SEGUNDA", label: "Segunda-feira" },
  { value: "TERCA", label: "Terça-feira" },
  { value: "QUARTA", label: "Quarta-feira" },
  { value: "QUINTA", label: "Quinta-feira" },
  { value: "SEXTA", label: "Sexta-feira" },
  { value: "SABADO", label: "Sábado" },
  { value: "DOMINGO", label: "Domingo" }
] as const;

export const MONTH_OPTIONS = [
  { value: 1, label: "Janeiro" },
  { value: 2, label: "Fevereiro" },
  { value: 3, label: "Março" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Maio" },
  { value: 6, label: "Junho" },
  { value: 7, label: "Julho" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Setembro" },
  { value: 10, label: "Outubro" },
  { value: 11, label: "Novembro" },
  { value: 12, label: "Dezembro" }
];

export const TURNO_OPTIONS: Array<{ value: TurnoPlanoLimpeza; label: string }> = [
  { value: TurnoPlanoLimpeza.MANHA, label: "Manhã" },
  { value: TurnoPlanoLimpeza.TARDE, label: "Tarde" },
  { value: TurnoPlanoLimpeza.NOITE, label: "Noite" }
];

export const DAILY_STATUS_OPTIONS: Array<{ value: StatusPlanoLimpeza; label: string }> = [
  { value: StatusPlanoLimpeza.PENDENTE, label: "Pendente" },
  {
    value: StatusPlanoLimpeza.AGUARDANDO_SUPERVISOR,
    label: "Aguardando Supervisor"
  },
  { value: StatusPlanoLimpeza.CONCLUIDO, label: "Concluído" }
];

export const WEEKLY_STATUS_OPTIONS: Array<{ value: StatusPlanoLimpeza; label: string }> = [
  { value: StatusPlanoLimpeza.PENDENTE, label: "Pendente" },
  {
    value: StatusPlanoLimpeza.AGUARDANDO_SUPERVISOR,
    label: "Aguardando Supervisor"
  },
  { value: StatusPlanoLimpeza.CONCLUIDO, label: "Concluído" }
];
