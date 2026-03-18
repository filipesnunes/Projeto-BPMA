import Link from "next/link";

import { getCurrentUser } from "@/lib/auth-session";

import { createManualNoteAction } from "../../actions";
import { ThemeToggleButton } from "../../theme-toggle-button";

const CARD_CLASS =
  "rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900";
const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

export default async function NovaNotaRecebimentoPage() {
  const authUser = await getCurrentUser();
  const responsavelLogado = authUser?.nomeCompleto ?? "Usuário logado";

  return (
    <div className="space-y-6 dark:text-slate-100">
      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Novo Recebimento Manual
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Cadastre a nota e o primeiro item. Depois você pode revisar todos os itens por linha.
            </p>
          </div>
          <div className="btn-group">
            <Link href="/rastreabilidade-recebimento" className="btn-secondary">
              Voltar para Módulo
            </Link>
            <ThemeToggleButton />
          </div>
        </div>
      </section>

      <section className={CARD_CLASS}>
        <form action={createManualNoteAction} className="grid gap-4 md:grid-cols-2">
          <input type="hidden" name="returnTo" value="/rastreabilidade-recebimento" />

          <label className="text-sm text-slate-700 dark:text-slate-200">
            Fornecedor *
            <input type="text" name="fornecedor" required className={INPUT_CLASS} />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Nota Fiscal *
            <input type="text" name="notaFiscal" required className={INPUT_CLASS} />
          </label>

          <label className="text-sm text-slate-700 dark:text-slate-200">
            Produto *
            <input type="text" name="produto" required className={INPUT_CLASS} />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Lote *
            <input type="text" name="lote" required className={INPUT_CLASS} />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Data de Fabricação *
            <input type="date" name="dataFabricacao" required className={INPUT_CLASS} />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Validade *
            <input type="date" name="dataValidade" required className={INPUT_CLASS} />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            SIF *
            <input
              type="text"
              name="sif"
              required
              list="sif-opcoes"
              defaultValue="Não se aplica"
              className={INPUT_CLASS}
            />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Temperatura (°C) *
            <input type="text" name="temperatura" required inputMode="decimal" className={INPUT_CLASS} />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Transporte / Entregador *
            <select name="transporteEntregador" required className={INPUT_CLASS}>
              <option value="">Selecione</option>
              <option value="CONFORME">Conforme</option>
              <option value="NAO_CONFORME">Não Conforme</option>
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Aspecto Sensorial *
            <select name="aspectoSensorial" required className={INPUT_CLASS}>
              <option value="">Selecione</option>
              <option value="CONFORME">Conforme</option>
              <option value="NAO_CONFORME">Não Conforme</option>
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Embalagem *
            <select name="embalagem" required className={INPUT_CLASS}>
              <option value="">Selecione</option>
              <option value="CONFORME">Conforme</option>
              <option value="NAO_CONFORME">Não Conforme</option>
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Ação Corretiva
            <input type="text" name="acaoCorretiva" className={INPUT_CLASS} />
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
            <textarea name="observacoes" rows={3} className={INPUT_CLASS} />
          </label>

          <div className="md:col-span-2">
            <button type="submit" className="btn-primary">
              Criar Nota
            </button>
          </div>
        </form>
        <datalist id="sif-opcoes">
          <option value="Não se aplica" />
        </datalist>
      </section>
    </div>
  );
}
