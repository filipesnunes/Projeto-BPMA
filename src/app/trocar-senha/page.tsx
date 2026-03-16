import { PasswordInput } from "@/components/auth/password-input";

import { changeOwnPasswordAction } from "@/app/login/actions";

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

type SearchParams = Record<string, string | string[] | undefined>;
type TrocarSenhaPageProps = {
  searchParams: Promise<SearchParams>;
};

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export const dynamic = "force-dynamic";

export default async function TrocarSenhaPage({ searchParams }: TrocarSenhaPageProps) {
  const params = await searchParams;
  const feedback = firstParam(params.feedback).trim();
  const feedbackType = firstParam(params.feedbackType) === "error" ? "error" : "success";

  return (
    <section className="mx-auto w-full max-w-xl space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Troca Obrigatória de Senha
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Para continuar, confirme sua senha atual e defina uma nova senha.
        </p>
      </div>

      {feedback ? (
        <section
          className={`rounded-xl border px-4 py-3 text-sm ${
            feedbackType === "error"
              ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
              : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
          }`}
        >
          {feedback}
        </section>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <form action={changeOwnPasswordAction} className="space-y-4">
          <PasswordInput
            name="senhaAtual"
            label="Senha Atual"
            required
            className={INPUT_CLASS}
          />
          <PasswordInput
            name="novaSenha"
            label="Nova Senha"
            required
            className={INPUT_CLASS}
          />
          <PasswordInput
            name="confirmarNovaSenha"
            label="Confirmar Nova Senha"
            required
            className={INPUT_CLASS}
          />
          <button type="submit" className="btn-primary w-full">
            Salvar Nova Senha
          </button>
        </form>
      </section>
    </section>
  );
}
