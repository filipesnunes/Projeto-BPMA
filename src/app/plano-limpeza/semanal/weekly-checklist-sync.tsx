"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

type WeeklyChecklistSyncProps = {
  startDate: string | null;
  endDate: string | null;
  enabled: boolean;
};

export function WeeklyChecklistSync({
  startDate,
  endDate,
  enabled
}: WeeklyChecklistSyncProps) {
  const router = useRouter();
  const hasRequestedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !startDate || !endDate || hasRequestedRef.current) {
      return;
    }

    hasRequestedRef.current = true;

    void fetch("/api/plano-limpeza/semanal/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ startDate, endDate })
    })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }

        return response.json() as Promise<{
          createdCount?: number;
          removedCount?: number;
        }>;
      })
      .then((result) => {
        if (
          (result?.createdCount && result.createdCount > 0) ||
          (result?.removedCount && result.removedCount > 0)
        ) {
          router.refresh();
        }
      })
      .catch(() => {
        // Falhas de sincronização não devem interromper a operação.
      });
  }, [enabled, startDate, endDate, router]);

  return null;
}
