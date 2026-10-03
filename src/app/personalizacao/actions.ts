"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUserForAction } from "@/lib/auth-session";
import { ensurePermission } from "@/lib/authz";
import { removeHotelLogo, restoreVisualDefaults, saveVisualPersonalization } from "@/lib/visual-personalization";
import type { PersonalizationActionState } from "./personalization-form";

async function authorizedUser() {
  const user = await getCurrentUserForAction();
  ensurePermission(user, "modulo.personalizacao.acessar");
  return user;
}

export async function savePersonalizationAction(
  _state: PersonalizationActionState, formData: FormData
): Promise<PersonalizationActionState> {
  const user = await authorizedUser();
  try {
    await saveVisualPersonalization(formData, user.id);
  } catch (error) {
    if (error instanceof Error && /^(Informe um nome|Informe uma cor|Informe uma opção|Selecione uma imagem|Imagem inválida|Formato de imagem|A foto selecionada)/.test(error.message)) {
      return { status: "error", message: error.message };
    }
    console.error("Falha ao salvar personalização visual", error instanceof Error ? error.name : "Erro desconhecido");
    return { status: "error", message: "Não foi possível salvar a personalização. Tente novamente." };
  }
  revalidatePath("/", "layout");
  return { status: "success", message: "Personalização salva com sucesso." };
}

export async function removeLogoAction(_formData: FormData): Promise<void> {
  const user = await authorizedUser();
  await removeHotelLogo(user.id);
  revalidatePath("/", "layout");
  redirect("/personalizacao");
}

export async function restoreDefaultsAction(_formData: FormData): Promise<void> {
  const user = await authorizedUser();
  await restoreVisualDefaults(user.id);
  revalidatePath("/", "layout");
  redirect("/personalizacao");
}
