import { StatusNotaRecebimento, StatusRecebimento } from "@prisma/client";

import {
  canEditRecordDate,
  hasPermission,
  type PermissionAwareUser
} from "@/lib/permissions";

const MODULE_PERMISSION_PREFIX = "modulo.rastreabilidade";

export type ReceivingNoteEditAccessReason =
  | "EDITABLE"
  | "NO_USER"
  | "MONTH_SIGNED"
  | "FINALIZED"
  | "NO_PERMISSION";

type ReceivingNoteEditAccessParams = {
  user: PermissionAwareUser | null | undefined;
  noteDate: Date;
  statusNota: StatusNotaRecebimento;
  today: Date;
  monthSigned: boolean;
};

export function isReceivingNotePendingConference(statusNota: StatusNotaRecebimento): boolean {
  return statusNota !== StatusNotaRecebimento.FINALIZADA;
}

type ReceivingNoteConferenceItem = {
  statusGeral: StatusRecebimento;
  sif: string | null;
  temperatura: number | null;
  temperaturaStatus: unknown | null;
  transporteEntregador: unknown | null;
  aspectoSensorial: unknown | null;
  embalagem: unknown | null;
  acaoCorretiva: string | null;
  responsavelRecebimento: string | null;
  observacoes: string | null;
};

type ReceivingNoteDeleteCandidate = {
  origemXml: boolean;
  statusNota: StatusNotaRecebimento;
  itens: ReceivingNoteConferenceItem[];
};

function hasReceivingConferenceData(item: ReceivingNoteConferenceItem): boolean {
  return (
    item.statusGeral !== StatusRecebimento.PENDENTE ||
    Boolean(item.sif?.trim()) ||
    item.temperatura !== null ||
    item.temperaturaStatus !== null ||
    item.transporteEntregador !== null ||
    item.aspectoSensorial !== null ||
    item.embalagem !== null ||
    Boolean(item.acaoCorretiva?.trim()) ||
    Boolean(item.responsavelRecebimento?.trim()) ||
    Boolean(item.observacoes?.trim())
  );
}

export function canDeleteImportedReceivingNote(note: ReceivingNoteDeleteCandidate): boolean {
  const importedOnlyStatus =
    note.statusNota === StatusNotaRecebimento.PENDENTE ||
    note.statusNota === StatusNotaRecebimento.IMPORTADA;

  return note.origemXml && importedOnlyStatus && note.itens.every((item) => !hasReceivingConferenceData(item));
}

export function getReceivingNoteEditAccessReason(
  params: ReceivingNoteEditAccessParams
): ReceivingNoteEditAccessReason {
  if (!params.user) {
    return "NO_USER";
  }

  if (params.monthSigned) {
    return "MONTH_SIGNED";
  }

  if (!isReceivingNotePendingConference(params.statusNota)) {
    return "FINALIZED";
  }

  if(params.noteDate.getTime()<params.today.getTime()&&!hasPermission(params.user,`${MODULE_PERMISSION_PREFIX}.editar_historico`))return "NO_PERMISSION";

  if (
    canEditRecordDate(
      params.user,
      MODULE_PERMISSION_PREFIX,
      params.noteDate,
      params.today
    )
  ) {
    return "EDITABLE";
  }

  const isPastOrCurrentNote = params.noteDate.getTime() <= params.today.getTime();
  if (
    isPastOrCurrentNote &&
    (hasPermission(params.user, `${MODULE_PERMISSION_PREFIX}.editar_registro_do_dia`) ||
      hasPermission(params.user, `${MODULE_PERMISSION_PREFIX}.editar_historico`))
  ) {
    return "EDITABLE";
  }

  return "NO_PERMISSION";
}

export function canEditReceivingNote(params: ReceivingNoteEditAccessParams): boolean {
  return getReceivingNoteEditAccessReason(params) === "EDITABLE";
}
