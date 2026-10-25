"use client";
import { formatAppDateInput, getAppDate } from "@/lib/date-time";

import Link from "next/link";
import { useId, useState } from "react";
import { useFormStatus } from "react-dom";

import { importXmlAction } from "./actions";

type XmlImportFormProps = {
  workflowRequestId?:string;
  returnTo: string;
  cancelHref: string;
};

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="btn-primary" disabled={disabled || pending}>
      {pending ? "Importando..." : "Confirmar importação"}
    </button>
  );
}

export function XmlImportForm({ returnTo, cancelHref, workflowRequestId }: XmlImportFormProps) {
  const inputId = useId();
  const [fileName, setFileName] = useState("");

  return (
    <form action={importXmlAction} className="mt-4 grid gap-4">{workflowRequestId&&<input type="hidden" name="workflowRequestId" value={workflowRequestId}/>}
      <input type="hidden" name="returnTo" value={returnTo} />
      <label className="block text-sm">Data do recebimento *<input type="date" name="data" required defaultValue={formatAppDateInput(getAppDate())} max={formatAppDateInput(getAppDate())} className="bpma-input" /></label>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
          XML da Nota Fiscal (ADM)
        </p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Selecione um arquivo XML válido para importar a nota.
        </p>

        <label className="btn-action relative mt-3 w-full overflow-hidden sm:w-auto" htmlFor={inputId}>
          Importar XML
          <input
            id={inputId}
            type="file"
            name="xmlFile"
            accept=".xml,text/xml,application/xml"
            required
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            onChange={(event) => {
              setFileName(event.currentTarget.files?.[0]?.name ?? "");
            }}
          />
        </label>

        <p className="mt-3 break-words text-sm text-slate-600 dark:text-slate-300">
          {fileName ? `Arquivo selecionado: ${fileName}` : "Nenhum arquivo selecionado."}
        </p>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Link href={cancelHref} className="btn-secondary text-center">
          Cancelar
        </Link>
        <SubmitButton disabled={!fileName} />
      </div>
    </form>
  );
}
