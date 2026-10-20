"use client";

import { useState } from "react";

type DeleteNoteModalProps = {
  formId: string;
  description: string;
};

export function DeleteNoteModal({ formId, description }: DeleteNoteModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className="btn-danger">
        Excluir
      </button>

      {isOpen ? (
        <div className="bpma-modal-backdrop">
          <div className="bpma-modal-panel max-w-md">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Confirmar Exclusão
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {description} Os dados serão preservados para auditoria.
            </p>

            <label className="block text-sm">Justificativa da exclusão *<textarea form={formId} name="justificativaExclusao" required maxLength={4000} className="bpma-input" /></label>
            <div className="mt-5 btn-group">
              <button type="button" onClick={() => setIsOpen(false)} className="btn-secondary">
                Cancelar
              </button>
              <button type="submit" form={formId} className="btn-danger">
                Excluir nota
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
