export const FONT_OPTIONS = {
  SISTEMA: 'system-ui, sans-serif', INTER: '"Inter", Arial, sans-serif',
  ROBOTO: '"Roboto", Arial, sans-serif', OPEN_SANS: '"Open Sans", Arial, sans-serif', ARIAL: 'Arial, sans-serif'
};
export const TEXT_SIZES = { COMPACTO: 14, PADRAO: 16, AMPLIADO: 18 };
export const DEFAULT_APPEARANCE = {
  corPrimaria: '#0f172a', corSecundaria: '#edf3f9', corDestaque: '#3b82f6',
  fonteAplicativo: 'SISTEMA', tamanhoTexto: 'PADRAO', temaPadrao: 'CLARO'
} as const;
export type AppearanceSettings = {
  corPrimaria: string; corSecundaria: string; corDestaque: string;
  fonteAplicativo: keyof typeof FONT_OPTIONS; tamanhoTexto: keyof typeof TEXT_SIZES;
  temaPadrao: 'CLARO' | 'ESCURO' | 'AUTOMATICO';
};
export const APPEARANCE_PALETTES = [
  {nome:'StaySafe original',...DEFAULT_APPEARANCE},
  {nome:'Azul corporativo',corPrimaria:'#153149',corSecundaria:'#dce7f0',corDestaque:'#357ba5'},
  {nome:'Verde institucional',corPrimaria:'#245c45',corSecundaria:'#dbeade',corDestaque:'#508060'},
  {nome:'Grafite',corPrimaria:'#343a40',corSecundaria:'#e2e5e8',corDestaque:'#65717e'},
  {nome:'Bordô',corPrimaria:'#702c40',corSecundaria:'#efe1e6',corDestaque:'#a65d73'},
  {nome:'Dourado discreto',corPrimaria:'#69542b',corSecundaria:'#efe9dc',corDestaque:'#b0914e'}
];
export function normalizeAppearance(raw: Record<string, unknown> = {}): AppearanceSettings {
  const color = (key: 'corPrimaria'|'corSecundaria'|'corDestaque') =>
    typeof raw[key] === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw[key] as string)
      ? (raw[key] as string).toLowerCase() : DEFAULT_APPEARANCE[key];
  return {
    corPrimaria:color('corPrimaria'),corSecundaria:color('corSecundaria'),corDestaque:color('corDestaque'),
    fonteAplicativo: Object.hasOwn(FONT_OPTIONS,String(raw.fonteAplicativo)) ? raw.fonteAplicativo as AppearanceSettings['fonteAplicativo'] : 'SISTEMA',
    tamanhoTexto: Object.hasOwn(TEXT_SIZES,String(raw.tamanhoTexto)) ? raw.tamanhoTexto as AppearanceSettings['tamanhoTexto'] : 'PADRAO',
    temaPadrao: ['CLARO','ESCURO','AUTOMATICO'].includes(String(raw.temaPadrao)) ? raw.temaPadrao as AppearanceSettings['temaPadrao'] : 'CLARO'
  };
}
export function appearanceFromForm(form: FormData): AppearanceSettings {
  const raw = Object.fromEntries(Object.keys(DEFAULT_APPEARANCE).map(key => [key,form.get(key)]));
  for(const key of ['corPrimaria','corSecundaria','corDestaque']) {
    if(raw[key] != null && (typeof raw[key] !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(raw[key] as string)))
      throw new Error('Informe uma cor válida no formato #RRGGBB.');
  }
  for(const [key,allowed] of Object.entries({fonteAplicativo:Object.keys(FONT_OPTIONS),tamanhoTexto:Object.keys(TEXT_SIZES),temaPadrao:['CLARO','ESCURO','AUTOMATICO']})) {
    if(raw[key] != null && !allowed.includes(String(raw[key]))) throw new Error('Informe uma opção de aparência válida.');
  }
  return normalizeAppearance(raw);
}
export function contrastingText(color: string): string {
  const rgb = color.slice(1).match(/../g)!.map(c => parseInt(c,16)/255).map(c => c<=.04045 ? c/12.92 : ((c+.055)/1.055)**2.4);
  const luminance = .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
  return (1.05/(luminance+.05)) >= ((luminance+.05)/.05) ? '#ffffff' : '#000000';
}
export function appearanceCss(raw: AppearanceSettings): string {
  const s=normalizeAppearance(raw);
  const original=s.corPrimaria===DEFAULT_APPEARANCE.corPrimaria && s.corSecundaria===DEFAULT_APPEARANCE.corSecundaria && s.corDestaque===DEFAULT_APPEARANCE.corDestaque;
  return `html:root {--app-font-family:${FONT_OPTIONS[s.fonteAplicativo]};--app-font-size:${TEXT_SIZES[s.tamanhoTexto]}px;}
    ${original ? '' : `html:root,html:root.dark {
      --btn-primary-bg:${s.corPrimaria};--btn-primary-hover-bg:${s.corPrimaria};--btn-primary-border:${s.corPrimaria};--btn-primary-text:${contrastingText(s.corPrimaria)};
      --sidebar-link-active-bg:${s.corPrimaria};--sidebar-link-active-text:${contrastingText(s.corPrimaria)};
      --btn-secondary-bg:${s.corSecundaria};--btn-secondary-hover-bg:${s.corSecundaria};--btn-secondary-border:${s.corSecundaria};--btn-secondary-text:${contrastingText(s.corSecundaria)};
      --sidebar-user-bg:${s.corSecundaria};--sidebar-link-hover-bg:${s.corSecundaria};
    }
    .bpma-sidebar-user {color:${contrastingText(s.corSecundaria)};border-inline-start:3px solid ${s.corDestaque};}
    .bpma-sidebar-user p {color:inherit !important;}
    .bpma-sidebar-link:hover {color:${contrastingText(s.corSecundaria)};}
    .bpma-sidebar-link-active:hover {background-color:var(--sidebar-link-active-bg);}
    .bpma-sidebar-link-active {box-shadow:inset 3px 0 ${s.corDestaque};}
    `}`;
}
