import Link from "next/link";

import { prisma } from "@/lib/prisma";

import {
  createDailyAreaConfigAction,
  toggleDailyAreaConfigStatusAction,
  updateDailyAreaConfigAction
} from "../../actions";
import { ensureDailyAreaConfigurations } from "../../service";
import { ThemeToggleButton } from "../../theme-toggle-button";
import { parsePositiveInt } from "../../utils";

const PAGE_PATH = "/plano-limpeza/diario/opcoes";
const CARD_CLASS =
  "rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900";
const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = { searchParams: Promise<SearchParams> };

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function TurnoCheckboxes(props: {
  turnoManhaDefault: boolean;
  turnoTardeDefault: boolean;
  turnoNoiteDefault: boolean;
}) {
  return (
    <div className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
      <p className="font-medium">Turnos da Área *</p>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="turnoManha" defaultChecked={props.turnoManhaDefault} />
        Manhã
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="turnoTarde" defaultChecked={props.turnoTardeDefault} />
        Tarde
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="turnoNoite" defaultChecked={props.turnoNoiteDefault} />
        Noite
      </label>
    </div>
  );
}

function getTurnosLabel(area: {
  turnoManha: boolean;
  turnoTarde: boolean;
  turnoNoite: boolean;
}): string {
  const labels: string[] = [];
  if (area.turnoManha) labels.push("Manhã");
  if (area.turnoTarde) labels.push("Tarde");
  if (area.turnoNoite) labels.push("Noite");
  return labels.length > 0 ? labels.join(", ") : "Sem Turnos";
}

export default async function PlanoLimpezaDiarioOpcoesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const feedback = firstParam(params.feedback).trim();
  const feedbackType = firstParam(params.feedbackType) === "error" ? "error" : "success";
  const editAreaId = parsePositiveInt(firstParam(params.editAreaId));

  await ensureDailyAreaConfigurations();

  const areas = await prisma.planoLimpezaDiarioArea.findMany({
    orderBy: [{ ordem: "asc" }, { nome: "asc" }]
  });

  return (
    <div className="space-y-6 dark:text-slate-100">
      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Gerenciar Plano Diário
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Configure áreas e turnos que geram checklist automático diário.
            </p>
          </div>
          <div className="btn-group">
            <Link href="/plano-limpeza/diario" className="btn-secondary">
              Voltar para Diário
            </Link>
            <Link href="/plano-limpeza/diario/historico" className="btn-secondary">
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
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Nova Área</h2>
        <form action={createDailyAreaConfigAction} className="mt-3 grid gap-3 md:grid-cols-2">
          <input type="hidden" name="returnTo" value={PAGE_PATH} />

          <label className="text-sm text-slate-700 dark:text-slate-200">
            Nome da Área *
            <input type="text" name="nome" required className={INPUT_CLASS} />
          </label>

          <label className="text-sm text-slate-700 dark:text-slate-200">
            Ordem *
            <input type="number" min={1} name="ordem" defaultValue={areas.length + 1} required className={INPUT_CLASS} />
          </label>

          <div className="md:col-span-2">
            <TurnoCheckboxes
              turnoManhaDefault
              turnoTardeDefault
              turnoNoiteDefault
            />
          </div>

          <div className="md:col-span-2">
            <button type="submit" className="btn-primary">
              Adicionar Área
            </button>
          </div>
        </form>
      </section>

      <section className={CARD_CLASS}>
        <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-slate-100">
          Áreas Configuradas
        </h2>

        <ul className="space-y-3">
          {areas.map((area) => {
            const isEditing = editAreaId === area.id;

            if (isEditing) {
              return (
                <li key={area.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                  <form action={updateDailyAreaConfigAction} className="grid gap-3 md:grid-cols-2">
                    <input type="hidden" name="returnTo" value={PAGE_PATH} />
                    <input type="hidden" name="areaId" value={String(area.id)} />

                    <label className="text-sm text-slate-700 dark:text-slate-200">
                      Nome da Área *
                      <input
                        type="text"
                        name="nome"
                        required
                        defaultValue={area.nome}
                        className={INPUT_CLASS}
                      />
                    </label>

                    <label className="text-sm text-slate-700 dark:text-slate-200">
                      Ordem *
                      <input
                        type="number"
                        min={1}
                        name="ordem"
                        required
                        defaultValue={area.ordem}
                        className={INPUT_CLASS}
                      />
                    </label>

                    <label className="text-sm text-slate-700 dark:text-slate-200 md:col-span-2">
                      Status
                      <select
                        name="ativo"
                        defaultValue={area.ativo ? "true" : "false"}
                        className={INPUT_CLASS}
                      >
                        <option value="true">Ativo</option>
                        <option value="false">Inativo</option>
                      </select>
                    </label>

                    <div className="md:col-span-2">
                      <TurnoCheckboxes
                        turnoManhaDefault={area.turnoManha}
                        turnoTardeDefault={area.turnoTarde}
                        turnoNoiteDefault={area.turnoNoite}
                      />
                    </div>

                    <div className="btn-group md:col-span-2">
                      <button type="submit" className="btn-primary">
                        Salvar
                      </button>
                      <Link href={PAGE_PATH} className="btn-secondary">
                        Cancelar
                      </Link>
                    </div>
                  </form>
                </li>
              );
            }

            return (
              <li key={area.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {area.nome} • Ordem {area.ordem}
                    </p>
                    <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                      <strong>Turnos:</strong> {getTurnosLabel(area)}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {area.ativo ? "Ativo" : "Inativo"}
                    </p>
                  </div>

                  <div className="btn-group">
                    <Link href={`${PAGE_PATH}?editAreaId=${area.id}`} className="btn-action">
                      Editar
                    </Link>

                    <form action={toggleDailyAreaConfigStatusAction}>
                      <input type="hidden" name="returnTo" value={PAGE_PATH} />
                      <input type="hidden" name="areaId" value={String(area.id)} />
                      <input type="hidden" name="ativo" value={area.ativo ? "false" : "true"} />
                      <button type="submit" className="btn-secondary">
                        {area.ativo ? "Inativar" : "Ativar"}
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
