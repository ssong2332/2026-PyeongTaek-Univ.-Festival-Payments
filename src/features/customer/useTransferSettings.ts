"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/api/client";
import { TransferSettingsDtoSchema, type TransferSettingsDto } from "@/lib/dto/settings";

// T-31 (F-42): 계좌 안내 블록이 GET /api/settings/transfer를 한 번 읽는다. 값은 관리자 설정(app_settings, ADR-0004).
export type TransferSettingsState =
  | { status: "loading" }
  | { status: "ready"; settings: TransferSettingsDto }
  | { status: "error" };

export function useTransferSettings(): TransferSettingsState & { retry: () => void } {
  const [state, setState] = useState<TransferSettingsState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    fetchJson("/api/settings/transfer", { cache: "no-store" }, { parse: (data) => TransferSettingsDtoSchema.parse(data) })
      .then((settings) => {
        if (active) setState({ status: "ready", settings });
      })
      .catch(() => {
        if (active) setState({ status: "error" });
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  return { ...state, retry };
}
