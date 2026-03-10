import { StatusTemperaturaEquipamento } from "@prisma/client";

import { getStatusLabel } from "./utils";

type TemperatureStatusBadgeProps = {
  status: StatusTemperaturaEquipamento;
};

export function TemperatureStatusBadge({ status }: TemperatureStatusBadgeProps) {
  const className =
    status === StatusTemperaturaEquipamento.CONFORME
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
      : status === StatusTemperaturaEquipamento.ALERTA
        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
        : "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200";

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}>
      {getStatusLabel(status)}
    </span>
  );
}