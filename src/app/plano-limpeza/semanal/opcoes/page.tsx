import Link from "next/link";

import { prisma } from "@/lib/prisma";

import {
  createWeeklyConfigItemAction,
  toggleWeeklyConfigItemStatusAction,
  updateWeeklyConfigItemAction
} from "../../actions";
import { WEEKLY_AREAS } from "../../constants";
import { ThemeToggleButton } from "../../theme-toggle-button";
import { parsePositiveInt } from "../../utils";

const PAGE_PATH = "/plano-limpeza/semanal/opcoes";
const CARD_CLASS =
  "rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900";
const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = { searchParams: Promise<SearchParams> };

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function PlanoLimpezaSemanalOpcoesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const feedback = firstParam(params.feedback).trim();
  const feedbackType = firstParam(params.feedbackType) === "error" ? "error" : "success";
  const editItemId = parsePositiveInt(firstParam(params.editItemId));

  const itens = await prisma.planoLimpezaSemanalItem.findMany({
    orderBy: [{ area: "asc" }, { ordem: "asc" }, { oQueLimpar: "asc" }]
  });

  return (
    <div className="space-y-6 dark:text-slate-100">
      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Gerenciar Plano Semanal
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Configure os itens por área: o que limpar, qual produto, quando e quem.
            </p>
          </div>
          <div className="btn-group">
            <Link href="/plano-limpeza/semanal" className="btn-secondary">
              Voltar para Semanal
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
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Novo Item</h2>
        <form action={createWeeklyConfigItemAction} className="mt-3 grid gap-3 md:grid-cols-2">
          <input type="hidden" name="returnTo" value={PAGE_PATH} />
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Área *
            <select name="area" required className={INPUT_CLASS}>
              <option value="">Selecione</option>
              {WEEKLY_AREAS.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Ordem *
            <input type="number" min={1} name="ordem" defaultValue={1} required className={INPUT_CLASS} />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            O que limpar? *
            <input type="text" name="oQueLimpar" required className={INPUT_CLASS} />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Qual produto? *
            <input type="text" name="qualProduto" required className={INPUT_CLASS} />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Quando? *
            <input type="text" name="quando" required className={INPUT_CLASS} />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Quem? *
            <input type="text" name="quem" required className={INPUT_CLASS} />
          </label>
          <div className="md:col-span-2">
            <button type="submit" className="btn-primary">
              Adicionar Item
            </button>
          </div>
        </form>
      </section>

      <section className={CARD_CLASS}>
        <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-slate-100">
          Itens Cadastrados
        </h2>
        <ul className="space-y-3">
          {itens.map((item) => {
            const isEditing = editItemId === item.id;

            if (isEditing) {
              return (
                <li key={item.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                  <form action={updateWeeklyConfigItemAction} className="grid gap-3 md:grid-cols-2">
                    <input type="hidden" name="returnTo" value={PAGE_PATH} />
                    <input type="hidden" name="itemId" value={String(item.id)} />

                    <label className="text-sm text-slate-700 dark:text-slate-200">
                      Área *
                      <select name="area" defaultValue={item.area} required className={INPUT_CLASS}>
                        {WEEKLY_AREAS.map((area) => (
                          <option key={area} value={area}>
                            {area}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm text-slate-700 dark:text-slate-200">
                      Ordem *
                      <input type="number" min={1} name="ordem" defaultValue={item.ordem} required className={INPUT_CLASS} />
                    </label>
                    <label className="text-sm text-slate-700 dark:text-slate-200">
                      O que limpar? *
                      <input type="text" name="oQueLimpar" defaultValue={item.oQueLimpar} required className={INPUT_CLASS} />
                    </label>
                    <label className="text-sm text-slate-700 dark:text-slate-200">
                      Qual produto? *
                      <input type="text" name="qualProduto" defaultValue={item.qualProduto} required className={INPUT_CLASS} />
                    </label>
                    <label className="text-sm text-slate-700 dark:text-slate-200">
                      Quando? *
                      <input type="text" name="quando" defaultValue={item.quando} required className={INPUT_CLASS} />
                    </label>
                    <label className="text-sm text-slate-700 dark:text-slate-200">
                      Quem? *
                      <input type="text" name="quem" defaultValue={item.quem} required className={INPUT_CLASS} />
                    </label>
                    <label className="text-sm text-slate-700 dark:text-slate-200 md:col-span-2">
                      Status
                      <select name="ativo" defaultValue={item.ativo ? "true" : "false"} className={INPUT_CLASS}>
                        <option value="true">Ativo</option>
                        <option value="false">Inativo</option>
                      </select>
                    </label>

                    <div className="btn-group md:col-span-2">
                      <button type="submit" className="btn-primary">Salvar</button>
                      <Link href={PAGE_PATH} className="btn-secondary">Cancelar</Link>
                    </div>
                  </form>
                </li>
              );
            }

            return (
              <li key={item.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {item.area} • Ordem {item.ordem}
                    </p>
                    <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                      <strong>O que limpar:</strong> {item.oQueLimpar}
                    </p>
                    <p className="text-sm text-slate-700 dark:text-slate-200">
                      <strong>Qual produto:</strong> {item.qualProduto}
                    </p>
                    <p className="text-sm text-slate-700 dark:text-slate-200">
                      <strong>Quando:</strong> {item.quando}
                    </p>
                    <p className="text-sm text-slate-700 dark:text-slate-200">
                      <strong>Quem:</strong> {item.quem}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {item.ativo ? "Ativo" : "Inativo"}
                    </p>
                  </div>

                  <div className="btn-group">
                    <Link href={`${PAGE_PATH}?editItemId=${item.id}`} className="btn-action">
                      Editar
                    </Link>
                    <form action={toggleWeeklyConfigItemStatusAction}>
                      <input type="hidden" name="returnTo" value={PAGE_PATH} />
                      <input type="hidden" name="itemId" value={String(item.id)} />
                      <input type="hidden" name="ativo" value={item.ativo ? "false" : "true"} />
                      <button type="submit" className="btn-secondary">
                        {item.ativo ? "Inativar" : "Ativar"}
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
