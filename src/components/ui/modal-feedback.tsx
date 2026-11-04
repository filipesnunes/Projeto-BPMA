"use client";
import { useSearchParams } from "next/navigation";

export function ModalFeedback() {
  const params=useSearchParams(),message=params.get("feedback");
  if(!message)return null;
  const error=params.get("feedbackType")==="error";
  return <p role={error?"alert":"status"} className={`mt-3 rounded border p-3 ${error?"border-red-500":"border-emerald-500"}`}>{message}</p>;
}
