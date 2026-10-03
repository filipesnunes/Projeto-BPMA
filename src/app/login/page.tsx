import Link from "next/link";

import { PasswordInput } from "@/components/auth/password-input";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/app-branding";

import { loginAction } from "./actions";

const INPUT_CLASS =
  "bpma-input";

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
      <div className="w-full max-w-md bpma-card">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{APP_NAME}</h1>
          <p className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-300">
            {APP_DESCRIPTION}
          </p>
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
