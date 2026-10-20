"use client";

export function UnreportedTimeFields({ unknown, onChange, justification = "" }: {
  unknown: boolean; onChange: (value: boolean) => void; justification?: string | null;
}) {
  return <div className="space-y-2 md:col-span-2">
    <p className="text-sm">Lançamento retroativo. Informe apenas procedimentos efetivamente realizados.</p>
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name="horarioNaoInformado" value="true" checked={unknown}
        onChange={event => onChange(event.currentTarget.checked)} />Horário não informado
    </label>
    {unknown ? <label className="block text-sm">Justificativa da ausência do horário *
      <textarea name="justificativaHorario" required maxLength={1000} defaultValue={justification ?? ""} className="bpma-input" rows={2} />
    </label> : null}
  </div>;
}
