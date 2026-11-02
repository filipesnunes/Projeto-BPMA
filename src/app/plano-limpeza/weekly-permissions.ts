import {canSignCleaningReview} from "@/lib/signature-authorization";
import { hasAnyPermission, hasPermission, type PermissionAwareUser } from "@/lib/permissions";

import { getCurrentWeekDateRange } from "./utils";

export const WEEKLY_ITEM_SIGNATURE_PERMISSION_CODES = [
  "modulo.limpeza_semanal.criar_registro",
  "modulo.limpeza_semanal.editar_registro_do_dia",
  "modulo.limpeza_semanal.assinar_todos"
];

export const WEEKLY_SIGN_ALL_ITEMS_PERMISSION_CODE =
  "modulo.limpeza_semanal.assinar_todos";

export const WEEKLY_HISTORICAL_ITEM_SIGNATURE_PERMISSION_CODE =
  "modulo.limpeza_semanal.assinar_historico";

export const WEEKLY_CURRENT_SUPERVISOR_SIGNATURE_PERMISSION_CODES = [
  "usuarios.responsavel_tecnico",
  "modulo.limpeza_semanal.assinar_dia"
];

export const WEEKLY_HISTORY_SUPERVISOR_SIGNATURE_PERMISSION_CODES = [
  "usuarios.responsavel_tecnico",
  "modulo.limpeza_semanal.editar_historico"
];

export function isHistoricalWeeklySignature(weekStart: Date, referenceDate: Date): boolean {
  return weekStart.getTime() < getCurrentWeekDateRange(referenceDate).start.getTime();
}

export function canSignWeeklyItems(user: PermissionAwareUser): boolean {
  return hasAnyPermission(user, WEEKLY_ITEM_SIGNATURE_PERMISSION_CODES);
}

export function canSignAllWeeklyItems(user: PermissionAwareUser): boolean {
  return hasPermission(user, WEEKLY_SIGN_ALL_ITEMS_PERMISSION_CODE);
}

export function canSignHistoricalWeeklyItems(user: PermissionAwareUser): boolean {
  return hasPermission(user, WEEKLY_HISTORICAL_ITEM_SIGNATURE_PERMISSION_CODE);
}

export function canSignWeeklyAreaSupervisor(params: {
  user: PermissionAwareUser;
  weekStart: Date;
  referenceDate: Date;
}): boolean {
  return canSignCleaningReview(params.user,"modulo.limpeza_semanal.assinar_dia");
}

export function canSignWeeklyAreaSupervisorHistory(user: PermissionAwareUser): boolean {
  return canSignCleaningReview(user,"modulo.limpeza_semanal.assinar_dia");
}
