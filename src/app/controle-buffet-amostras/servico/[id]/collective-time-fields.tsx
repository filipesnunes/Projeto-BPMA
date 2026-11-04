"use client";
import { useState } from "react";
import { buffetCollectiveTimeTargets, type CollectiveTimeMode, type CollectiveTimeRow, type CollectiveTimeTarget } from "../../collective-time";
import type { BuffetValues } from "../../row-validation";

export function CollectiveTimeFields({ rows, read, onApply, disabled }: {
  rows: readonly CollectiveTimeRow[]; read: (row: CollectiveTimeRow) => BuffetValues;
  onApply: (time: string, targets: CollectiveTimeTarget[]) => void; disabled: boolean;
}) {
  const [time, setTime] = useState("");
  const [mode, setMode] = useState<CollectiveTimeMode>("empty");
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState<{ time: string; targets: CollectiveTimeTarget[] } | null>(null);
  const apply = (value: string, targets: CollectiveTimeTarget[]) => {
    onApply(value, targets);
    setMessage(`Horário ${value} aplicado a ${targets.length} item(ns). Confira os horários individuais e salve os itens do serviço para registrar as alterações.`);
    setConfirmation(null);
  };
  const prepare = () => {
    if (disabled) return;
    try {
      const targets = buffetCollectiveTimeTargets(rows, read, time, mode);
      if (!targets.length) { setMessage("Nenhum item elegível para esta aplicação. Horários existentes, horários não informados, itens vazios, Não servido e bloqueados são preservados conforme a opção selecionada."); return; }
      if (mode === "replace") setConfirmation({ time, targets });
      else apply(time, targets);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Confira o horário informado."); }
  };
  const confirm = () => {
    if (!confirmation || disabled) return;
    const current = buffetCollectiveTimeTargets(rows, read, confirmation.time, "replace");
    if (JSON.stringify(current) !== JSON.stringify(confirmation.targets)) {
      setConfirmation(null); setMessage("Os itens foram alterados. Confira os dados e solicite a aplicação novamente."); return;
    }
    apply(confirmation.time, current);
  };
  return <section className="rounded-lg border p-4 space-y-3" aria-label="Horário de execução dos itens">
    <h2 className="font-semibold">Horário de execução dos itens</h2>
    <p className="text-sm">Informe o horário real dos procedimentos realizados. A aplicação inclui itens extras e itens fora da busca; itens vazios, Não servido e protegidos não recebem horário.</p>
    <label className="block text-sm">Horário de execução<input className="bpma-input" name="horarioColetivo" type="time" value={time} onChange={e => setTime(e.target.value)} disabled={disabled}/></label>
    <fieldset className="space-y-2 text-sm" disabled={disabled}><legend className="sr-only">Modo de aplicação do horário</legend>
      <label className="flex items-center gap-2"><input type="radio" name="horarioColetivoModo" value="empty" checked={mode === "empty"} onChange={() => setMode("empty")}/>Aplicar somente aos itens sem horário</label>
      <label className="flex items-center gap-2"><input type="radio" name="horarioColetivoModo" value="replace" checked={mode === "replace"} onChange={() => setMode("replace")}/>Substituir os horários existentes dos itens editáveis</label>
    </fieldset>
    <p className="text-xs">A opção padrão preserva também os itens com Horário não informado. A edição individual continua disponível; nenhuma alteração é salva automaticamente.</p>
    <button type="button" className="btn-secondary" onClick={prepare} disabled={disabled}>Aplicar horário aos itens</button>
    {message && <p role="status">{message}</p>}
    {confirmation && <div className="bpma-modal-backdrop"><section className="bpma-modal-panel max-w-lg space-y-3" role="dialog" aria-modal="true" aria-label="Confirmar substituição de horários">
      <h3 className="font-semibold">Confirmar substituição de horários</h3>
      <p>Aplicar {confirmation.time} a {confirmation.targets.length} item(ns) editável(is)? Horários existentes e indicações de Horário não informado desses itens serão substituídos. Itens protegidos e Não servido permanecem preservados.</p>
      <p>Os valores anteriores permanecerão nas versões e na auditoria após o salvamento. Confirme somente horários reais.</p>
      <div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" onClick={() => setConfirmation(null)}>Cancelar</button><button type="button" className="btn-primary" onClick={confirm}>Confirmar aplicação do horário</button></div>
    </section></div>}
  </section>;
}
