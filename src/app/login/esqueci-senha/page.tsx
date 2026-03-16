import Link from "next/link";

import { requestPasswordResetAction } from "@/app/login/actions";

const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

type SearchParams = Record<string, string | string[] | undefined>;
type ForgotPageProps = {
  searchParams: Promise<SearchParams>;
};

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export const dynamic = "force-dynamic";

export default async function EsqueciSenhaPage({ searchParams }: ForgotPageProps) {
  const params = await searchParams;
  const feedback = firstParam(params.feedback).trim();
  const feedbackType = firstParam(params.feedbackType) === "error" ? "error" : "success";

  return (
    <section className="flex min-h-screen items-center justify-center py-8 dark:text-slate-100">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Solicitar Redefinição de Senha
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Essa solicitação será enviada para tratativa interna.
        </p>

        {feedback ? (
          <div
            className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
              feedbackType === "error"
                ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
            }`}
          >
            {feedback}
          </div>
        ) : null}

        <form action={requestPasswordResetAction} className="mt-4 space-y-4">
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Nome de Usuário
            <input type="text" name="nomeUsuario" required className={INPUT_CLASS} />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Nome Completo
            <input type="text" name="nomeCompleto" required className={INPUT_CLASS} />
          </label>
          <button type="submit" className="btn-primary w-full">
            Solicitar Redefinição
          </button>
        </form>

        <div className="mt-4 text-center text-sm">
          <Link
            href="/login"
            className="text-slate-700 underline decoration-slate-400 hover:text-slate-900 dark:text-slate-200 dark:hover:text-white"
          >
            Voltar para Login
          </Link>
        </div>
      </div>
    </section>
  );
}
