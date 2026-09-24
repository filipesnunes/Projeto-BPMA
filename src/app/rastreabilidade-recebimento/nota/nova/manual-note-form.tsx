"use client";

import { useActionState, useState } from "react";

import { createManualNoteStateAction } from "../../actions";
import { SIF_INPUT_REQUIRED_MESSAGE } from "../../sif";
import { SifInput } from "../../sif-input";

type ActionState = {
  status: "idle" | "success" | "error";
  message: string;
  invalidField?: string;
};

type ManualNoteFormProps = {
  responsavelLogado: string;
  inputClassName: string;
};

const INITIAL_STATE: ActionState = {
  status: "idle",
  message: ""
};

type TemperaturaTipo = "NUMERICA" | "AMBIENTE" | "NAO_APLICAVEL";

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

export function ManualNoteForm({
  responsavelLogado,
  inputClassName
}: ManualNoteFormProps) {
  const [state, formAction] = useActionState(createManualNoteStateAction, INITIAL_STATE);
  const [validadeNaoAplicavel, setValidadeNaoAplicavel] = useState(false);
  const [semDataFabricacao, setSemDataFabricacao] = useState(false);
  const [dataFabricacao, setDataFabricacao] = useState("");
  const [dataValidade, setDataValidade] = useState("");
  const [temperaturaTipo, setTemperaturaTipo] = useState<TemperaturaTipo>("NUMERICA");
  const [temperatura, setTemperatura] = useState("");
  const errorInputClass = `${inputClassName} border-red-400 bg-red-50 text-red-700 focus:border-red-500 focus:ring-red-500 dark:border-red-700 dark:bg-red-950 dark:text-red-200`;

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-2">
      <input type="hidden" name="returnTo" value="/rastreabilidade-recebimento/nota/nova" />

      {state.status === "error" && state.message ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 md:col-span-2 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {state.message}
        </div>
      ) : null}

      <label className="text-sm text-slate-700 dark:text-slate-200">
        Fornecedor *
        <input type="text" name="fornecedor" required className={inputClassName} />
      </label>
      <label className="text-sm text-slate-700 dark:text-slate-200">
        Nota Fiscal *
        <input type="text" name="notaFiscal" required className={inputClassName} />
      </label>

      <label className="text-sm text-slate-700 dark:text-slate-200">
        Produto *
        <input type="text" name="produto" required className={inputClassName} />
      </label>
      <label className="text-sm text-slate-700 dark:text-slate-200">
        Lote *
        <input type="text" name="lote" required className={inputClassName} />
      </label>
      <div className="text-sm text-slate-700 dark:text-slate-200">
        <p>Data de Fabricação *</p>
        <input
          type="date"
          name="dataFabricacao"
          value={semDataFabricacao ? "" : dataFabricacao}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setDataFabricacao(value);
          }}
          required={!semDataFabricacao}
          disabled={semDataFabricacao}
          className={state.invalidField === "dataFabricacao" ? errorInputClass : inputClassName}
        />
        <label className="mt-2 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            name="semDataFabricacao"
            value="true"
            checked={semDataFabricacao}
            onChange={(event) => {
              const checked = event.currentTarget.checked;
              setSemDataFabricacao(checked);
              if (checked) setDataFabricacao("");
            }}
          />
          Produto sem data de fabricação
        </label>
      </div>
      <div className="text-sm text-slate-700 dark:text-slate-200">
        <p>Validade *</p>
        <input
          type="date"
          name="dataValidade"
          required={!validadeNaoAplicavel}
          disabled={validadeNaoAplicavel}
          value={validadeNaoAplicavel ? "" : dataValidade}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setDataValidade(value);
          }}
          className={state.invalidField === "dataValidade" ? errorInputClass : inputClassName}
        />
        <label className="mt-2 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            name="validadeNaoAplicavel"
            value="true"
            checked={validadeNaoAplicavel}
            onChange={(event) => {
              const checked = event.currentTarget.checked;
              setValidadeNaoAplicavel(checked);
              if (checked) {
                setDataValidade("");
              }
            }}
          />
          Produto sem validade
        </label>
      </div>
      <label className="text-sm text-slate-700 dark:text-slate-200">
        SIF *
        <SifInput
          name="sif"
          list="sif-opcoes-manual"
          className={inputClassName}
          serverError={
            state.invalidField === "sif" ? SIF_INPUT_REQUIRED_MESSAGE : ""
          }
        />
      </label>
      <label className="text-sm text-slate-700 dark:text-slate-200">
        Temperatura (°C) *
        <select
          name="temperaturaTipo"
          value={temperaturaTipo}
          onChange={(event) => {
            const value = event.currentTarget.value as TemperaturaTipo;
            setTemperaturaTipo(value);
            if (value !== "NUMERICA") {
              setTemperatura("");
            }
          }}
          className={inputClassName}
        >
          <option value="NUMERICA">Temperatura aferida</option>
          <option value="AMBIENTE">Produto ambiente / não exige aferição</option>
          <option value="NAO_APLICAVEL">Temperatura não se aplica</option>
        </select>
        <input
          type="text"
          name="temperatura"
          required={temperaturaTipo === "NUMERICA"}
          disabled={temperaturaTipo !== "NUMERICA"}
          inputMode="decimal"
          value={temperaturaTipo === "NUMERICA" ? temperatura : ""}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setTemperatura(sanitizeTemperatureInput(value));
          }}
          onBlur={(event) => {
            const value = event.currentTarget.value;
            setTemperatura(normalizeTemperatureOnBlur(value));
          }}
          className={state.invalidField === "temperatura" ? errorInputClass : inputClassName}
        />
      </label>
      <label className="text-sm text-slate-700 dark:text-slate-200">
        Transporte / Entregador *
        <select name="transporteEntregador" required className={inputClassName}>
          <option value="">Selecione</option>
          <option value="CONFORME">Conforme</option>
          <option value="NAO_CONFORME">Não Conforme</option>
        </select>
      </label>
      <label className="text-sm text-slate-700 dark:text-slate-200">
        Aspecto Sensorial *
        <select name="aspectoSensorial" required className={inputClassName}>
          <option value="">Selecione</option>
          <option value="CONFORME">Conforme</option>
          <option value="NAO_CONFORME">Não Conforme</option>
        </select>
      </label>
      <label className="text-sm text-slate-700 dark:text-slate-200">
        Embalagem *
        <select name="embalagem" required className={inputClassName}>
          <option value="">Selecione</option>
          <option value="CONFORME">Conforme</option>
          <option value="NAO_CONFORME">Não Conforme</option>
        </select>
      </label>
      <label className="text-sm text-slate-700 dark:text-slate-200">
        Ação Corretiva
        <input
          type="text"
          name="acaoCorretiva"
          className={state.invalidField === "acaoCorretiva" ? errorInputClass : inputClassName}
        />
      </label>
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
        <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Responsável pelo Recebimento
        </p>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {responsavelLogado}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Preenchido automaticamente pelo usuário logado.
        </p>
      </div>
      <label className="text-sm text-slate-700 md:col-span-2 dark:text-slate-200">
        Observações
        <textarea name="observacoes" rows={3} className={inputClassName} />
      </label>

      <div className="md:col-span-2">
        <button type="submit" className="btn-primary">
          Criar Nota
        </button>
      </div>
      <datalist id="sif-opcoes-manual">
        <option value="NA" />
      </datalist>
    </form>
  );
}
