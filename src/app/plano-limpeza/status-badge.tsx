import { StatusPlanoLimpeza } from "@prisma/client";

function getStatusClass(status: StatusPlanoLimpeza): string {
  if (status === StatusPlanoLimpeza.CONCLUIDO) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
  }

  if (status === StatusPlanoLimpeza.AGUARDANDO_SUPERVISOR) {
    return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200";
  }

  return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200";
}

function getStatusLabel(status: StatusPlanoLimpeza): string {
  if (status === StatusPlanoLimpeza.CONCLUIDO) {
    return "Concluído";
  }
  if (status === StatusPlanoLimpeza.AGUARDANDO_SUPERVISOR) {
    return "Aguardando Supervisor";
  }
  return "Pendente";
}

export function StatusBadge({ status }: { status: StatusPlanoLimpeza }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusClass(status)}`}
    >
      {getStatusLabel(status)}
    </span>
  );
}
