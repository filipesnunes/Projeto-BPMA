import Link from "next/link";

import { prisma } from "@/lib/prisma";

import {
  createWeeklyConfigItemAction,
  moveWeeklyConfigItemAction,
  toggleWeeklyConfigItemStatusAction,
  updateWeeklyConfigItemAction
} from "../../actions";
import { WEEKLY_AREAS, WEEKLY_DAY_OPTIONS } from "../../constants";
import { ThemeToggleButton } from "../../theme-toggle-button";
import { getWeeklyDayLabel, parsePositiveInt } from "../../utils";

const PAGE_PATH = "/plano-limpeza/semanal/opcoes";
const CARD_CLASS =
  "rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900";
const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = { searchParams: Promise<SearchParams> };

export const dynamic = "force-dynamic";

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

  const areaOptions = Array.from(new Set([...WEEKLY_AREAS, ...itens.map((item) => item.area)])).sort(
    (a, b) => a.localeCompare(b, "pt-BR")
  );

  const itensPorArea = new Map<string, typeof itens>();
  for (const area of areaOptions) {
    itensPorArea.set(
      area,
      itens
        .filter((item) => item.area === area)
        .sort((a, b) => {
          if (a.ordem !== b.ordem) {
            return a.ordem - b.ordem;
          }
          return a.oQueLimpar.localeCompare(b.oQueLimpar, "pt-BR");
        })
    );
  }

  return (
    <div className="space-y-6 dark:text-slate-100">
      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Gerenciar Plano Semanal
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Cadastre uma vez por área e o sistema gera automaticamente os checklists semanais.
            </p>
          </div>
          <div className="btn-group">
            <Link href="/plano-limpeza/semanal" className="btn-secondary">
              Voltar para Semanal
            </Link>
            <Link href="/plano-limpeza/semanal/historico" className="btn-secondary">
              Histórico Completo
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
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Novo Item por Área
        </h2>
        <form action={createWeeklyConfigItemAction} className="mt-3 grid gap-3 md:grid-cols-2">
          <input type="hidden" name="returnTo" value={PAGE_PATH} />
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Área *
            <select name="area" required className={INPUT_CLASS}>
              <option value="">Selecione</option>
              {areaOptions.map((area) => (
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
          <label className="text-sm text-slate-700 dark:text-slate-200 md:col-span-2">
            O que limpar? *
            <input type="text" name="oQueLimpar" required className={INPUT_CLASS} />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Quando limpar? *
            <select name="quando" required className={INPUT_CLASS}>
              <option value="">Selecione</option>
              {WEEKLY_DAY_OPTIONS.map((day) => (
                <option key={day.value} value={day.value}>
                  {day.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Quem? *
            <input type="text" name="quem" required className={INPUT_CLASS} />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200 md:col-span-2">
            Status
            <select name="ativo" defaultValue="true" className={INPUT_CLASS}>
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </select>
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
          Itens por Área
        </h2>

        <div className="space-y-4">
          {areaOptions.map((area) => {
            const itensArea = itensPorArea.get(area) ?? [];

            return (
              <article key={area} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{area}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {itensArea.length} item(ns)
                    </p>
                  </div>
                </div>

                {itensArea.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Nenhum item cadastrado para esta área.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {itensArea.map((item, index) => {
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
                                  {areaOptions.map((areaOption) => (
                                    <option key={areaOption} value={areaOption}>
                                      {areaOption}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="text-sm text-slate-700 dark:text-slate-200">
                                Ordem *
                                <input type="number" min={1} name="ordem" defaultValue={item.ordem} required className={INPUT_CLASS} />
                              </label>
                              <label className="text-sm text-slate-700 dark:text-slate-200 md:col-span-2">
                                O que limpar? *
                                <input type="text" name="oQueLimpar" defaultValue={item.oQueLimpar} required className={INPUT_CLASS} />
                              </label>
                              <label className="text-sm text-slate-700 dark:text-slate-200">
                                Quando limpar? *
                                <select name="quando" defaultValue={item.quando} required className={INPUT_CLASS}>
                                  {WEEKLY_DAY_OPTIONS.map((day) => (
                                    <option key={day.value} value={day.value}>
                                      {day.label}
                                    </option>
                                  ))}
                                </select>
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
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            Ordem {item.ordem} • {item.oQueLimpar}
                          </p>
                          <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                            <strong>Quando:</strong> {getWeeklyDayLabel(item.quando)}
                          </p>
                          <p className="text-sm text-slate-700 dark:text-slate-200">
                            <strong>Quem:</strong> {item.quem}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {item.ativo ? "Ativo" : "Inativo"}
                          </p>

                          <div className="btn-group mt-3">
                            <Link href={`${PAGE_PATH}?editItemId=${item.id}`} className="btn-action">
                              Editar
                            </Link>
                            <form action={moveWeeklyConfigItemAction}>
                              <input type="hidden" name="returnTo" value={PAGE_PATH} />
                              <input type="hidden" name="itemId" value={String(item.id)} />
                              <input type="hidden" name="direction" value="up" />
                              <button type="submit" className="btn-secondary" disabled={index === 0}>
                                Subir
                              </button>
                            </form>
                            <form action={moveWeeklyConfigItemAction}>
                              <input type="hidden" name="returnTo" value={PAGE_PATH} />
                              <input type="hidden" name="itemId" value={String(item.id)} />
                              <input type="hidden" name="direction" value="down" />
                              <button
                                type="submit"
                                className="btn-secondary"
                                disabled={index === itensArea.length - 1}
                              >
                                Descer
                              </button>
                            </form>
                            <form action={toggleWeeklyConfigItemStatusAction}>
                              <input type="hidden" name="returnTo" value={PAGE_PATH} />
                              <input type="hidden" name="itemId" value={String(item.id)} />
                              <input type="hidden" name="ativo" value={item.ativo ? "false" : "true"} />
                              <button type="submit" className="btn-secondary">
                                {item.ativo ? "Inativar" : "Ativar"}
                              </button>
                            </form>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
