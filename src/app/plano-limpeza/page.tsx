import Link from "next/link";

import { ThemeToggleButton } from "./theme-toggle-button";

const CARD_CLASS =
  "rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900";

export default function PlanoLimpezaPage() {
  return (
    <div className="space-y-6 dark:text-slate-100">
      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Plano de Limpeza
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Controle das rotinas de limpeza diária e semanal.
            </p>
          </div>
          <ThemeToggleButton />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Link
          href="/plano-limpeza/diario"
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-300 hover:shadow dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-500"
        >
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Plano de Limpeza Diário
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Check diário por área, turno, assinaturas e status de execução.
          </p>
        </Link>

        <Link
          href="/plano-limpeza/semanal"
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-300 hover:shadow dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-500"
        >
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Plano de Limpeza Semanal
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Configuração de itens por área e execução semanal com assinaturas.
          </p>
        </Link>
      </section>
    </div>
  );
}
