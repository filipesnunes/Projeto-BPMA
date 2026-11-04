"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUserForAction } from "@/lib/auth-session";
import { parseAppDateInput, formatAppDateTime } from "@/lib/date-time";
import { getOperationalSignatureModule } from "@/lib/module-signatures";
import { signRetroactiveReview } from "@/lib/retroactive-review";

export async function signRetroactiveAction(_state: { status: string; message: string }, form: FormData) {
  try {
    const text = (key: string) => String(form.get(key) ?? "").trim();
    const config = getOperationalSignatureModule(text("modulo"));
    const date = parseAppDateInput(text("data"));
    if (!date) throw Error("Data inválida.");
    const ids = text("registros") ? text("registros").split(",").map(Number) : undefined;
    if (ids?.some(id => !Number.isSafeInteger(id) || id < 1)) throw Error("Seleção inválida.");
    const result = await signRetroactiveReview({ authenticated: await getCurrentUserForAction(),
      scope: { module: config.codigo, date, flowId: text("fluxo") || undefined, recordIds: ids, legacyRecordId: text("legado") ? Number(text("legado")) : undefined },
      token: text("escopo"), password: text("senha"), justification: text("justificativa"), confirmed: text("confirmacao") === "sim" });
    revalidatePath(config.historyPath.replace(/\/historico$/, ""), "layout");
    revalidatePath("/historico-operacional/revisao-retroativa");
    revalidatePath("/relatorios", "layout");
    revalidatePath("/");
    return { status: "success", message: `Revisão retroativa registrada por ${result.usuarioNome} em ${formatAppDateTime(result.assinadoEm)}.` };
  } catch (error) {
    return { status: "error", message: error instanceof Error && !/prisma|p20\d|transaction|stack|NEXT_REDIRECT/i.test(error.message)
      ? error.message : "Não foi possível registrar a revisão. Confira sua sessão e recarregue os dados." };
  }
}
