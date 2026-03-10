import Link from "next/link";

import { modules } from "@/lib/modules";

export default function HomePage() {
  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">BPMA App</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-300">
          Selecione um módulo no menu lateral para iniciar.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {modules.map((module) => (
          <Link
            key={module.href}
            href={module.href}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">{module.name}</h2>
          </Link>
        ))}
      </div>
    </section>
  );
}
