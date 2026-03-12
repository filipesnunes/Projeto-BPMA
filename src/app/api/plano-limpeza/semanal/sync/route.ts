import { NextResponse } from "next/server";

import { ensureWeeklyChecklistForDateRange } from "@/app/plano-limpeza/service";
import { parseDateInput } from "@/app/plano-limpeza/utils";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      startDate?: string;
      endDate?: string;
    };

    const start = parseDateInput(body?.startDate ?? "");
    const end = parseDateInput(body?.endDate ?? "");

    if (!start || !end) {
      return NextResponse.json(
        { error: "Período inválido para sincronização do checklist semanal." },
        { status: 400 }
      );
    }

    if (start.getTime() > end.getTime()) {
      return NextResponse.json(
        { error: "A data inicial não pode ser maior do que a data final." },
        { status: 400 }
      );
    }

    const result = await ensureWeeklyChecklistForDateRange({ start, end });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Não foi possível sincronizar o checklist semanal." },
      { status: 500 }
    );
  }
}
