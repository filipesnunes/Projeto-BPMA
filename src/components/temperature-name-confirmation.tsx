import type { TemperatureNameChange } from "@/app/controle-temperatura-equipamentos/nomenclature";

export function TemperatureNameConfirmation({ changes }: { changes: TemperatureNameChange[] }) {
  const manual = changes.filter(change => !change.proven);
  if (!manual.length) return null;
  return <fieldset className="space-y-3 rounded border p-3">
    <legend className="px-1 font-medium">Confirme a identificação do equipamento</legend>
    <p>O nome foi alterado no cadastro. Se incluir as aferições abaixo na assinatura, confirme que os dois nomes se referem ao mesmo equipamento físico.</p>
    {manual.map(change => <div key={change.id} className="text-sm">
      <input type="hidden" name="nomenclatura" value={`${change.id}:${change.version}:${change.token}`}/>
      <p>Aferição #{change.recordId} — {change.date}, {change.shift === "MANHA" ? "manhã" : "tarde"}</p>
      <p>Nome anterior: {change.before}</p><p>Nome atual: {change.after}</p>
    </div>)}
    <label className="flex items-start gap-2"><input className="mt-1 h-4 w-4 shrink-0" type="checkbox" name="confirmarIdentidadeEquipamento" value="sim"/><span>Confirmo que ambos os nomes identificam o mesmo equipamento físico. Esta confirmação não me atribui a execução histórica.</span></label>
  </fieldset>;
}
