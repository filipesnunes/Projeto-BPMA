// Counts only persisted statuses in the service's original manifest and extras.
export function buffetProgress(records: readonly { itemId?: number | null; itemExtra: boolean; status: string; excluidoEm?: Date | null }[], manifest: readonly { id: number }[]) {
  const fixed = new Map(manifest.map(item => [item.id, "PENDENTE"]));
  const extras: string[] = [];
  for (const record of records) {
    if (record.excluidoEm) continue;
    if (record.itemExtra) extras.push(record.status);
    else if (record.itemId != null && fixed.has(record.itemId)) fixed.set(record.itemId, record.status);
  }
  const statuses = [...fixed.values(), ...extras];
  const filled = statuses.filter(status => status === "PREENCHIDO" || status === "ASSINADO").length;
  const notServed = statuses.filter(status => status === "NAO_SERVIDO").length;
  const required = statuses.length, resolved = filled + notServed;
  return { required, resolved, filled, notServed, signed: statuses.filter(status => status === "ASSINADO").length, pending: required - resolved, complete: required > 0 && resolved === required };
}
