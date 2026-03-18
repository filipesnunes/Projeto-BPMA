"use client";

import { useMemo, useState } from "react";

import { SearchableOptionField } from "./searchable-option-field";
import {
  CategoriaTemperatura,
  findMatchingTemperatureRule,
  getStatusLabel,
  parseTemperatureInput,
  RegraTemperaturaCategoria
} from "./utils";

type EquipamentoCategoria = {
  nome: string;
  categoria: CategoriaTemperatura;
};

type RegraCategoriaComTipo = RegraTemperaturaCategoria & {
  categoria: CategoriaTemperatura;
};

type AutomaticCorrectiveActionFieldsProps = {
  equipamentoOptions: string[];
  equipamentosCategoria: EquipamentoCategoria[];
  regrasCategoria: RegraCategoriaComTipo[];
  defaultEquipamento?: string;
  defaultTemperatura?: string;
  defaultAcaoCorretiva?: string | null;
  inputClassName: string;
};

export function AutomaticCorrectiveActionFields({
  equipamentoOptions,
  equipamentosCategoria,
  regrasCategoria,
  defaultEquipamento = "",
  defaultTemperatura = "",
  defaultAcaoCorretiva = null,
  inputClassName
}: AutomaticCorrectiveActionFieldsProps) {
  const [equipamentoSelecionado, setEquipamentoSelecionado] = useState(defaultEquipamento);
  const [temperaturaInput, setTemperaturaInput] = useState(defaultTemperatura);

  const categoriaPorEquipamento = useMemo(() => {
    const map = new Map<string, CategoriaTemperatura>();

    for (const equipamento of equipamentosCategoria) {
      map.set(equipamento.nome, equipamento.categoria);
    }

    return map;
  }, [equipamentosCategoria]);

  const regrasPorCategoria = useMemo(() => {
    const map = new Map<CategoriaTemperatura, RegraCategoriaComTipo[]>();

    for (const regra of regrasCategoria) {
      const rules = map.get(regra.categoria) ?? [];
      rules.push(regra);
      map.set(regra.categoria, rules);
    }

    return map;
  }, [regrasCategoria]);

  const avaliacao = useMemo(() => {
    const categoria = categoriaPorEquipamento.get(equipamentoSelecionado);
    const temperatura = parseTemperatureInput(temperaturaInput);

    if (!categoria || temperatura === null) {
      return {
        statusValue: "",
        statusLabel: "",
        acaoCorretiva: defaultAcaoCorretiva ?? ""
      };
    }

    const regras = regrasPorCategoria.get(categoria) ?? [];
    const regraCorrespondente = findMatchingTemperatureRule(temperatura, regras);

    if (!regraCorrespondente) {
      return {
        statusValue: "",
        statusLabel: "",
        acaoCorretiva: defaultAcaoCorretiva ?? ""
      };
    }

    return {
      statusValue: regraCorrespondente.status,
      statusLabel: getStatusLabel(regraCorrespondente.status),
      acaoCorretiva: regraCorrespondente.acaoCorretiva
    };
  }, [
    categoriaPorEquipamento,
    defaultAcaoCorretiva,
    equipamentoSelecionado,
    regrasPorCategoria,
    temperaturaInput
  ]);

  return (
    <>
      <label className="text-sm text-slate-700 dark:text-slate-200">
        Equipamento *
        <SearchableOptionField
          name="equipamento"
          options={equipamentoOptions}
          defaultValue={defaultEquipamento}
          placeholder="Digite para buscar..."
          required
          onSelectedValueChange={setEquipamentoSelecionado}
        />
      </label>

      <label className="text-sm text-slate-700 dark:text-slate-200">
        Temperatura Aferida (°C) *
        <input
          type="text"
          name="temperaturaAferida"
          required
          inputMode="decimal"
          placeholder="Ex.: 4,0"
          defaultValue={defaultTemperatura}
          className={inputClassName}
          onChange={(event) => {
            setTemperaturaInput(event.target.value);
          }}
        />
      </label>

      <label className="text-sm text-slate-700 dark:text-slate-200 md:col-span-2">
        Ação Corretiva (Automática)
        <input type="hidden" name="statusCalculado" value={avaliacao.statusValue} readOnly />
        <input type="hidden" name="acaoCorretiva" value={avaliacao.acaoCorretiva} readOnly />
        <input
          type="text"
          value={avaliacao.acaoCorretiva}
          readOnly
          className={`${inputClassName} cursor-not-allowed bg-slate-100 dark:bg-slate-700`}
          placeholder="Será preenchida automaticamente"
        />
        <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
          {avaliacao.statusLabel
            ? `Status calculado automaticamente: ${avaliacao.statusLabel}.`
            : "Preencha equipamento e temperatura para calcular automaticamente."}
        </span>
      </label>
    </>
  );
}
