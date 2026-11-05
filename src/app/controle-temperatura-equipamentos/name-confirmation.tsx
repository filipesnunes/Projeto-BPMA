import { prisma } from "@/lib/prisma";
import { TemperatureNameConfirmation } from "@/components/temperature-name-confirmation";
import { temperatureNameChanges, type TemperatureNameChange } from "./nomenclature";

export async function TemperatureSignatureIdentity({ scope }: { scope: readonly { id: string; version: number }[] }) {
  const changes: TemperatureNameChange[] = [], errors: string[] = [];
  for (const item of scope) {
    try { changes.push(...await temperatureNameChanges(prisma,[item])); }
    catch (error) { errors.push(error instanceof Error && !/prisma|p20\d|transaction/i.test(error.message) ? error.message : "Não foi possível conferir uma aferição. Atualize a consulta."); }
  }
  return <>{errors.map((error,index)=><p role="alert" className="text-sm" key={index}>{error}</p>)}<TemperatureNameConfirmation changes={changes}/></>;
}
