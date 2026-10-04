"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { ImageUploadField } from "@/components/forms/image-upload-field";
import { ReportHeader } from "@/components/report-identity-mark";
import { LOGO_WIDTH, LOGO_HEIGHT, normalizeLogoDimensions } from "@/lib/logo-dimensions";
import { APPEARANCE_PALETTES, DEFAULT_APPEARANCE, FONT_OPTIONS, TEXT_SIZES, normalizeAppearance, contrastingText, type AppearanceSettings } from "@/lib/appearance-settings";

export type PersonalizationActionState = { status: "idle" | "success" | "error"; message: string };
const INITIAL_STATE: PersonalizationActionState = { status: "idle", message: "" };

function SaveButton() {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn-primary" disabled={pending}>{pending ? "Salvando..." : "Salvar alterações"}</button>;
}

export function PersonalizationForm({ logoDataUrl, fileName, unitName, fallbackUnitName, previewMonth,
  logoLargura = LOGO_WIDTH.default, logoAlturaMaxima = LOGO_HEIGHT.default,
  appearance = DEFAULT_APPEARANCE,
  saveAction, removeAction, resetAction }: {
  logoDataUrl: string | null; fileName: string | null; unitName: string; fallbackUnitName: string; previewMonth: string;
  logoLargura?: number; logoAlturaMaxima?: number;
  appearance?: AppearanceSettings;
  saveAction: (state: PersonalizationActionState, formData: FormData) => Promise<PersonalizationActionState>;
  removeAction: (formData: FormData) => Promise<void>; resetAction: (formData: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const [state, action] = useActionState(saveAction, INITIAL_STATE);
  const [name, setName] = useState(unitName);
  const [previewLogo, setPreviewLogo] = useState(logoDataUrl);
  const [width, setWidth] = useState(logoLargura);
  const [height, setHeight] = useState(logoAlturaMaxima);
  const [visual, setVisual] = useState<AppearanceSettings>(appearance);
  const [systemDark, setSystemDark] = useState(false);
  useEffect(() => {setVisual(appearance);}, [appearance]);
  useEffect(() => {
    const media=window.matchMedia('(prefers-color-scheme: dark)');
    const sync=()=>setSystemDark(media.matches);sync();media.addEventListener('change',sync);
    return ()=>media.removeEventListener('change',sync);
  },[]);
  const safeVisual = normalizeAppearance(visual);
  const darkPreview = safeVisual.temaPadrao === 'ESCURO' || (safeVisual.temaPadrao === 'AUTOMATICO' && systemDark);
  const originalPalette = safeVisual.corPrimaria===DEFAULT_APPEARANCE.corPrimaria && safeVisual.corSecundaria===DEFAULT_APPEARANCE.corSecundaria && safeVisual.corDestaque===DEFAULT_APPEARANCE.corDestaque;
  const previewPrimary = darkPreview && originalPalette ? '#e3ebf4' : safeVisual.corPrimaria;
  const previewSecondary = darkPreview && originalPalette ? '#2b3746' : safeVisual.corSecundaria;
  const changed = name!==unitName || previewLogo!==logoDataUrl || width!==logoLargura || height!==logoAlturaMaxima || JSON.stringify(visual)!==JSON.stringify(appearance);
  useEffect(() => { setWidth(logoLargura); setHeight(logoAlturaMaxima); }, [logoLargura, logoAlturaMaxima]);
  useEffect(() => { setName(unitName); setPreviewLogo(logoDataUrl); }, [unitName, logoDataUrl]);
  useEffect(() => { if (state.status === "success") router.refresh(); }, [state, router]);
  return <div className="space-y-5">
    <form action={action} className="space-y-5">
      <p role="status" className="text-sm">{changed ? 'Existem alterações ainda não salvas. Confira a prévia antes de salvar.' : 'As configurações exibidas correspondem aos valores atuais.'}</p>
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
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">Tamanho da logomarca</legend>
          <p className="text-sm text-slate-600 dark:text-slate-300">Ajuste os controles e confira a prévia. A imagem mantém a proporção e cabe no espaço do cabeçalho.</p>
          <p className="text-xs text-slate-500">Uma altura maior pode fazer o relatório ocupar mais páginas na impressão.</p>
          <label className="block text-sm">Largura: {width} px
            <input className="mt-2 block w-full" type="range" name="logoLargura" min={LOGO_WIDTH.min} max={LOGO_WIDTH.max}
              value={width} onChange={event => setWidth(Number(event.currentTarget.value))} />
          </label>
          <label className="block text-sm">Altura máxima: {height} px
            <input className="mt-2 block w-full" type="range" name="logoAlturaMaxima" min={LOGO_HEIGHT.min} max={LOGO_HEIGHT.max}
              value={height} onChange={event => setHeight(Number(event.currentTarget.value))} />
          </label>
        </fieldset>
      </section>
      <section className="bpma-card space-y-4">
        <h2 className="text-lg font-semibold">Aparência do aplicativo</h2>
        <p className="text-sm">As cores institucionais não alteram alertas, erros ou estados operacionais.</p>
        <div className="flex flex-wrap gap-2">{APPEARANCE_PALETTES.map(palette => <button key={palette.nome} type="button" className="btn-secondary"
          onClick={()=>setVisual({...visual,corPrimaria:palette.corPrimaria,corSecundaria:palette.corSecundaria,corDestaque:palette.corDestaque})}>{palette.nome}</button>)}</div>
        <div className="grid gap-4 md:grid-cols-3">{(['corPrimaria','corSecundaria','corDestaque'] as const).map((key,index)=><fieldset key={key} className="space-y-2">
          <legend className="font-semibold">{['Cor primária','Cor secundária','Cor de destaque'][index]}</legend>
          <label>Selecionar cor<input type="color" aria-label={['Selecionar cor primária','Selecionar cor secundária','Selecionar cor de destaque'][index]}
            value={safeVisual[key]} onChange={event=>setVisual({...visual,[key]:event.currentTarget.value})}/></label>
          <label>Código da cor<input className="bpma-input" name={key} pattern="#[0-9a-fA-F]{6}" maxLength={7} required value={visual[key]}
            onChange={event=>setVisual({...visual,[key]:event.currentTarget.value})}/></label>
          <button type="button" className="btn-secondary" onClick={()=>setVisual({...visual,[key]:DEFAULT_APPEARANCE[key]})}>Restaurar esta cor</button>
        </fieldset>)}</div>
      </section>
      <section className="bpma-card space-y-4">
        <h2 className="text-lg font-semibold">Tipografia</h2>
        <label>Fonte do aplicativo<select name="fonteAplicativo" className="bpma-input" value={visual.fonteAplicativo}
          onChange={event=>setVisual({...visual,fonteAplicativo:event.currentTarget.value as AppearanceSettings['fonteAplicativo']})}>
          {Object.keys(FONT_OPTIONS).map(key=><option key={key} value={key}>{({SISTEMA:'Fonte do dispositivo',INTER:'Inter',ROBOTO:'Roboto',OPEN_SANS:'Open Sans',ARIAL:'Arial'})[key as keyof typeof FONT_OPTIONS]}</option>)}
        </select></label>
        <label>Tamanho dos textos<select name="tamanhoTexto" className="bpma-input" value={visual.tamanhoTexto}
          onChange={event=>setVisual({...visual,tamanhoTexto:event.currentTarget.value as AppearanceSettings['tamanhoTexto']})}>
          <option value="COMPACTO">Compacto</option><option value="PADRAO">Padrão</option><option value="AMPLIADO">Ampliado</option>
        </select></label>
        <p className="text-sm">A fonte e o tamanho do aplicativo não mudam a tipografia dos relatórios.</p>
      </section>
      <section className="bpma-card space-y-4">
        <h2 className="text-lg font-semibold">Tema</h2>
        <label>Tema padrão da unidade<select name="temaPadrao" className="bpma-input" value={visual.temaPadrao}
          onChange={event=>setVisual({...visual,temaPadrao:event.currentTarget.value as AppearanceSettings['temaPadrao']})}>
          <option value="CLARO">Claro</option><option value="ESCURO">Escuro</option><option value="AUTOMATICO">Automático</option>
        </select></label>
        <p className="text-sm">Automático acompanha o tema do dispositivo. Uma escolha individual feita no menu tem prioridade; use “Usar tema da unidade” para voltar ao padrão.</p>
      </section>
      <section className="bpma-card space-y-4">
        <h2 className="text-lg font-semibold">Pré-visualização do aplicativo</h2>
        <p className="text-sm">Exemplo visual, sem alterar as configurações salvas ou os registros.</p>
        <div className="space-y-4 rounded-lg border p-4" style={{backgroundColor:darkPreview?'#141a21':'#eef3f8',color:darkPreview?'#e5edf6':'#0f172a',fontFamily:FONT_OPTIONS[safeVisual.fonteAplicativo],fontSize:TEXT_SIZES[safeVisual.tamanhoTexto]}}>
          <div className="rounded p-3" style={{backgroundColor:previewSecondary,color:contrastingText(previewSecondary),borderInlineStart:`4px solid ${safeVisual.corDestaque}`}}>Unidade: {name.trim()||fallbackUnitName}</div>
          <h3 style={{fontSize:'1.25em',fontWeight:700}}>Painel da unidade</h3>
          <div className="flex flex-wrap gap-3"><span className="rounded px-4 py-2" style={{backgroundColor:previewPrimary,color:contrastingText(previewPrimary)}}>Botão principal</span>
            <span className="rounded px-4 py-2" style={{backgroundColor:previewSecondary,color:contrastingText(previewSecondary)}}>Botão secundário</span></div>
          <div className="flex flex-wrap gap-3"><span className="rounded bg-red-100 px-3 py-2 text-red-800">Exemplo: alerta sanitário</span><span className="rounded bg-emerald-100 px-3 py-2 text-emerald-800">Exemplo: conforme</span></div>
        </div>
      </section>
      <section className="bpma-card space-y-4">
        <h2 className="text-lg font-semibold">Pré-visualização do cabeçalho</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">A prévia acompanha sua seleção. Salve para aplicar aos relatórios.</p>
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <ReportHeader identity={{ unitName: name.trim() || fallbackUnitName, logoDataUrl: previewLogo,
              ...normalizeLogoDimensions({logoLargura:width,logoAlturaMaxima:height}) }}
              title="PLANO DE LIMPEZA SEMANAL" reportName="Relatório mensal" moduleName="Plano de Limpeza Semanal" period={previewMonth} />
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
          <p className="text-sm">Restaurar a marca StaySafe, nome da unidade, tamanho da logo, cores, fonte, tamanho dos textos e tema aos padrões?</p>
          <button type="submit" className="btn-secondary">Confirmar restauração dos padrões</button>
        </form>
      </details>
    </section>
  </div>;
}
