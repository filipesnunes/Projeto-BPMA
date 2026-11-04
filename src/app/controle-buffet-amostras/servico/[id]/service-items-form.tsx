"use client";
import { validateBuffetRow, suggestedBuffetAction, type BuffetRowIssue, type BuffetValues } from "../../row-validation";
import { formatAppDateInput, getAppDate } from "@/lib/date-time";
import { CollectiveTimeFields } from "./collective-time-fields";
import type { CollectiveTimeTarget } from "../../collective-time";
import { ExecutionTimeFields, type ExecutionTimeValue } from "@/components/forms/execution-time-fields";

import { startTransition, useCallback, useActionState, useEffect, useRef, useState, type FormEvent } from "react";
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
  parseTemperatureInput,
  getClassificacaoLabel,
  normalizeSearchText,
  THERMAL_BOTTLE_EQUIPMENT_LABEL
} from "../../utils";

type ActionState = {
  status: "idle" | "success" | "error";
  message: string;
  invalidRowKey?: string;
  issues?: BuffetRowIssue[];
};

type AcaoCorretivaOption = {
  id: number;
  nome: string;
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
  pendingReason?: string;
};

type ServiceItemsFormProps = {
  workflowVersion?: number;
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
  workflowVersion,
  servicoId,
  dataInput,
  disabled
}: {
  servicoId: number;
  dataInput: string;
  disabled: boolean;
  workflowVersion?: number;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction] = useActionState(createExtraItemStateAction, INITIAL_STATE);

  useEffect(() => {
    if (state.status === "success") {
      setIsOpen(false);
      router.refresh();
    }
  }, [router, state]);

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

            <form action={formAction} className="mt-4 grid gap-3">{workflowVersion!==undefined&&<input type="hidden" name="versao" value={workflowVersion}/>}
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
  workflowVersion,
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
  const [state, formAction, isSaving] = useActionState(saveServicoItemsStateAction, INITIAL_STATE);
  const changedFields = useRef(new Set<string>());
  const formRef = useRef<HTMLFormElement | null>(null);
  const [pendingIssues, setPendingIssues] = useState<BuffetRowIssue[]>([]);
  const [temperatures, setTemperatures] = useState<Record<string, string>>({});
  const initialTimes = () => Object.fromEntries(rows.map(row=>[row.rowKey,{horarioExecucao:row.horarioExecucao??"",horarioNaoInformado:Boolean(row.horarioNaoInformado),justificativaHorario:row.justificativaHorario??""}]));
  const [executionTimes, setExecutionTimes] = useState<Record<string,ExecutionTimeValue>>(initialTimes);
  const executionTimesRef = useRef(executionTimes);
  const retroactive = dataInput < formatAppDateInput(getAppDate());
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

      router.refresh();
    }
  }, [router, state.status]);

  useEffect(() => {
    const times=Object.fromEntries(rows.map(row=>[row.rowKey,{horarioExecucao:row.horarioExecucao??"",horarioNaoInformado:Boolean(row.horarioNaoInformado),justificativaHorario:row.justificativaHorario??""}]));
    executionTimesRef.current=times;setExecutionTimes(times);
    setAmbientRows(Object.fromEntries(rows.map((row) => [row.rowKey, row.temperaturaAmbiente])));
    setNonServedRows(
      Object.fromEntries(rows.map((row) => [row.rowKey, row.status === "NAO_SERVIDO"]))
    );
  }, [rows]);

  const valuesFor = useCallback((row: ServiceItemFormRow, data: FormData): BuffetValues => {
    const values: BuffetValues = {tcEquipamento:row.tcEquipamento,primeiraTc:row.primeiraTc,temperaturaTipo:getTemperatureTypeDefault(row),acaoCorretiva:row.acaoCorretiva,observacao:row.observacao,naoServido:String(row.status==="NAO_SERVIDO"),horarioExecucao:row.horarioExecucao??"",horarioNaoInformado:String(Boolean(row.horarioNaoInformado)),justificativaHorario:row.justificativaHorario??""};
    for(const field of Object.keys(values))if(data.has(row.rowKey+"-"+field))values[field]=String(data.get(row.rowKey+"-"+field)??"");
    if(changedFields.current.has(row.rowKey+"-horarioNaoInformado")&&!data.has(row.rowKey+"-horarioNaoInformado"))values.horarioNaoInformado="false";
    if(retroactive){const time=executionTimesRef.current[row.rowKey];if(time){values.horarioExecucao=time.horarioExecucao;values.horarioNaoInformado=String(time.horarioNaoInformado);values.justificativaHorario=time.justificativaHorario;}}
    return values;
  }, [retroactive]);
  const collectPendingIssues = useCallback((data: FormData): BuffetRowIssue[] => rows.filter(row=>!row.bloqueado).flatMap(row=>{
    const missingFields=validateBuffetRow(row,valuesFor(row,data),{date:dataInput,actions:acoesCorretivas,historicalAction:row.acaoCorretiva});
    return missingFields.length?[{rowKey:row.rowKey,nome:row.nome,missingFields}]:[];
  }),[rows,dataInput,acoesCorretivas,valuesFor]);
  useEffect(()=>{
    const form=formRef.current;if(!form)return;
    for(const row of rows){
      if(row.bloqueado)continue;
      const action=form.elements.namedItem(row.rowKey+"-acaoCorretiva") as HTMLSelectElement|null;
      if(!action||action.value)continue;
      const suggested=suggestedBuffetAction(row,valuesFor(row,new FormData(form)),acoesCorretivas);
      if(suggested){action.value=suggested;changedFields.current.add(row.rowKey+"-acaoCorretiva");}
    }
    setPendingIssues(collectPendingIssues(new FormData(form)));
  },[collectPendingIssues,rows,valuesFor,acoesCorretivas]);
  useEffect(()=>{if(state.status==="error"&&state.issues)setPendingIssues(state.issues);},[state]);
  const recheck = () => {if(formRef.current)setPendingIssues(collectPendingIssues(new FormData(formRef.current)));};
  const updateExecutionTimes = (changes:Record<string,ExecutionTimeValue>) => {
    const next={...executionTimesRef.current};
    for(const [rowKey,value] of Object.entries(changes)){
      const previous=next[rowKey];
      for(const field of ["horarioExecucao","horarioNaoInformado","justificativaHorario"] as const)if(previous?.[field]!==value[field])changedFields.current.add(rowKey+"-"+field);
      next[rowKey]=value;
    }
    executionTimesRef.current=next;setExecutionTimes(next);recheck();
  };
  const applyCollectiveTime = (time:string,targets:CollectiveTimeTarget[]) => updateExecutionTimes(Object.fromEntries(targets.map(target=>[target.rowKey,{horarioExecucao:time,horarioNaoInformado:false,justificativaHorario:""}])));
  const changeRow = (event: FormEvent<HTMLFormElement>) => {
    const target=event.target as HTMLInputElement;
    const row=rows.find(row=>target.name?.startsWith(row.rowKey+"-"));if(!row)return;
    const field=target.name.slice(row.rowKey.length+1);
    changedFields.current.add(row.rowKey+"-"+(field==="naoServidoToggle"?"naoServido":field));
    const form=event.currentTarget;
    if(["primeiraTc","temperaturaTipo"].includes(field)){
      const values=valuesFor(row,new FormData(form));
      const action=form.elements.namedItem(row.rowKey+"-acaoCorretiva") as HTMLSelectElement|null;
      const suggested=suggestedBuffetAction(row,values,acoesCorretivas);
      if(action&&action.value!==suggested){action.value=suggested;changedFields.current.add(row.rowKey+"-acaoCorretiva");}
      setTemperatures(current=>({...current,[row.rowKey]:values.primeiraTc}));
    }
    // Wait for checkbox/ambient controls to commit their disabled/hidden fields.
    requestAnimationFrame(recheck);
  };
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();if(isSaving)return;
    const form=event.currentTarget;
    const data=new FormData(form);
    if(retroactive)for(const row of rows){
      if(row.bloqueado||valuesFor(row,data).naoServido==="true")continue;
      const time=executionTimesRef.current[row.rowKey];if(time)for(const [field,value]of Object.entries(time))data.set(row.rowKey+"-"+field,String(value));
    }
    for(const name of changedFields.current)data.append("changedField",name);
    const issues=collectPendingIssues(data);setPendingIssues(issues);
    if(issues.length)return;
    startTransition(()=>formAction(data));
  };
  const locateIssue = (rowKey:string) => {
    setItemSearch("");requestAnimationFrame(()=>document.getElementById(rowKey)?.scrollIntoView({behavior:"smooth",block:"center"}));
  };

  if (rows.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Nenhum item ativo está vinculado a este serviço. Se necessário, adicione um item extra para
          esta data.
        </p>
        <AddExtraItemModal workflowVersion={workflowVersion}
          servicoId={servicoId}
          dataInput={dataInput}
          disabled={fechamentoAssinado}
        />
      </div>
    );
  }


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <AddExtraItemModal workflowVersion={workflowVersion}
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

      {pendingIssues.length>0&&<section className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-900 dark:bg-red-950 dark:text-red-100" aria-label="Resumo de pendências">
        <p role="status">Encontramos {pendingIssues.length} itens que precisam de conferência.</p>
        <ul>{pendingIssues.map(issue=><li key={issue.rowKey}><button type="button" className="text-left underline" onClick={()=>locateIssue(issue.rowKey)}>{issue.nome}: {issue.missingFields.join(", ")}</button></li>)}</ul>
      </section>}
      <button type="button" className="btn-secondary" onClick={recheck}>Conferir pendências</button>
      <form ref={formRef} action={formAction} className="space-y-4" onSubmit={handleSubmit} aria-busy={isSaving} onChange={changeRow} noValidate>
        {workflowVersion!==undefined&&<input type="hidden" name="versao" value={workflowVersion}/>}
        <input type="hidden" name="rowIntentVersion" value="1"/>
        <input type="hidden" name="servicoId" value={String(servicoId)} />
        <input type="hidden" name="data" value={dataInput} />
        <input type="hidden" name="returnTo" value={returnTo} />
        {retroactive&&<CollectiveTimeFields rows={rows} read={target=>{const row=rows.find(row=>row.rowKey===target.rowKey);return row&&formRef.current?valuesFor(row,new FormData(formRef.current)):{};}} onApply={applyCollectiveTime} disabled={fechamentoAssinado||!hasEditableRows||isSaving}/>}
        {normalizedItemSearch && !hasSearchMatches ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
            Nenhum item encontrado.
          </p>
        ) : null}

        <div className="grid gap-3 xl:grid-cols-2">
          {rows.map((row) => {
            const currentFood=parseTemperatureInput(temperatures[row.rowKey]??row.primeiraTc);
            const acaoEstaAtiva = acoesCorretivas.some(
              (option) => option.nome === row.acaoCorretiva
            );
            const invalid =
              pendingIssues.some(issue=>issue.rowKey===row.rowKey);
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
                id={row.rowKey}
                key={row.rowKey}
                className={`${hiddenBySearch ? "hidden" : ""} rounded-lg border p-4 ${
                  invalid
                    ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950"
                    : naoServido
                    ? "border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
                    : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                }`}
              >
                {pendingIssues.filter(issue=>issue.rowKey===row.rowKey).map(issue=><p key={issue.rowKey} role="status" className="mb-3 text-sm text-red-800 dark:text-red-200">Pendente: {issue.missingFields.join("; ")}.</p>)}
                <input type="hidden" name="rowKey" value={row.rowKey} />
                {!row.bloqueado && !naoServido && <ExecutionTimeFields required={false} date={dataInput} prefix={row.rowKey + "-"} defaultTime={row.horarioExecucao ?? ""} defaultUnknown={row.horarioNaoInformado} defaultJustification={row.justificativaHorario ?? ""} value={retroactive?(executionTimes[row.rowKey]??{horarioExecucao:row.horarioExecucao??"",horarioNaoInformado:Boolean(row.horarioNaoInformado),justificativaHorario:row.justificativaHorario??""}):undefined} onValueChange={retroactive?value=>updateExecutionTimes({[row.rowKey]:value}):undefined} />}
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
                      <TemperatureStatusBadge status={currentFood===null?null:avaliarTemperaturaBuffet(row.classificacao,currentFood).status} />
                    )}
                  </div>
                </div>

                <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <input
                    type="checkbox"
                    name={`${row.rowKey}-naoServidoToggle`}
                    checked={naoServido}
                    disabled={row.bloqueado}
                    className="h-5 w-5"
                    onChange={(event) => {changedFields.current.add(`${row.rowKey}-naoServido`);setNonServedRows(current=>({...current,[row.rowKey]:event.target.checked}));}}
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
                      aria-invalid={pendingIssues.some(issue=>issue.rowKey===row.rowKey&&issue.missingFields.some(field=>field.includes("ação corretiva")))}
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
                    Executor original: <strong>{row.responsavelNome ?? usuarioLogado}</strong>
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

        <label className="block text-sm">Justificativa das correções (opcional)
          <textarea name="justificativaCorrecao" maxLength={4000} rows={2} className={inputClassName} disabled={!hasEditableRows} placeholder="Contextualize a correção sem substituir a autoria ou o horário original."/>
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <SubmitItemsButton disabled={!hasEditableRows||isSaving} />
        </div>
      </form>


    </div>
  );
}
