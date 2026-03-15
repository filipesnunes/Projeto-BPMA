import { StatusPlanoLimpeza } from "@prisma/client";

export type PlanoLimpezaDisplayStatus =
  | StatusPlanoLimpeza
  | "Pendente"
  | "Aguardando Supervisor"
  | "Concluído"
  | "Parcial";

function getStatusClass(status: PlanoLimpezaDisplayStatus): string {
  if (status === "Parcial") {
    return "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200";
  }

  if (status === StatusPlanoLimpeza.CONCLUIDO || status === "Concluído") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
  }

  if (
    status === StatusPlanoLimpeza.AGUARDANDO_SUPERVISOR ||
    status === "Aguardando Supervisor"
  ) {
    return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200";
  }

  return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200";
}

function getStatusLabel(status: PlanoLimpezaDisplayStatus): string {
  if (status === "Parcial") {
    return "Parcial";
  }

  if (status === StatusPlanoLimpeza.CONCLUIDO || status === "Concluído") {
    return "Concluído";
  }
  if (
    status === StatusPlanoLimpeza.AGUARDANDO_SUPERVISOR ||
    status === "Aguardando Supervisor"
  ) {
    return "Aguardando Supervisor";
  }
  return "Pendente";
}

export function StatusBadge({ status }: { status: PlanoLimpezaDisplayStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusClass(status)}`}
    >
      {getStatusLabel(status)}
    </span>
  );
}
