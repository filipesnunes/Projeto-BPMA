import { notFound } from "next/navigation";
import { OilSavedRecordPage } from "../../saved-record-page";
export const dynamic="force-dynamic";
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const {id}=await params;if(!/^[1-9]\d*$/.test(id)||!Number.isSafeInteger(Number(id)))notFound();
  return OilSavedRecordPage({id:Number(id),query:await searchParams});
}
