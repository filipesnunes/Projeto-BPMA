import Link from "next/link";

import { PasswordInput } from "@/components/auth/password-input";

import { loginAction } from "./actions";

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

type SearchParams = Record<string, string | string[] | undefined>;
type LoginPageProps = {
  searchParams: Promise<SearchParams>;
};

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const feedback = firstParam(params.feedback).trim();
  const feedbackType = firstParam(params.feedbackType) === "error" ? "error" : "success";
  const next = firstParam(params.next).trim();

  return (
    <section className="flex min-h-screen items-center justify-center py-8 dark:text-slate-100">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-6 flex items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">BPMA App</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Acesso ao sistema</p>
          </div>
          <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            Ambiente de Testes
          </span>
        </div>

        {feedback ? (
          <div
            className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
              feedbackType === "error"
                ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
            }`}
          >
            {feedback}
          </div>
        ) : null}

        <form action={loginAction} className="space-y-4">
          <input type="hidden" name="next" value={next} />

          <label className="text-sm text-slate-700 dark:text-slate-200">
            Nome de Usuário
            <input
              type="text"
              name="nomeUsuario"
              required
              autoComplete="username"
              className={`${INPUT_CLASS} mt-1`}
            />
          </label>

          <PasswordInput
            name="senha"
            label="Senha"
            required
            className={INPUT_CLASS}
          />

          <button type="submit" className="btn-primary w-full">
            Entrar
          </button>
        </form>

        <div className="mt-4 text-center text-sm">
          <Link
            href="/login/esqueci-senha"
            className="text-slate-700 underline decoration-slate-400 hover:text-slate-900 dark:text-slate-200 dark:hover:text-white"
          >
            Esqueci Minha Senha
          </Link>
        </div>
      </div>
    </section>
  );
}
