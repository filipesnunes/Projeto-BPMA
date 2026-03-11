import { TipoOpcaoHigienizacao } from "@prisma/client";
import Link from "next/link";

import { prisma } from "@/lib/prisma";

import {
  createCatalogOptionAction,
  deleteCatalogOptionAction
} from "../actions";
import { ThemeToggleButton } from "../theme-toggle-button";

const PAGE_PATH = "/higienizacao-hortifruti/opcoes";
const CARD_CLASS =
  "rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900";
const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = { searchParams: Promise<SearchParams> };

export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function HigienizacaoHortifrutiOpcoesPage({
  searchParams
}: PageProps) {
  const params = await searchParams;
  const feedback = firstParam(params.feedback).trim();
  const feedbackType = firstParam(params.feedbackType) === "error" ? "error" : "success";

  const options = await prisma.higienizacaoHortifrutiOpcao.findMany({
    orderBy: [{ tipo: "asc" }, { nome: "asc" }]
  });

  const hortifrutiOptions = options.filter(
    (option) => option.tipo === TipoOpcaoHigienizacao.HORTIFRUTI
  );
  const produtoOptions = options.filter(
    (option) => option.tipo === TipoOpcaoHigienizacao.PRODUTO_UTILIZADO
  );

  return (
    <div className="space-y-6 dark:text-slate-100">
      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Gerenciar Opções
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Gerencie itens de Hortifruti e Produto Utilizado.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/higienizacao-hortifruti" className="btn-secondary">
              Voltar para Módulo
            </Link>
            <ThemeToggleButton />
          </div>
        </div>
      </section>

      {feedback ? (
        <section
          className={`rounded-xl border p-4 text-sm ${
            feedbackType === "error"
              ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
              : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
          }`}
        >
          {feedback}
        </section>
      ) : null}

      <section className={CARD_CLASS}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Hortifruti
            </h2>
            <form action={createCatalogOptionAction} className="mt-3 flex gap-2">
              <input type="hidden" name="tipo" value={TipoOpcaoHigienizacao.HORTIFRUTI} />
              <input type="hidden" name="returnTo" value={PAGE_PATH} />
              <input
                type="text"
                name="nome"
                required
                placeholder="Novo item de hortifruti"
                className={INPUT_CLASS}
              />
              <button type="submit" className="btn-primary">
                Adicionar
              </button>
            </form>
            <ul className="mt-3 space-y-2">
              {hortifrutiOptions.length === 0 ? (
                <li className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  Nenhum item de hortifruti cadastrado.
                </li>
              ) : (
                hortifrutiOptions.map((option) => (
                  <li
                    key={option.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
                  >
                    <span>{option.nome}</span>
                    <form action={deleteCatalogOptionAction}>
                      <input type="hidden" name="optionId" value={option.id} />
                      <input type="hidden" name="returnTo" value={PAGE_PATH} />
                      <button
                        type="submit"
                        className="btn-danger"
                      >
                        Excluir
                      </button>
                    </form>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Produto Utilizado
            </h2>
            <form action={createCatalogOptionAction} className="mt-3 flex gap-2">
              <input
                type="hidden"
                name="tipo"
                value={TipoOpcaoHigienizacao.PRODUTO_UTILIZADO}
              />
              <input type="hidden" name="returnTo" value={PAGE_PATH} />
              <input
                type="text"
                name="nome"
                required
                placeholder="Novo produto de limpeza"
                className={INPUT_CLASS}
              />
              <button type="submit" className="btn-primary">
                Adicionar
              </button>
            </form>
            <ul className="mt-3 space-y-2">
              {produtoOptions.length === 0 ? (
                <li className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  Nenhum produto utilizado cadastrado.
                </li>
              ) : (
                produtoOptions.map((option) => (
                  <li
                    key={option.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
                  >
                    <span>{option.nome}</span>
                    <form action={deleteCatalogOptionAction}>
                      <input type="hidden" name="optionId" value={option.id} />
                      <input type="hidden" name="returnTo" value={PAGE_PATH} />
                      <button
                        type="submit"
                        className="btn-danger"
                      >
                        Excluir
                      </button>
                    </form>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
