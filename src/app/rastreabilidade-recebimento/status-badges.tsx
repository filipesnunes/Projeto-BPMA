type ConformidadeValue = "CONFORME" | "NAO_CONFORME" | null;
type StatusValue = "PENDENTE" | "CONFORME" | "NAO_CONFORME";

function getConformidadeClass(value: ConformidadeValue): string {
  if (value === "CONFORME") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
  }

  if (value === "NAO_CONFORME") {
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200";
  }

  return "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300";
}

function getConformidadeLabel(value: ConformidadeValue): string {
  if (value === "CONFORME") {
    return "Conforme";
  }

  if (value === "NAO_CONFORME") {
    return "Não Conforme";
  }

  return "Pendente";
}

function getStatusClass(value: StatusValue): string {
  if (value === "CONFORME") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
  }

  if (value === "NAO_CONFORME") {
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200";
  }

  return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200";
}

function getStatusLabel(value: StatusValue): string {
  if (value === "CONFORME") {
    return "Conforme";
  }

  if (value === "NAO_CONFORME") {
    return "Não Conforme";
  }

  return "Pendente";
}

export function ConformidadeBadge({ value }: { value: ConformidadeValue }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getConformidadeClass(value)}`}
    >
      {getConformidadeLabel(value)}
    </span>
  );
}

export function StatusRecebimentoBadge({ value }: { value: StatusValue }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusClass(value)}`}
    >
      {getStatusLabel(value)}
    </span>
  );
}
