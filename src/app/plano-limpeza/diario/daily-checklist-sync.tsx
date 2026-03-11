"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

type DailyChecklistSyncProps = {
  date: string | null;
  enabled: boolean;
};

export function DailyChecklistSync({
  date,
  enabled
}: DailyChecklistSyncProps) {
  const router = useRouter();
  const hasRequestedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !date || hasRequestedRef.current) {
      return;
    }

    hasRequestedRef.current = true;

    void fetch("/api/plano-limpeza/diario/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ date })
    })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }

        return response.json() as Promise<{ createdCount?: number }>;
      })
      .then((result) => {
        if (result?.createdCount && result.createdCount > 0) {
          router.refresh();
        }
      })
      .catch(() => {
        // Falhas de sincronização não devem quebrar a tela operacional.
      });
  }, [date, enabled, router]);

  return null;
}
