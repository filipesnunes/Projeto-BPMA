type SignatureContextCardProps = {
  nomeUsuario: string;
  dataHora: string;
  perfil?: string;
};

export function SignatureContextCard({
  nomeUsuario,
  dataHora,
  perfil
}: SignatureContextCardProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Assinatura
      </p>
      <p className="font-medium text-slate-800 dark:text-slate-100">{nomeUsuario}</p>
      {perfil ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">{perfil}</p>
      ) : null}
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Data e Hora: {dataHora}
      </p>
    </div>
  );
}
