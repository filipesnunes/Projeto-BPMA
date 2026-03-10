import Link from "next/link";

import { prisma } from "@/lib/prisma";

import {
  createCategoryAction,
  toggleCategoryStatusAction,
  updateCategoryAction
} from "../actions";
import { ensureInitialReceivingCategories } from "../catalog";
import { ThemeToggleButton } from "../theme-toggle-button";
import { parsePositiveInt } from "../utils";

const PAGE_PATH = "/rastreabilidade-recebimento/opcoes";
const CARD_CLASS =
  "rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900";
const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = { searchParams: Promise<SearchParams> };

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function RastreabilidadeRecebimentoOpcoesPage({
  searchParams
}: PageProps) {
  await ensureInitialReceivingCategories();

  const params = await searchParams;
  const feedback = firstParam(params.feedback).trim();
  const feedbackType = firstParam(params.feedbackType) === "error" ? "error" : "success";
  const editCategoriaId = parsePositiveInt(firstParam(params.editCategoriaId));

  const categorias = await prisma.rastreabilidadeRecebimentoCategoria.findMany({
    orderBy: [{ ativo: "desc" }, { nome: "asc" }]
  });

  return (
    <div className="space-y-6 dark:text-slate-100">
      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Categorias e Limites de Temperatura
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Cadastre e mantenha os limites de temperatura por categoria de produto.
            </p>
          </div>
          <div className="btn-group">
            <Link href="/rastreabilidade-recebimento" className="btn-secondary">
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
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Nova Categoria</h2>
        <form action={createCategoryAction} className="mt-3 grid gap-3 md:grid-cols-3">
          <input type="hidden" name="returnTo" value={PAGE_PATH} />
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Nome *
            <input type="text" name="nome" required className={INPUT_CLASS} />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Temperatura Máxima (°C) *
            <input type="text" name="temperaturaMaxima" required inputMode="decimal" className={INPUT_CLASS} />
          </label>
          <div className="md:flex md:items-end">
            <button type="submit" className="btn-primary">Adicionar</button>
          </div>
        </form>
      </section>

      <section className={CARD_CLASS}>
        <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-slate-100">
          Categorias Cadastradas
        </h2>
        <ul className="space-y-3">
          {categorias.map((categoria) => {
            const isEditing = editCategoriaId === categoria.id;

            if (isEditing) {
              return (
                <li key={categoria.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                  <form action={updateCategoryAction} className="grid gap-3 md:grid-cols-3">
                    <input type="hidden" name="returnTo" value={PAGE_PATH} />
                    <input type="hidden" name="categoriaId" value={categoria.id} />

                    <label className="text-sm text-slate-700 dark:text-slate-200">
                      Nome *
                      <input type="text" name="nome" required defaultValue={categoria.nome} className={INPUT_CLASS} />
                    </label>
                    <label className="text-sm text-slate-700 dark:text-slate-200">
                      Temperatura Máxima (°C) *
                      <input
                        type="text"
                        name="temperaturaMaxima"
                        required
                        inputMode="decimal"
                        defaultValue={String(categoria.temperaturaMaxima).replace(".", ",")}
                        className={INPUT_CLASS}
                      />
                    </label>
                    <label className="text-sm text-slate-700 dark:text-slate-200">
                      Status
                      <select name="ativo" defaultValue={categoria.ativo ? "true" : "false"} className={INPUT_CLASS}>
                        <option value="true">Ativa</option>
                        <option value="false">Inativa</option>
                      </select>
                    </label>

                    <div className="btn-group md:col-span-3">
                      <button type="submit" className="btn-primary">Salvar</button>
                      <Link href={PAGE_PATH} className="btn-secondary">Cancelar</Link>
                    </div>
                  </form>
                </li>
              );
            }

            return (
              <li key={categoria.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {categoria.nome}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Limite: até {categoria.temperaturaMaxima.toLocaleString("pt-BR")} °C •{" "}
                      {categoria.ativo ? "Ativa" : "Inativa"}
                    </p>
                  </div>

                  <div className="btn-group">
                    <Link href={`${PAGE_PATH}?editCategoriaId=${categoria.id}`} className="btn-action">
                      Editar
                    </Link>
                    <form action={toggleCategoryStatusAction}>
                      <input type="hidden" name="returnTo" value={PAGE_PATH} />
                      <input type="hidden" name="categoriaId" value={categoria.id} />
                      <input type="hidden" name="ativo" value={categoria.ativo ? "false" : "true"} />
                      <button type="submit" className="btn-secondary">
                        {categoria.ativo ? "Inativar" : "Ativar"}
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
