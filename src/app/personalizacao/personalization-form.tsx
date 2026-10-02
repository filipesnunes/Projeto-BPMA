"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { ImageUploadField } from "@/components/forms/image-upload-field";
import { ReportIdentityMark } from "@/components/report-identity-mark";

export type PersonalizationActionState = { status: "idle" | "success" | "error"; message: string };
const INITIAL_STATE: PersonalizationActionState = { status: "idle", message: "" };

function SaveButton() {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn-primary" disabled={pending}>{pending ? "Salvando..." : "Salvar alterações"}</button>;
}

export function PersonalizationForm({ logoDataUrl, fileName, unitName, fallbackUnitName, previewMonth,
  saveAction, removeAction, resetAction }: {
  logoDataUrl: string | null; fileName: string | null; unitName: string; fallbackUnitName: string; previewMonth: string;
  saveAction: (state: PersonalizationActionState, formData: FormData) => Promise<PersonalizationActionState>;
  removeAction: (formData: FormData) => Promise<void>; resetAction: (formData: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const [state, action] = useActionState(saveAction, INITIAL_STATE);
  const [name, setName] = useState(unitName);
  const [previewLogo, setPreviewLogo] = useState(logoDataUrl);
  useEffect(() => { setName(unitName); setPreviewLogo(logoDataUrl); }, [unitName, logoDataUrl]);
  useEffect(() => { if (state.status === "success") router.refresh(); }, [state, router]);
  return <div className="space-y-5">
    <form action={action} className="space-y-5">
      {state.message ? <p role="status" className={state.status === "error" ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300"}>{state.message}</p> : null}
      <section className="bpma-card space-y-4">
        <h2 className="text-lg font-semibold">Identidade visual</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">Personalize a marca e a unidade nos cabeçalhos dos relatórios.</p>
        <label className="block text-sm">Nome da unidade
          <input name="nomeUnidade" maxLength={120} value={name} onChange={event => setName(event.currentTarget.value)} className="bpma-input" placeholder="K Platz Hotel" />
        </label>
        <ImageUploadField name="logoHotel" label="Logomarca do hotel" maxBytes={2 * 1024 * 1024}
          existingImageDataUrl={logoDataUrl} existingFileName={fileName} onPreviewChange={setPreviewLogo}
          previewImageClassName="max-h-44 max-w-full object-contain"
          helperText="PNG, JPG ou WebP estático, até 2 MB. A proporção e a transparência serão preservadas." />
        <p className="text-xs text-slate-500">{logoDataUrl ? "Existe uma logomarca salva. Selecione outra imagem para substituí-la ao salvar." : "Sem logomarca salva. Os relatórios exibem StaySafe."}</p>
      </section>
      <section className="bpma-card space-y-4">
        <h2 className="text-lg font-semibold">Pré-visualização do cabeçalho</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">A prévia acompanha sua seleção. Salve para aplicar aos relatórios.</p>
        <div className="overflow-x-auto">
          <div className="grid min-w-[420px] grid-cols-[21fr_53fr_26fr] border border-slate-400 bg-white text-slate-900">
            <div className="flex items-center justify-center p-2"><ReportIdentityMark identity={{ unitName: name.trim() || fallbackUnitName, logoDataUrl: previewLogo }} /></div>
            <div className="flex items-center justify-center border-x border-slate-400 p-2 text-center text-sm font-bold">PLANO DE LIMPEZA SEMANAL</div>
            <div className="flex flex-col items-center justify-center p-2 text-center text-xs"><strong>Mês/Ano</strong>{previewMonth}</div>
          </div>
        </div>
      </section>
      <SaveButton />
    </form>
    <section className="bpma-card space-y-3">
      <h2 className="text-lg font-semibold">Gerenciamento</h2>
      {logoDataUrl ? <details>
        <summary className="btn-secondary w-fit cursor-pointer">Remover logomarca</summary>
        <form action={removeAction} className="mt-3 space-y-2">
          <p className="text-sm">Remover a logomarca salva? O nome da unidade será mantido.</p>
          <button type="submit" className="btn-secondary">Confirmar remoção da logomarca</button>
        </form>
      </details> : null}
      <details>
        <summary className="btn-secondary w-fit cursor-pointer">Restaurar valores padrão</summary>
        <form action={resetAction} className="mt-3 space-y-2">
          <p className="text-sm">Restaurar a marca StaySafe e o nome padrão da unidade?</p>
          <button type="submit" className="btn-secondary">Confirmar restauração dos padrões</button>
        </form>
      </details>
    </section>
  </div>;
}
