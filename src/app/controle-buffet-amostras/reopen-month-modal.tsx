"use client";

import { useState } from "react";

type ReopenMonthModalProps = {
  mes: number;
  ano: number;
  formId: string;
};

export function ReopenMonthModal({ mes, ano, formId }: ReopenMonthModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className="btn-secondary">
        Reabrir Mês
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Confirmar Reabertura
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Confirma a reabertura do mês {String(mes).padStart(2, "0")}/{ano}?
            </p>

            <div className="mt-5 btn-group">
              <button type="button" onClick={() => setIsOpen(false)} className="btn-secondary">
                Cancelar
              </button>
              <button type="submit" form={formId} className="btn-primary">
                Confirmar Reabertura
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
