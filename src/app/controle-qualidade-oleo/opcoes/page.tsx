import { StatusQualidadeOleo } from "@prisma/client";
import Link from "next/link";

import { prisma } from "@/lib/prisma";

import {
  createFitaOptionAction,
  toggleFitaOptionStatusAction,
  updateFitaOptionAction
} from "../actions";
import { ensureInitialOilOptions } from "../catalog";
import { ThemeToggleButton } from "../theme-toggle-button";
import { getStatusLabel, parsePositiveInt } from "../utils";

const PAGE_PATH = "/controle-qualidade-oleo/opcoes";
const CARD_CLASS =
  "rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900";
const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = { searchParams: Promise<SearchParams> };

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function ControleQualidadeOleoOpcoesPage({ searchParams }: PageProps) {
  await ensureInitialOilOptions();

  const params = await searchParams;
  const feedback = firstParam(params.feedback).trim();
  const feedbackType = firstParam(params.feedbackType) === "error" ? "error" : "success";
  const editOptionId = parsePositiveInt(firstParam(params.editOptionId));

  const options = await prisma.controleQualidadeOleoOpcaoFita.findMany({
    orderBy: [{ ativo: "desc" }, { ordem: "asc" }, { rotulo: "asc" }]
  });

  return (
    <div className="space-y-6 dark:text-slate-100">
      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Gerenciar Opções da Fita
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Cadastre e mantenha as opções de % da fita do óleo.
            </p>
          </div>
          <div className="btn-group">
            <Link href="/controle-qualidade-oleo" className="btn-secondary">
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
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Nova Opção</h2>

        <form action={createFitaOptionAction} className="mt-3 grid gap-3 md:grid-cols-4">
          <input type="hidden" name="returnTo" value={PAGE_PATH} />

          <label className="text-sm text-slate-700 dark:text-slate-200">
            Rótulo *
            <input type="text" name="rotulo" required placeholder="Ex.: 3,5%" className={INPUT_CLASS} />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Status Associado *
            <select name="statusAssociado" required className={INPUT_CLASS}>
              <option value={StatusQualidadeOleo.ADEQUADO}>Adequado</option>
              <option value={StatusQualidadeOleo.ATENCAO}>Atenção</option>
              <option value={StatusQualidadeOleo.ULTIMA_UTILIZACAO}>Última Utilização</option>
              <option value={StatusQualidadeOleo.DESCARTAR}>Descartar</option>
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Ordem *
            <input type="number" name="ordem" min={1} required className={INPUT_CLASS} />
          </label>
          <label className="text-sm text-slate-700 md:col-span-4 dark:text-slate-200">
            Descrição / Orientação *
            <textarea name="descricao" rows={2} required className={INPUT_CLASS} />
          </label>

          <div className="md:col-span-4">
            <button type="submit" className="btn-primary">Adicionar</button>
          </div>
        </form>
      </section>

      <section className={CARD_CLASS}>
        <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-slate-100">Opções Cadastradas</h2>

        <ul className="space-y-3">
          {options.map((option) => {
            const isEditing = editOptionId === option.id;

            if (isEditing) {
              return (
                <li key={option.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                  <form action={updateFitaOptionAction} className="grid gap-3 md:grid-cols-4">
                    <input type="hidden" name="optionId" value={option.id} />
                    <input type="hidden" name="returnTo" value={PAGE_PATH} />

                    <label className="text-sm text-slate-700 dark:text-slate-200">
                      Rótulo *
                      <input type="text" name="rotulo" required defaultValue={option.rotulo} className={INPUT_CLASS} />
                    </label>
                    <label className="text-sm text-slate-700 dark:text-slate-200">
                      Status Associado *
                      <select name="statusAssociado" required defaultValue={option.statusAssociado} className={INPUT_CLASS}>
                        <option value={StatusQualidadeOleo.ADEQUADO}>Adequado</option>
                        <option value={StatusQualidadeOleo.ATENCAO}>Atenção</option>
                        <option value={StatusQualidadeOleo.ULTIMA_UTILIZACAO}>Última Utilização</option>
                        <option value={StatusQualidadeOleo.DESCARTAR}>Descartar</option>
                      </select>
                    </label>
                    <label className="text-sm text-slate-700 dark:text-slate-200">
                      Ordem *
                      <input type="number" name="ordem" min={1} required defaultValue={option.ordem} className={INPUT_CLASS} />
                    </label>
                    <label className="text-sm text-slate-700 md:col-span-4 dark:text-slate-200">
                      Descrição / Orientação *
                      <textarea name="descricao" rows={2} required defaultValue={option.descricao} className={INPUT_CLASS} />
                    </label>

                    <div className="btn-group md:col-span-4">
                      <button type="submit" className="btn-primary">Salvar</button>
                      <Link href={PAGE_PATH} className="btn-secondary">Cancelar</Link>
                    </div>
                  </form>
                </li>
              );
            }

            return (
              <li key={option.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {option.rotulo}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Status: {getStatusLabel(option.statusAssociado)} • Ordem: {option.ordem} • {option.ativo ? "Ativo" : "Inativo"}
                    </p>
                    <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{option.descricao}</p>
                  </div>

                  <div className="btn-group">
                    <Link href={`${PAGE_PATH}?editOptionId=${option.id}`} className="btn-action">
                      Editar
                    </Link>
                    <form action={toggleFitaOptionStatusAction}>
                      <input type="hidden" name="optionId" value={option.id} />
                      <input type="hidden" name="ativo" value={option.ativo ? "false" : "true"} />
                      <input type="hidden" name="returnTo" value={PAGE_PATH} />
                      <button type="submit" className="btn-secondary">
                        {option.ativo ? "Inativar" : "Ativar"}
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