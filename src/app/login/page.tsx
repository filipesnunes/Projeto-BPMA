import Link from "next/link";
import Image from "next/image";

import { PasswordInput } from "@/components/auth/password-input";
import { APP_DESCRIPTION } from "@/lib/app-branding";

import { loginAction } from "./actions";
import styles from "./login.module.css";

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
    <section className={styles.page}>
      <div className={styles.card}>
        <header className={styles.header}>
          <h1 className={styles.brand}>
            <Image src="/logo-staysafe.webp" alt="StaySafe" width={384} height={216}
              className={styles.logo} sizes="(max-width: 380px) calc(100vw - 80px), 330px" priority />
          </h1>
          <p className={styles.slogan}>
            {APP_DESCRIPTION}
          </p>
        </header>

        {feedback ? (
          <div
            className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
              feedbackType === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {feedback}
          </div>
        ) : null}

        <form action={loginAction} className={styles.form}>
          <input type="hidden" name="next" value={next} />

          <label>
            Nome de Usuário
            <input
              type="text"
              name="nomeUsuario"
              required
              autoComplete="username"
              className={styles.input}
            />
          </label>

          <PasswordInput
            name="senha"
            label="Senha"
            required
            className={styles.input}
          />

          <button type="submit" className={styles.submit}>
            Entrar
          </button>
        </form>

        <div className={styles.recovery}>
          <Link
            href="/login/esqueci-senha"
            className={styles.recoveryLink}
          >
            Esqueci Minha Senha
          </Link>
        </div>
      </div>
      <p className={styles.poweredBy}>POWERED BY BOTSTAY</p>
    </section>
  );
}
