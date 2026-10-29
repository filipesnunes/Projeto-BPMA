import {notFound} from "next/navigation";
import {TemperatureSavedRecordPage} from "../../saved-record-page";
export const dynamic="force-dynamic";
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const id=Number((await params).id);if(!Number.isSafeInteger(id)||id<1)notFound();
  return TemperatureSavedRecordPage({id,query:await searchParams});
}
