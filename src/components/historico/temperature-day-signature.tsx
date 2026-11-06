import { type TemperatureDayReview, temperatureDayStatus } from "@/app/controle-temperatura-equipamentos/day-review";
import { SupervisorSignatureStatus } from "./technical-signature";

export function TemperatureDaySignatureStatus({day}:{day?:TemperatureDayReview}) {
  if(day?.summary)return <SupervisorSignatureStatus signature={day.summary}/>;
  return <div className="space-y-1 text-sm" data-temperature-day-status>
    <span className="inline-flex rounded-full border border-amber-300 px-2.5 py-1 text-xs font-medium">{day?temperatureDayStatus(day):"Pendente assinatura"}</span>
    {day&&day.pending>0&&<p>{day.pending} de {day.total} aferições ainda precisam de validação técnica.</p>}
    {Boolean(day?.managerial)&&<p>Há revisão gerencial ou operacional registrada; ela não substitui a validação técnica.</p>}
  </div>;
}
