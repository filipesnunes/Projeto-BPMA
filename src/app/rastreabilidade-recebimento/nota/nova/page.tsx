import {randomUUID} from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth-session";

import { ManualNoteForm } from "./manual-note-form";

const CARD_CLASS =
  "bpma-card";
const INPUT_CLASS =
  "bpma-input";

export default async function NovaNotaRecebimentoPage() {
  const authUser = await getCurrentUser();
  if (authUser?.perfil === "COLABORADOR") {
    redirect("/acesso-negado");
  }

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
              ← Voltar ao Módulo
            </Link>
          </div>
        </div>
      </section>

      <section className={CARD_CLASS}>
        <ManualNoteForm workflowRequestId={randomUUID()}
          responsavelLogado={responsavelLogado}
          inputClassName={INPUT_CLASS}
        />
      </section>
    </div>
  );
}
