import Link from "next/link";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { ModalFeedback } from "./modal-feedback";

type ActionModalProps = {
  title: string;
  cancelHref: string;
  children: ReactNode;
  description?: ReactNode;
  headerActions?: ReactNode;
  maxWidthClassName?: string;
};

export function ActionModal({
  title,
  cancelHref,
  children,
  description,
  headerActions,
  maxWidthClassName = "max-w-lg"
}: ActionModalProps) {
  return (
    <div className="bpma-modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <section className={`bpma-modal-panel ${maxWidthClassName}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
            {description ? (
              <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">{description}</div>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {headerActions}
            <Link
              href={cancelHref}
              scroll={false}
              className="btn-secondary"
              aria-label={`Fechar ${title}`}
            >
              Fechar
            </Link>
          </div>
        </div>
        <Suspense fallback={null}><ModalFeedback /></Suspense>
        <div className="mt-4">{children}</div>
      </section>
    </div>
  );
}

export function ModalActions({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      {children}
    </div>
  );
}
