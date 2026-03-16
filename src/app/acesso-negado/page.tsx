import Link from "next/link";

export const dynamic = "force-dynamic";

export default function AcessoNegadoPage() {
  return (
    <section className="mx-auto w-full max-w-2xl space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-800 shadow-sm dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        <h1 className="text-xl font-semibold">Acesso Negado</h1>
        <p className="mt-2 text-sm">
          Seu perfil não possui permissão para acessar esta página.
        </p>
      </div>

      <Link href="/" className="btn-secondary">
        Voltar para Início
      </Link>
    </section>
  );
}
