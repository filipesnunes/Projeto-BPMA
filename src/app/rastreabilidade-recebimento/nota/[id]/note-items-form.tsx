"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { StatusRecebimento } from "@prisma/client";

import { saveNotaItemsStateAction } from "../../actions";
import { SIF_INPUT_REQUIRED_MESSAGE } from "../../sif";
import { SifInput } from "../../sif-input";
import { ConformidadeBadge } from "../../status-badges";

type ActionState = {
  status: "idle" | "success" | "error";
  message: string;
  invalidRowKey?: string;
  invalidField?: string;
};

type TemperaturaTipo = "NUMERICA" | "AMBIENTE" | "NAO_APLICAVEL";

export type NoteItemFormRow = {
  id: number;
  produto: string;
  codigoProdutoXml: string;
  ncm: string;
  cfop: string;
  quantidadeComprada: string;
  unidadeMedidaCompra: string;
  lote: string;
  dataFabricacao: string;
  semDataFabricacao: boolean;
  dataValidade: string;
  validadeNaoAplicavel: boolean;
  sif: string;
  temperatura: string;
  temperaturaTipo: TemperaturaTipo;
  transporteEntregador: string;
  aspectoSensorial: string;
  embalagem: string;
  acaoCorretiva: string;
  responsavelRecebimento: string | null;
  observacoes: string;
  statusGeral: StatusRecebimento;
};

type NoteItemsFormProps = {
  notaId: number;
  returnTo: string;
  rows: NoteItemFormRow[];
  readOnlyMode: boolean;
  xmlProductLocked: boolean;
  canDeleteItems: boolean;
  responsavelLogado: string;
  inputClassName: string;
  formId: string;
  finalizarSelecionado: boolean;
  noteNumber: string;
  itemCount: number;
};

const INITIAL_STATE: ActionState = {
  status: "idle",
  message: ""
};

const TABLE_HEAD_CLASS =
  "whitespace-nowrap px-2 py-2 text-left text-xs font-semibold text-slate-700 dark:text-slate-200";
const TABLE_CELL_CLASS = "px-2 py-1.5 align-top";
const PRODUCT_CELL_CLASS = `${TABLE_CELL_CLASS} min-w-[13rem]`;
const INFO_CELL_CLASS = `${TABLE_CELL_CLASS} min-w-[5.5rem]`;
const LOTE_CELL_CLASS = `${TABLE_CELL_CLASS} min-w-[7rem]`;
const DATE_TABLE_CELL_CLASS = `${TABLE_CELL_CLASS} min-w-[11rem] max-w-[11rem]`;
const SIF_CELL_CLASS = `${TABLE_CELL_CLASS} min-w-[11rem]`;
const TEMPERATURE_CELL_CLASS = `${TABLE_CELL_CLASS} min-w-[12rem]`;
const SELECT_CELL_CLASS = `${TABLE_CELL_CLASS} min-w-[8.5rem]`;
const TEXT_CELL_CLASS = `${TABLE_CELL_CLASS} min-w-[10rem]`;
const READONLY_CELL_CLASS = `${TABLE_CELL_CLASS} min-w-[8.5rem]`;
const STATUS_CELL_CLASS = `${TABLE_CELL_CLASS} min-w-[7rem] whitespace-nowrap`;
const ACTION_CELL_CLASS = `${TABLE_CELL_CLASS} min-w-[6.5rem]`;
const MOBILE_FIELD_LABEL_CLASS = "sr-only";
const DATE_INPUT_CLASS = "bpma-date-input";
const FIELD_ERROR_CLASS =
  "border-red-400 bg-red-50 text-red-700 focus:border-red-500 focus:ring-red-500 dark:border-red-700 dark:bg-red-950 dark:text-red-200";
const LOTE_REQUIRED_MESSAGE = "O campo Lote é obrigatório.";

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" name="intent" value="save" className="btn-primary" disabled={pending}>
      {pending ? "Salvando..." : "Salvar Itens da Nota"}
    </button>
  );
}

function FinalizeButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" name="intent" value="finalize" className="btn-primary" disabled={pending}>
      {pending ? "Finalizando..." : "Confirmar Finalização"}
    </button>
  );
}

function getConformidadeBadgeValue(status: StatusRecebimento) {
  if (status === "NAO_CONFORME") {
    return "NAO_CONFORME";
  }

  if (status === "CONFORME") {
    return "CONFORME";
  }

  return null;
}

const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDateInputValue(value: string | null | undefined): string {
  const trimmed = String(value ?? "").trim();
  return DATE_INPUT_PATTERN.test(trimmed) ? trimmed : "";
}

function sanitizeTemperatureInput(value: string | null | undefined): string {
  let sanitized = "";
  let hasDecimalSeparator = false;

  for (const char of String(value ?? "").trim()) {
    if (/\d/.test(char)) {
      sanitized += char;
      continue;
    }

    if (char === "-" && sanitized.length === 0) {
      sanitized += char;
      continue;
    }

    if ((char === "," || char === ".") && !hasDecimalSeparator) {
      sanitized += char;
      hasDecimalSeparator = true;
    }
  }

  return sanitized;
}

function normalizeTemperatureOnBlur(value: string | null | undefined): string {
  const trimmed = String(value ?? "").trim();
  const normalized = trimmed.replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(normalized) ? normalized : trimmed;
}

export function NoteItemsForm({
  notaId,
  returnTo,
  rows,
  readOnlyMode,
  xmlProductLocked,
  canDeleteItems,
  responsavelLogado,
  inputClassName,
  formId,
  finalizarSelecionado,
  noteNumber,
  itemCount
}: NoteItemsFormProps) {
  const router = useRouter();
  const [state, formAction] = useActionState(saveNotaItemsStateAction, INITIAL_STATE);
  const [validadeNaoAplicavelRows, setValidadeNaoAplicavelRows] = useState<
    Record<string, boolean>
  >(() =>
    Object.fromEntries(
      rows.map((item) => [`item-${item.id}`, item.validadeNaoAplicavel])
    )
  );
  const [dataValidadeValues, setDataValidadeValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      rows.map((item) => [`item-${item.id}`, normalizeDateInputValue(item.dataValidade)])
    )
  );
  const [dataFabricacaoValues, setDataFabricacaoValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      rows.map((item) => [`item-${item.id}`, normalizeDateInputValue(item.dataFabricacao)])
    )
  );
  const [semDataFabricacaoRows, setSemDataFabricacaoRows] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(rows.map((item) => [`item-${item.id}`, item.semDataFabricacao ?? false]))
  );
  const [temperaturaTipoValues, setTemperaturaTipoValues] = useState<
    Record<string, TemperaturaTipo>
  >(() =>
    Object.fromEntries(rows.map((item) => [`item-${item.id}`, item.temperaturaTipo]))
  );
  const [temperaturaValues, setTemperaturaValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      rows.map((item) => [`item-${item.id}`, sanitizeTemperatureInput(item.temperatura)])
    )
  );

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [router, state.status]);

  return (
    <div className="space-y-4">
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

      <form id={formId} action={formAction}>
        <input type="hidden" name="notaId" value={String(notaId)} />
        <input type="hidden" name="returnTo" value={returnTo} />

        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="min-w-[1540px] divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 text-left dark:bg-slate-800">
              <tr>
                <th className={TABLE_HEAD_CLASS}>Produto</th>
                <th className={TABLE_HEAD_CLASS}>Qtd.</th>
                <th className={TABLE_HEAD_CLASS}>Unid.</th>
                <th className={TABLE_HEAD_CLASS}>Lote *</th>
                <th className={TABLE_HEAD_CLASS}>Data de Fabricação *</th>
                <th className={TABLE_HEAD_CLASS}>Validade *</th>
                <th className={TABLE_HEAD_CLASS}>SIF *</th>
                <th className={TABLE_HEAD_CLASS}>Temperatura *</th>
                <th className={TABLE_HEAD_CLASS}>Transporte *</th>
                <th className={TABLE_HEAD_CLASS}>Aspecto *</th>
                <th className={TABLE_HEAD_CLASS}>Embalagem *</th>
                <th className={TABLE_HEAD_CLASS}>Ação Corretiva</th>
                <th className={TABLE_HEAD_CLASS}>Responsável</th>
                <th className={TABLE_HEAD_CLASS}>Observações</th>
                <th className={TABLE_HEAD_CLASS}>Status</th>
                <th className={TABLE_HEAD_CLASS}>Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((item) => {
                const rowKey = `item-${item.id}`;
                const invalid = state.invalidRowKey === rowKey;
                const invalidLote = invalid && state.invalidField === "lote";
                const invalidSif = invalid && state.invalidField === "sif";
                const invalidDataFabricacao = invalid && state.invalidField === "dataFabricacao";
                const invalidDataValidade = invalid && state.invalidField === "dataValidade";
                const invalidTemperatura = invalid && state.invalidField === "temperatura";
                const invalidAcaoCorretiva = invalid && state.invalidField === "acaoCorretiva";
                const loteErrorId = `${rowKey}-lote-error`;
                const validadeNaoAplicavel =
                  validadeNaoAplicavelRows[rowKey] ?? item.validadeNaoAplicavel;
                const dataValidadeValue =
                  dataValidadeValues[rowKey] ?? normalizeDateInputValue(item.dataValidade);
                const dataFabricacaoValue =
                  dataFabricacaoValues[rowKey] ?? normalizeDateInputValue(item.dataFabricacao);
                const semDataFabricacao =
                  semDataFabricacaoRows[rowKey] ?? item.semDataFabricacao ?? false;
                const temperaturaTipo =
                  temperaturaTipoValues[rowKey] ?? item.temperaturaTipo;
                const temperaturaValue = temperaturaValues[rowKey] ?? String(item.temperatura ?? "");

                return (
                  <tr
                    key={item.id}
                    className={invalid ? "bg-red-50 dark:bg-red-950/30" : undefined}
                  >
                    <td className={PRODUCT_CELL_CLASS}>
                      <span className={MOBILE_FIELD_LABEL_CLASS}>Produto</span>
                      <input
                        type="text"
                        name={`${rowKey}-produto`}
                        defaultValue={item.produto}
                        required
                        disabled={readOnlyMode || xmlProductLocked}
                        className={inputClassName}
                      />
                      {item.codigoProdutoXml || item.ncm || item.cfop ? (
                        <div className="mt-1 space-y-0.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
                          {item.codigoProdutoXml ? <p>Cód.: {item.codigoProdutoXml}</p> : null}
                          {item.ncm || item.cfop ? (
                            <p>
                              {item.ncm ? `NCM: ${item.ncm}` : ""}
                              {item.ncm && item.cfop ? " | " : ""}
                              {item.cfop ? `CFOP: ${item.cfop}` : ""}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                    <td className={INFO_CELL_CLASS}>
                      <span className={MOBILE_FIELD_LABEL_CLASS}>Quantidade comprada</span>
                      <div className="bpma-readonly-field">
                        {item.quantidadeComprada || "-"}
                      </div>
                    </td>
                    <td className={INFO_CELL_CLASS}>
                      <span className={MOBILE_FIELD_LABEL_CLASS}>Unidade de medida</span>
                      <div className="bpma-readonly-field">
                        {item.unidadeMedidaCompra || "-"}
                      </div>
                    </td>
                    <td className={LOTE_CELL_CLASS}>
                      <span className={MOBILE_FIELD_LABEL_CLASS}>Lote *</span>
                      <input
                        type="text"
                        name={`${rowKey}-lote`}
                        defaultValue={item.lote}
                        required
                        pattern=".*\S.*"
                        title={LOTE_REQUIRED_MESSAGE}
                        aria-invalid={invalidLote}
                        aria-describedby={invalidLote ? loteErrorId : undefined}
                        disabled={readOnlyMode}
                        className={`${inputClassName} ${invalidLote ? FIELD_ERROR_CLASS : ""}`}
                        onInvalid={(event) => {
                          event.currentTarget.setCustomValidity(LOTE_REQUIRED_MESSAGE);
                        }}
                        onInput={(event) => {
                          event.currentTarget.setCustomValidity("");
                        }}
                        onBlur={(event) => {
                          const input = event.currentTarget;
                          input.value = input.value.trim();
                        }}
                      />
                      {invalidLote ? (
                        <span
                          id={loteErrorId}
                          className="mt-1 block text-xs font-medium text-red-600 dark:text-red-300"
                        >
                          {LOTE_REQUIRED_MESSAGE}
                        </span>
                      ) : null}
                    </td>
                    <td className={DATE_TABLE_CELL_CLASS}>
                      <span className={MOBILE_FIELD_LABEL_CLASS}>Data de Fabricação *</span>
                      <input
                        type="date"
                        name={`${rowKey}-dataFabricacao`}
                        value={semDataFabricacao ? "" : dataFabricacaoValue}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setDataFabricacaoValues((current) => ({
                            ...current,
                            [rowKey]: normalizeDateInputValue(value)
                          }));
                        }}
                        required={!semDataFabricacao}
                        disabled={readOnlyMode || semDataFabricacao}
                        className={`${inputClassName} ${DATE_INPUT_CLASS} ${
                          invalidDataFabricacao ? FIELD_ERROR_CLASS : ""
                        }`}
                      />
                      <label className="mt-2 flex items-start gap-2 text-[11px] leading-4 text-slate-600 dark:text-slate-300">
                        <input
                          type="checkbox"
                          name={`${rowKey}-semDataFabricacao`}
                          value="true"
                          checked={semDataFabricacao}
                          disabled={readOnlyMode}
                          onChange={(event) => {
                            const checked = event.currentTarget.checked;
                            setSemDataFabricacaoRows((current) => ({ ...current, [rowKey]: checked }));
                            if (checked) {
                              setDataFabricacaoValues((current) => ({ ...current, [rowKey]: "" }));
                            }
                          }}
                        />
                        {readOnlyMode && semDataFabricacao ? "Sem data de fabricação" : "Produto sem data de fabricação"}
                      </label>
                    </td>
                    <td className={DATE_TABLE_CELL_CLASS}>
                      <span className={MOBILE_FIELD_LABEL_CLASS}>Validade *</span>
                      <input
                        type="date"
                        name={`${rowKey}-dataValidade`}
                        value={validadeNaoAplicavel ? "" : dataValidadeValue}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setDataValidadeValues((current) => ({
                            ...current,
                            [rowKey]: normalizeDateInputValue(value)
                          }));
                        }}
                        required={!validadeNaoAplicavel}
                        disabled={readOnlyMode || validadeNaoAplicavel}
                        className={`${inputClassName} ${DATE_INPUT_CLASS} ${
                          invalidDataValidade ? FIELD_ERROR_CLASS : ""
                        }`}
                      />
                      <label className="mt-2 flex items-start gap-2 text-[11px] leading-4 text-slate-600 dark:text-slate-300">
                        <input
                          type="checkbox"
                          name={`${rowKey}-validadeNaoAplicavel`}
                          value="true"
                          checked={validadeNaoAplicavel}
                          disabled={readOnlyMode}
                          onChange={(event) => {
                            const checked = event.currentTarget.checked;
                            setValidadeNaoAplicavelRows((current) => ({
                              ...current,
                              [rowKey]: checked
                            }));
                            if (checked) {
                              setDataValidadeValues((current) => ({
                                ...current,
                                [rowKey]: ""
                              }));
                            }
                          }}
                        />
                        Produto sem validade
                      </label>
                    </td>
                    <td className={SIF_CELL_CLASS}>
                      <span className={MOBILE_FIELD_LABEL_CLASS}>SIF *</span>
                      <SifInput
                        name={`${rowKey}-sif`}
                        defaultValue={item.sif}
                        list="sif-opcoes"
                        disabled={readOnlyMode}
                        className={inputClassName}
                        ariaLabel={`SIF do item ${item.produto}`}
                        serverError={invalidSif ? SIF_INPUT_REQUIRED_MESSAGE : ""}
                      />
                    </td>
                    <td className={TEMPERATURE_CELL_CLASS}>
                      <span className={MOBILE_FIELD_LABEL_CLASS}>Temperatura *</span>
                      <select
                        name={`${rowKey}-temperaturaTipo`}
                        value={temperaturaTipo}
                        disabled={readOnlyMode}
                        className={inputClassName}
                        onChange={(event) => {
                          const value = event.currentTarget.value as TemperaturaTipo;
                          setTemperaturaTipoValues((current) => ({
                            ...current,
                            [rowKey]: value
                          }));
                          if (value !== "NUMERICA") {
                            setTemperaturaValues((current) => ({
                              ...current,
                              [rowKey]: ""
                            }));
                          }
                        }}
                      >
                        <option value="NUMERICA">Aferida</option>
                        <option value="AMBIENTE">Ambiente</option>
                        <option value="NAO_APLICAVEL">Não se aplica</option>
                      </select>
                      <input
                        type="text"
                        name={`${rowKey}-temperatura`}
                        inputMode="decimal"
                        value={temperaturaTipo === "NUMERICA" ? temperaturaValue : ""}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setTemperaturaValues((current) => ({
                            ...current,
                            [rowKey]: sanitizeTemperatureInput(value)
                          }));
                        }}
                        onBlur={(event) => {
                          const value = event.currentTarget.value;
                          const normalizedValue = normalizeTemperatureOnBlur(value);
                          setTemperaturaValues((current) => ({
                            ...current,
                            [rowKey]: normalizedValue
                          }));
                        }}
                        required={temperaturaTipo === "NUMERICA"}
                        disabled={readOnlyMode || temperaturaTipo !== "NUMERICA"}
                        className={`${inputClassName} ${
                          invalidTemperatura ? FIELD_ERROR_CLASS : ""
                        }`}
                      />
                    </td>
                    <td className={SELECT_CELL_CLASS}>
                      <span className={MOBILE_FIELD_LABEL_CLASS}>Transporte *</span>
                      <select
                        name={`${rowKey}-transporteEntregador`}
                        defaultValue={item.transporteEntregador}
                        required
                        disabled={readOnlyMode}
                        className={inputClassName}
                      >
                        <option value="">Selecione</option>
                        <option value="CONFORME">Conforme</option>
                        <option value="NAO_CONFORME">Não Conforme</option>
                      </select>
                    </td>
                    <td className={SELECT_CELL_CLASS}>
                      <span className={MOBILE_FIELD_LABEL_CLASS}>Aspecto *</span>
                      <select
                        name={`${rowKey}-aspectoSensorial`}
                        defaultValue={item.aspectoSensorial}
                        required
                        disabled={readOnlyMode}
                        className={inputClassName}
                      >
                        <option value="">Selecione</option>
                        <option value="CONFORME">Conforme</option>
                        <option value="NAO_CONFORME">Não Conforme</option>
                      </select>
                    </td>
                    <td className={SELECT_CELL_CLASS}>
                      <span className={MOBILE_FIELD_LABEL_CLASS}>Embalagem *</span>
                      <select
                        name={`${rowKey}-embalagem`}
                        defaultValue={item.embalagem}
                        required
                        disabled={readOnlyMode}
                        className={inputClassName}
                      >
                        <option value="">Selecione</option>
                        <option value="CONFORME">Conforme</option>
                        <option value="NAO_CONFORME">Não Conforme</option>
                      </select>
                    </td>
                    <td className={TEXT_CELL_CLASS}>
                      <span className={MOBILE_FIELD_LABEL_CLASS}>Ação Corretiva</span>
                      <input
                        type="text"
                        name={`${rowKey}-acaoCorretiva`}
                        defaultValue={item.acaoCorretiva}
                        disabled={readOnlyMode}
                        className={`${inputClassName} ${
                          invalidAcaoCorretiva ? FIELD_ERROR_CLASS : ""
                        }`}
                      />
                    </td>
                    <td className={READONLY_CELL_CLASS}>
                      <span className={MOBILE_FIELD_LABEL_CLASS}>Responsável automático</span>
                      <div className="bpma-readonly-field">
                        {readOnlyMode ? (item.responsavelRecebimento ?? "-") : responsavelLogado}
                      </div>
                    </td>
                    <td className={TEXT_CELL_CLASS}>
                      <span className={MOBILE_FIELD_LABEL_CLASS}>Observações</span>
                      <input
                        type="text"
                        name={`${rowKey}-observacoes`}
                        defaultValue={item.observacoes}
                        disabled={readOnlyMode}
                        className={inputClassName}
                      />
                    </td>
                    <td className={STATUS_CELL_CLASS}>
                      <span className={MOBILE_FIELD_LABEL_CLASS}>Status</span>
                      <ConformidadeBadge value={getConformidadeBadgeValue(item.statusGeral)} />
                    </td>
                    <td className={ACTION_CELL_CLASS}>
                      <span className={MOBILE_FIELD_LABEL_CLASS}>Ação</span>
                      {!canDeleteItems ? (
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {readOnlyMode ? "Somente consulta" : "Sem exclusão"}
                        </span>
                      ) : (
                        <button
                          type="submit"
                          form={`delete-item-form-${item.id}`}
                          className="btn-danger"
                        >
                          Excluir
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <datalist id="sif-opcoes">
          <option value="NA" />
        </datalist>

        {!readOnlyMode ? (
          <div className="mt-4 btn-group">
            <SaveButton />
          </div>
        ) : null}

        {!readOnlyMode && finalizarSelecionado ? (
          <div
            className="bpma-modal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="Finalizar Conferência"
          >
            <section className="bpma-modal-panel max-w-lg">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Finalizar Conferência
                  </h2>
                  <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    <p>
                      Nota <strong>{noteNumber}</strong> com {itemCount} item(ns).
                    </p>
                  </div>
                </div>
                <Link
                  href={returnTo}
                  className="btn-secondary shrink-0"
                  aria-label="Fechar Finalizar Conferência"
                >
                  Fechar
                </Link>
              </div>
              <div className="mt-4">
                {state.status === "error" && state.message ? (
                  <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
                    {state.message}
                  </p>
                ) : null}
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Confirme a finalização após revisar todos os itens da nota. Os campos preenchidos
                  nesta tela serão salvos junto com a finalização.
                </p>
                <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Link href={returnTo} className="btn-secondary text-center">
                    Cancelar
                  </Link>
                  <FinalizeButton />
                </div>
              </div>
            </section>
          </div>
        ) : null}
      </form>
    </div>
  );
}
