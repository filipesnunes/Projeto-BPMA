import { readBuffetCorrection } from "./correction-evidence";

const labels: Record<string, string> = { tcEquipamento: "TC Equipamento", primeiraTc: "TC do Alimento", segundaTc: "Segunda TC", acaoCorretiva: "Ação corretiva", observacao: "Observação", status: "Situação do item", statusTemperatura: "Situação da temperatura", horarioExecucao: "Horário da execução", horarioNaoInformado: "Horário não informado", justificativaHorario: "Justificativa do horário", classificacao: "Classificação", usaGarrafaTermica: "Garrafa térmica", temperaturaAmbiente: "Temperatura ambiente" };
const display = (value: string | number | boolean | null) => value === null || value === "" ? "Não informado" : value === true ? "Sim" : value === false ? "Não" : String(value);
export function BuffetCorrectionDetails({ evidence }: { evidence: string | null }) {
  const correction = readBuffetCorrection(evidence);
  if (!correction) return <span>{evidence}</span>;
  return <div className="my-2 rounded border p-3 text-sm" data-buffet-correction>
    <p>Correção de informações; executores originais preservados.</p>
    {correction.justificativa && <p>Justificativa: {correction.justificativa}</p>}
    <ul className="space-y-2">{correction.itens.map(item => <li key={item.id}>
      <strong>{item.nome}</strong> — registro #{item.id} — executor original: {item.executorOriginal.nome}
      <ul>{item.campos.map(field => <li key={field.campo}>{labels[field.campo] ?? field.campo}: {display(field.antes)} → {display(field.depois)}</li>)}</ul>
    </li>)}</ul>
  </div>;
}
