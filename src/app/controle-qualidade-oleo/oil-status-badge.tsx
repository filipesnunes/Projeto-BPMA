import { StatusQualidadeOleo } from "@prisma/client";

import { getStatusLabel } from "./utils";

type OilStatusBadgeProps = {
  status: StatusQualidadeOleo;
  temperaturaCritica: boolean;
};

export function OilStatusBadge({ status, temperaturaCritica }: OilStatusBadgeProps) {
  const statusClass =
    status === StatusQualidadeOleo.ADEQUADO
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
      : status === StatusQualidadeOleo.ATENCAO
        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
        : status === StatusQualidadeOleo.ULTIMA_UTILIZACAO
          ? "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-200"
          : "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200";

  return (
    <div className="space-y-1">
      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass}`}>
        {getStatusLabel(status)}
      </span>
      {temperaturaCritica ? (
        <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          Temperatura Crítica
        </span>
      ) : null}
    </div>
  );
}