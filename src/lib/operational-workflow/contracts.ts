import type { Prisma, FluxoOperacional } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth-session";
import type { OperationalSignatureModuleCode } from "@/lib/module-signatures";

// Only server-owned adapters may create these values. Never accept completion,
// signature scope, snapshots or a delegate/model name directly from FormData.
export type WorkflowContent = {
  snapshot: Prisma.InputJsonObject;
  draft: Prisma.InputJsonObject;
  complete: boolean;
  resolved: number;
  required: number;
};

export type WorkflowAdapter = {
  module: OperationalSignatureModuleCode;
  // Stable identity determined from persisted records or an explicit draft UUID.
  // Display labels and mutable catalog names must not be used as primary keys.
  load(tx: Prisma.TransactionClient, key: string): Promise<{
    date: Date; content: WorkflowContent; legacy: boolean;
  }>;
  save(tx: Prisma.TransactionClient, key: string, input: unknown, user: AuthenticatedUser, unit: FluxoOperacional): Promise<WorkflowContent>;
};

export function assertWorkflowContent(content: WorkflowContent) {
  if (!Number.isSafeInteger(content.required) || !Number.isSafeInteger(content.resolved) ||
      content.required < 1 || content.resolved < 0 || content.resolved > content.required ||
      content.complete !== (content.resolved === content.required)) {
    throw new Error("O adaptador retornou um progresso operacional inválido.");
  }
}
