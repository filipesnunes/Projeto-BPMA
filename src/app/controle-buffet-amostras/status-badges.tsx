import type {
  StatusItemBuffetAmostra,
  StatusTemperaturaBuffetAmostra
} from "@prisma/client";

import type { StatusServicoBuffet } from "./utils";
import {
  getStatusItemLabel,
  getStatusServicoLabel,
  getStatusTemperaturaLabel
} from "./utils";

type ServiceStatusBadgeProps = {
  status: StatusServicoBuffet;
};

type ItemStatusBadgeProps = {
  status: StatusItemBuffetAmostra;
};

type TemperatureStatusBadgeProps = {
  status: StatusTemperaturaBuffetAmostra | null;
};

export function ServiceStatusBadge({ status }: ServiceStatusBadgeProps) {
  const statusClass =
    status === "CONCLUIDO"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
      : status === "PARCIAL"
        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
        : "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass}`}
    >
      {getStatusServicoLabel(status)}
    </span>
  );
}

export function ItemStatusBadge({ status }: ItemStatusBadgeProps) {
  const statusClass =
    status === "ASSINADO"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
      : status === "PREENCHIDO"
        ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200"
        : "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass}`}
    >
      {getStatusItemLabel(status)}
    </span>
  );
}

export function TemperatureStatusBadge({ status }: TemperatureStatusBadgeProps) {
  if (!status) {
    return <span className="text-xs text-slate-500 dark:text-slate-400">-</span>;
  }

  const statusClass =
    status === "CONFORME"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
      : status === "ALERTA"
        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
        : "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass}`}
    >
      {getStatusTemperaturaLabel(status)}
    </span>
  );
}
