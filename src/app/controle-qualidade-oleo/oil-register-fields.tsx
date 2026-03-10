"use client";

import { StatusQualidadeOleo } from "@prisma/client";
import Image from "next/image";
import { useMemo, useState } from "react";

import { getStatusLabel, isTemperatureCritical, parseTemperatureInput } from "./utils";
import {
  findCanonicalOilStripRuleByLabel,
  getOilStripImageByLabel
} from "./options";

type OilStripOptionPreview = {
  rotulo: string;
  descricao: string;
  statusAssociado: StatusQualidadeOleo;
};

type OilRegisterFieldsProps = {
  options: OilStripOptionPreview[];
  defaultFita?: string;
  defaultTemperatura?: string;
  inputClassName: string;
};

export function OilRegisterFields({
  options,
  defaultFita = "",
  defaultTemperatura = "",
  inputClassName
}: OilRegisterFieldsProps) {
  const [fitaSelecionada, setFitaSelecionada] = useState(defaultFita);
  const [temperaturaInput, setTemperaturaInput] = useState(defaultTemperatura);

  const optionMap = useMemo(() => {
    return new Map(options.map((option) => [option.rotulo, option]));
  }, [options]);

  const optionSelecionada = optionMap.get(fitaSelecionada);
  const regraCanonicaSelecionada = optionSelecionada
    ? findCanonicalOilStripRuleByLabel(optionSelecionada.rotulo)
    : null;
  const statusAutomatico = optionSelecionada
    ? getStatusLabel(
        regraCanonicaSelecionada?.statusAssociado ?? optionSelecionada.statusAssociado
      )
    : "";
  const orientacaoAutomatica =
    regraCanonicaSelecionada?.descricao ?? optionSelecionada?.descricao ?? "";

  const temperatura = parseTemperatureInput(temperaturaInput);
  const temperaturaCritica = temperatura !== null && isTemperatureCritical(temperatura);

  return (
    <>
      <fieldset className="md:col-span-2">
        <legend className="text-sm text-slate-700 dark:text-slate-200">% da Fita do Óleo *</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {options.map((option) => {
            const isSelected = fitaSelecionada === option.rotulo;

            return (
              <label
                key={option.rotulo}
                className={`cursor-pointer rounded-lg border p-3 transition ${
                  isSelected
                    ? "border-slate-900 bg-slate-100 ring-1 ring-slate-900 dark:border-slate-100 dark:bg-slate-700 dark:ring-slate-100"
                    : "border-slate-300 bg-white hover:border-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:hover:border-slate-500"
                }`}
              >
                <input
                  type="radio"
                  name="fitaOleo"
                  required
                  value={option.rotulo}
                  checked={isSelected}
                  onChange={(event) => {
                    setFitaSelecionada(event.target.value);
                  }}
                  className="sr-only"
                />
                <div className="flex items-center gap-3">
                  <Image
                    src={getOilStripImageByLabel(option.rotulo)}
                    alt={`Fita ${option.rotulo}`}
                    width={96}
                    height={36}
                    className="h-9 w-24 rounded-md border border-slate-200 bg-white object-cover dark:border-slate-600"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {option.rotulo}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      {getStatusLabel(
                        findCanonicalOilStripRuleByLabel(option.rotulo)?.statusAssociado ??
                          option.statusAssociado
                      )}
                    </p>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </fieldset>

      <label className="text-sm text-slate-700 dark:text-slate-200">
        Temperatura (°C) *
        <input
          type="text"
          name="temperatura"
          required
          inputMode="decimal"
          placeholder="Ex.: 175"
          value={temperaturaInput}
          className={`${inputClassName} ${
            temperaturaCritica
              ? "border-red-400 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-200"
              : ""
          }`}
          onChange={(event) => {
            setTemperaturaInput(event.target.value);
          }}
        />
        {temperaturaCritica ? (
          <span className="mt-1 block text-xs text-red-600 dark:text-red-300">
            Temperatura acima de 180°C: fora do padrão / crítico.
          </span>
        ) : null}
      </label>

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
        <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Status Automático
        </p>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {statusAutomatico || "Selecione a fita do óleo"}
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
        <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Fita Selecionada
        </p>
        {optionSelecionada ? (
          <div className="mt-2 flex items-center gap-3">
            <Image
              src={getOilStripImageByLabel(optionSelecionada.rotulo)}
              alt={`Fita ${optionSelecionada.rotulo}`}
              width={96}
              height={36}
              className="h-9 w-24 rounded-md border border-slate-200 bg-white object-cover dark:border-slate-600"
            />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {optionSelecionada.rotulo}
            </span>
          </div>
        ) : (
          <p className="text-sm text-slate-800 dark:text-slate-100">
            Selecione a fita do óleo para visualizar.
          </p>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 md:col-span-2 dark:border-slate-700 dark:bg-slate-800">
        <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Orientação Automática
        </p>
        <p className="text-sm text-slate-800 dark:text-slate-100">
          {orientacaoAutomatica || "Selecione a fita para visualizar a orientação."}
        </p>
      </div>
    </>
  );
}
