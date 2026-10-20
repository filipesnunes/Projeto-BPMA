"use client";
import { ExecutionTimeFields } from "@/components/forms/execution-time-fields";

import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import type {
  ClassificacaoItemBuffetAmostra,
  StatusItemBuffetAmostra,
  StatusTemperaturaBuffetAmostra
} from "@prisma/client";

import {
  createExtraItemStateAction,
  saveServicoItemsStateAction
} from "../../actions";
import { ItemStatusBadge, TemperatureStatusBadge } from "../../status-badges";
import {
  avaliarTemperaturaBuffet,
  getClassificacaoLabel,
  normalizeSearchText,
  THERMAL_BOTTLE_EQUIPMENT_LABEL
} from "../../utils";

type ActionState = {
  status: "idle" | "success" | "error";
  message: string;
  invalidRowKey?: string;
};

type AcaoCorretivaOption = {
  id: number;
  nome: string;
};

type PendingItemIssue = {
  rowKey: string;
  nome: string;
  kind: "blank" | "incomplete";
  missingFields: string[];
};

export type ServiceItemFormRow = {
  rowKey: string;
  nome: string;
  classificacao: ClassificacaoItemBuffetAmostra;
  isExtra: boolean;
  guideline: string;
  status: StatusItemBuffetAmostra;
  statusTemperatura: StatusTemperaturaBuffetAmostra | null;
  avaliacaoOrientacao: string | null;
  tcEquipamento: string;
  primeiraTc: string;
  usaGarrafaTermica: boolean;
  temperaturaAmbiente: boolean;
  acaoCorretiva: string;
  observacao: string;
  responsavelNome: string | null;
  dataHoraRegistro: string | null;
  horarioExecucao?: string | null;
  horarioNaoInformado?: boolean;
  justificativaHorario?: string | null;
  assinaturaResumo: string | null;
  bloqueado: boolean;
};

type ServiceItemsFormProps = {
  servicoId: number;
  dataInput: string;
  returnTo: string;
  usuarioLogado: string;
  fechamentoAssinado: boolean;
  rows: ServiceItemFormRow[];
  acoesCorretivas: AcaoCorretivaOption[];
  inputClassName: string;
};

const INITIAL_STATE: ActionState = {
  status: "idle",
  message: ""
};

function SubmitItemsButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="btn-primary" disabled={disabled || pending}>
      {pending ? "Salvando..." : "Salvar Itens do Serviço"}
    </button>
  );
}

function AddExtraSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Adicionando..." : "Adicionar Item"}
    </button>
  );
}

function parseTemperatureInput(value: string): number | null {
  const normalized = value.replace(",", ".").trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function getTemperatureTypeDefault(row: ServiceItemFormRow): "" | "NUMERICA" | "AMBIENTE" {
  if (row.temperaturaAmbiente) {
    return "AMBIENTE";
  }

  if (row.tcEquipamento || row.primeiraTc) {
    return "NUMERICA";
  }

  return "";
}

function AddExtraItemModal({
  servicoId,
  dataInput,
  disabled
}: {
  servicoId: number;
  dataInput: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction] = useActionState(createExtraItemStateAction, INITIAL_STATE);

  useEffect(() => {
    if (state.status === "success") {
      setIsOpen(false);
      router.refresh();
    }
  }, [router, state.status]);

  return (
    <>
      <button
        type="button"
        className="btn-secondary"
        disabled={disabled}
        onClick={() => setIsOpen(true)}
      >
        Adicionar Item Extra
      </button>

      {isOpen ? (
        <div className="bpma-modal-backdrop">
          <section className="bpma-modal-panel max-w-lg">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Adicionar Item Extra
            </h3>

            {state.status === "error" ? (
              <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
                {state.message}
              </p>
            ) : null}

            <form action={formAction} className="mt-4 grid gap-3">
              <input type="hidden" name="servicoId" value={String(servicoId)} />
              <input type="hidden" name="data" value={dataInput} />

              <label className="text-sm text-slate-700 dark:text-slate-200">
                Nome do Item/Produto *
                <input type="text" name="nome" required className="bpma-input" />
              </label>

              <label className="text-sm text-slate-700 dark:text-slate-200">
                Classificação *
                <select name="classificacao" required className="bpma-input">
                  <option value="QUENTE">Quentes</option>
                  <option value="FRIO">Frios</option>
                  <option value="TEMPERATURA_AMBIENTE">Temperatura Ambiente</option>
                </select>
              </label>

              <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsOpen(false)}
                >
                  Cancelar
                </button>
                <AddExtraSubmitButton />
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}

export function ServiceItemsForm({
  servicoId,
  dataInput,
  returnTo,
  usuarioLogado,
  fechamentoAssinado,
  rows,
  acoesCorretivas,
  inputClassName
}: ServiceItemsFormProps) {
  const router = useRouter();
  const [state, formAction] = useActionState(saveServicoItemsStateAction, INITIAL_STATE);
  const formRef = useRef<HTMLFormElement | null>(null);
  const confirmPendingInputRef = useRef<HTMLInputElement | null>(null);
  const bypassConfirmationRef = useRef(false);
  const [pendingIssues, setPendingIssues] = useState<PendingItemIssue[]>([]);
  const [highlightedRows, setHighlightedRows] = useState<Set<string>>(new Set());
  const [itemSearch, setItemSearch] = useState("");
  const [ambientRows, setAmbientRows] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(rows.map((row) => [row.rowKey, row.temperaturaAmbiente]))
  );
  const [nonServedRows, setNonServedRows] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(rows.map((row) => [row.rowKey, row.status === "NAO_SERVIDO"]))
  );
  const hasEditableRows = rows.some((row) => !row.bloqueado);
  const normalizedItemSearch = normalizeSearchText(itemSearch);
  const hasSearchMatches =
    !normalizedItemSearch ||
    rows.some((row) => normalizeSearchText(row.nome).includes(normalizedItemSearch));

  useEffect(() => {
    if (state.status === "success") {
      setPendingIssues([]);
      setHighlightedRows(new Set());
      bypassConfirmationRef.current = false;
      if (confirmPendingInputRef.current) {
        confirmPendingInputRef.current.value = "false";
      }
      router.refresh();
    }
  }, [router, state.status]);

  useEffect(() => {
    setAmbientRows(Object.fromEntries(rows.map((row) => [row.rowKey, row.temperaturaAmbiente])));
    setNonServedRows(
      Object.fromEntries(rows.map((row) => [row.rowKey, row.status === "NAO_SERVIDO"]))
    );
  }, [rows]);

  const clearRowCollectionFields = (rowKey: string) => {
    const form = formRef.current;
    if (!form) {
      return;
    }

    const fieldNames = [
      `${rowKey}-temperaturaTipo`,
      `${rowKey}-tcEquipamento`,
      `${rowKey}-primeiraTc`,
      `${rowKey}-acaoCorretiva`
    ];

    for (const fieldName of fieldNames) {
      const field = form.elements.namedItem(fieldName) as
        | HTMLInputElement
        | HTMLSelectElement
        | null;

      if (field) {
        field.value = "";
      }
    }
  };

  const setRowNonServed = (rowKey: string, checked: boolean) => {
    setNonServedRows((current) => ({
      ...current,
      [rowKey]: checked
    }));

    if (checked) {
      setAmbientRows((current) => ({
        ...current,
        [rowKey]: false
      }));
      clearRowCollectionFields(rowKey);
      setHighlightedRows((current) => {
        const next = new Set(current);
        next.delete(rowKey);
        return next;
      });
      setPendingIssues((current) =>
        current.filter((issue) => issue.rowKey !== rowKey)
      );
    }
  };

  const collectPendingIssues = (formData: FormData): PendingItemIssue[] => {
    const issues: PendingItemIssue[] = [];

    for (const row of rows) {
      if (row.bloqueado) {
        continue;
      }

      const tcEquipamento = String(formData.get(`${row.rowKey}-tcEquipamento`) ?? "").trim();
      const primeiraTc = String(formData.get(`${row.rowKey}-primeiraTc`) ?? "").trim();
      const temperaturaTipo = String(formData.get(`${row.rowKey}-temperaturaTipo`) ?? "").trim();
      const acaoCorretiva = String(formData.get(`${row.rowKey}-acaoCorretiva`) ?? "").trim();
      const observacao = String(formData.get(`${row.rowKey}-observacao`) ?? "").trim();
      const naoServido =
        String(formData.get(`${row.rowKey}-naoServido`) ?? "").trim() === "true";

      if (naoServido) {
        continue;
      }

      const temperaturaAmbiente = temperaturaTipo === "AMBIENTE";
      const hasAnyValue = [
        row.usaGarrafaTermica ? "" : tcEquipamento,
        primeiraTc,
        acaoCorretiva,
        observacao,
        temperaturaAmbiente ? "Ambiente" : ""
      ].some(Boolean);

      if (!hasAnyValue) {
        issues.push({
          rowKey: row.rowKey,
          nome: row.nome,
          kind: "blank",
          missingFields: []
        });
        continue;
      }

      const missingFields: string[] = [];
      if (temperaturaAmbiente) {
        if (
          acaoCorretiva &&
          !acoesCorretivas.some((option) => option.nome === acaoCorretiva)
        ) {
          missingFields.push("ação corretiva válida");
        }

        if (missingFields.length > 0) {
          issues.push({
            rowKey: row.rowKey,
            nome: row.nome,
            kind: "incomplete",
            missingFields
          });
        }
        continue;
      }

      const tcEquipamentoNumber = parseTemperatureInput(tcEquipamento);
      const primeiraTcNumber = parseTemperatureInput(primeiraTc);

      if (!row.usaGarrafaTermica && tcEquipamentoNumber === null) {
        missingFields.push("TC Equipamento");
      }

      if (primeiraTcNumber === null) {
        missingFields.push("TC do Alimento");
      } else {
        const avaliacao = avaliarTemperaturaBuffet(row.classificacao, primeiraTcNumber);
        if (avaliacao.exigeAcaoCorretiva && !acaoCorretiva) {
          missingFields.push("ação corretiva");
        }
      }

      if (
        acaoCorretiva &&
        !acoesCorretivas.some((option) => option.nome === acaoCorretiva)
      ) {
        missingFields.push("ação corretiva válida");
      }

      if (missingFields.length > 0) {
        issues.push({
          rowKey: row.rowKey,
          nome: row.nome,
          kind: "incomplete",
          missingFields
        });
      }
    }

    return issues;
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (bypassConfirmationRef.current) {
      bypassConfirmationRef.current = false;
      return;
    }

    if (confirmPendingInputRef.current) {
      confirmPendingInputRef.current.value = "false";
    }

    const issues = collectPendingIssues(new FormData(event.currentTarget));
    if (issues.length === 0) {
      setPendingIssues([]);
      setHighlightedRows(new Set());
      return;
    }

    event.preventDefault();
    setPendingIssues(issues);
    setHighlightedRows(new Set(issues.map((issue) => issue.rowKey)));
  };

  const submitWithPendingConfirmation = () => {
    if (confirmPendingInputRef.current) {
      confirmPendingInputRef.current.value = "true";
    }

    bypassConfirmationRef.current = true;
    setPendingIssues([]);
    formRef.current?.requestSubmit();
  };

  if (rows.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Nenhum item ativo está vinculado a este serviço. Se necessário, adicione um item extra para
          esta data.
        </p>
        <AddExtraItemModal
          servicoId={servicoId}
          dataInput={dataInput}
          disabled={fechamentoAssinado}
        />
      </div>
    );
  }

  const blankIssues = pendingIssues.filter((issue) => issue.kind === "blank");
  const incompleteIssues = pendingIssues.filter((issue) => issue.kind === "incomplete");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <AddExtraItemModal
          servicoId={servicoId}
          dataInput={dataInput}
          disabled={fechamentoAssinado}
        />
      </div>

      {state.status !== "idle" && state.message ? (
        <div
          className={`rounded-lg border p-3 text-sm ${
            state.status === "error"
              ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
              : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
          }`}
        >
          {state.message}
        </div>
      ) : null}

      <label className="block text-sm text-slate-700 dark:text-slate-200">
        Buscar item pelo nome
        <input
          type="search"
          value={itemSearch}
          onChange={(event) => setItemSearch(event.target.value)}
          placeholder="Buscar item pelo nome..."
          className={inputClassName}
        />
      </label>

      <form ref={formRef} action={formAction} className="space-y-4" onSubmit={handleSubmit}>
        <input type="hidden" name="servicoId" value={String(servicoId)} />
        <input type="hidden" name="data" value={dataInput} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <input
          ref={confirmPendingInputRef}
          type="hidden"
          name="confirmarItensPendentes"
          defaultValue="false"
        />

        {normalizedItemSearch && !hasSearchMatches ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
            Nenhum item encontrado.
          </p>
        ) : null}

        <div className="grid gap-3 xl:grid-cols-2">
          {rows.map((row) => {
            const acaoEstaAtiva = acoesCorretivas.some(
              (option) => option.nome === row.acaoCorretiva
            );
            const invalid =
              state.invalidRowKey === row.rowKey || highlightedRows.has(row.rowKey);
            const matchesSearch =
              !normalizedItemSearch ||
              normalizeSearchText(row.nome).includes(normalizedItemSearch);
            const hiddenBySearch = !matchesSearch && !invalid;
            const naoServido = nonServedRows[row.rowKey] ?? row.status === "NAO_SERVIDO";
            const temperaturaAmbiente =
              !naoServido && (ambientRows[row.rowKey] ?? row.temperaturaAmbiente);
            const collectionDisabled = row.bloqueado || naoServido;
            const equipmentDisabled =
              collectionDisabled || temperaturaAmbiente || row.usaGarrafaTermica;

            return (
              <section
                key={row.rowKey}
                className={`${hiddenBySearch ? "hidden" : ""} rounded-lg border p-4 ${
                  invalid
                    ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950"
                    : naoServido
                    ? "border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
                    : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                }`}
              >
                <input type="hidden" name="rowKey" value={row.rowKey} />
                {!row.bloqueado && !naoServido && <ExecutionTimeFields required={false} date={dataInput} prefix={row.rowKey + "-"} defaultTime={row.horarioExecucao ?? ""} defaultUnknown={row.horarioNaoInformado} defaultJustification={row.justificativaHorario ?? ""} />}
                <input
                  type="hidden"
                  name={`${row.rowKey}-naoServido`}
                  value={naoServido ? "true" : "false"}
                />

                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium text-slate-900 dark:text-slate-100">
                        {row.nome}
                      </h3>
                      {row.isExtra ? (
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200">
                          Item extra
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {row.guideline}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-slate-700 dark:text-slate-200">
                      {getClassificacaoLabel(row.classificacao)}
                    </span>
                    {naoServido ? (
                      <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        Não servido
                      </span>
                    ) : temperaturaAmbiente ? (
                      <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                        Ambiente
                      </span>
                    ) : (
                      <TemperatureStatusBadge status={row.statusTemperatura} />
                    )}
                  </div>
                </div>

                <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={naoServido}
                    disabled={row.bloqueado}
                    className="h-5 w-5"
                    onChange={(event) =>
                      setRowNonServed(row.rowKey, event.target.checked)
                    }
                  />
                  <span>Não servido</span>
                </label>

                {naoServido ? (
                  <p className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    Item não servido neste serviço. Temperaturas, ambiente e ação corretiva não serão registrados.
                  </p>
                ) : null}

                {row.avaliacaoOrientacao ? (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    {row.avaliacaoOrientacao}
                  </p>
                ) : null}

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <label className="text-sm text-slate-700 dark:text-slate-200">
                    Temperatura do item
                    <select
                      name={`${row.rowKey}-temperaturaTipo`}
                      defaultValue={getTemperatureTypeDefault(row)}
                      className={inputClassName}
                      disabled={collectionDisabled}
                      onChange={(event) =>
                        setAmbientRows((current) => ({
                          ...current,
                          [row.rowKey]: event.target.value === "AMBIENTE"
                        }))
                      }
                    >
                      <option value="">Selecione</option>
                      <option value="NUMERICA">Numérica</option>
                      <option value="AMBIENTE">Ambiente</option>
                    </select>
                  </label>
                  <label className="text-sm text-slate-700 dark:text-slate-200">
                    TC Equipamento
                    <input
                      type="text"
                      name={`${row.rowKey}-tcEquipamento`}
                      inputMode="text"
                      placeholder={
                        row.usaGarrafaTermica
                          ? THERMAL_BOTTLE_EQUIPMENT_LABEL
                          : "Ex.: -18 ou 62,5"
                      }
                      defaultValue={
                        row.usaGarrafaTermica
                          ? THERMAL_BOTTLE_EQUIPMENT_LABEL
                          : row.tcEquipamento
                      }
                      className={inputClassName}
                      disabled={equipmentDisabled}
                    />
                  </label>
                  <label className="text-sm text-slate-700 dark:text-slate-200">
                    TC do Alimento
                    <input
                      type="text"
                      name={`${row.rowKey}-primeiraTc`}
                      inputMode="text"
                      placeholder="Ex.: -12,5"
                      defaultValue={row.primeiraTc}
                      className={inputClassName}
                      disabled={collectionDisabled || temperaturaAmbiente}
                    />
                  </label>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="text-sm text-slate-700 dark:text-slate-200">
                    Ação Corretiva
                    <select
                      name={`${row.rowKey}-acaoCorretiva`}
                      defaultValue={row.acaoCorretiva}
                      className={inputClassName}
                      disabled={collectionDisabled}
                    >
                      <option value="">Selecione</option>
                      {!acaoEstaAtiva && row.acaoCorretiva ? (
                        <option value={row.acaoCorretiva}>{row.acaoCorretiva} (Inativa)</option>
                      ) : null}
                      {acoesCorretivas.map((option) => (
                        <option key={option.id} value={option.nome}>
                          {option.nome}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm text-slate-700 dark:text-slate-200">
                    Observação
                    <textarea
                      name={`${row.rowKey}-observacao`}
                      rows={2}
                      defaultValue={row.observacao}
                      className={inputClassName}
                      disabled={row.bloqueado}
                    />
                  </label>
                </div>

                <div className="mt-3 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 sm:grid-cols-2">
                  <p>
                    Responsável: <strong>{row.responsavelNome ?? usuarioLogado}</strong>
                  </p>
                  <p>
                    Lançado em: <strong>{row.dataHoraRegistro ?? "-"}</strong>
                  </p>
                  <p>
                    Status: <ItemStatusBadge status={row.status} />
                  </p>
                  <p>
                    Assinatura: <strong>{row.assinaturaResumo ?? "-"}</strong>
                  </p>
                </div>
              </section>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <SubmitItemsButton disabled={!hasEditableRows} />
        </div>
      </form>

      {pendingIssues.length > 0 ? (
        <div className="bpma-modal-backdrop">
          <section className="bpma-modal-panel max-w-2xl">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Confirmar salvamento com itens pendentes
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Alguns itens não foram preenchidos. Confirme apenas se esses itens não foram
              servidos ou se realmente não precisam de registro neste serviço.
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {blankIssues.length > 0 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    Itens sem preenchimento
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                    {blankIssues.map((issue) => (
                      <li key={issue.rowKey}>- {issue.nome}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {incompleteIssues.length > 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                    Itens incompletos
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-amber-800 dark:text-amber-200">
                    {incompleteIssues.map((issue) => (
                      <li key={issue.rowKey}>
                        - {issue.nome}: falta {issue.missingFields.join(", ")}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
              Ao confirmar, esses itens serão registrados como <strong>Não servido</strong> e
              não continuarão como pendência do serviço.
            </p>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setPendingIssues([])}
              >
                Voltar e preencher
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={submitWithPendingConfirmation}
              >
                Salvar mesmo assim
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
