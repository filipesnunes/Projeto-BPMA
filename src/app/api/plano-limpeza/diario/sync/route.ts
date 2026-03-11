import { NextResponse } from "next/server";

import { ensureDailyChecklistForDate } from "@/app/plano-limpeza/service";
import { parseDateInput } from "@/app/plano-limpeza/utils";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { date?: string };
    const date = parseDateInput(body?.date ?? "");

    if (!date) {
      return NextResponse.json(
        { error: "Data inválida para sincronização do checklist diário." },
        { status: 400 }
      );
    }

    const result = await ensureDailyChecklistForDate(date);

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Não foi possível sincronizar o checklist diário." },
      { status: 500 }
    );
  }
}
