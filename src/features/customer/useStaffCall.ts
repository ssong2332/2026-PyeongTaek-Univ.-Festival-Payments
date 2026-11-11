"use client";

import { useCallback, useEffect, useState } from "react";
import { CallStaffResponseSchema } from "@/lib/dto/staffCall";
import { useT } from "@/lib/i18n/locale";

export interface UseStaffCallReturn {
  isCalling: boolean;
  cooldownRemaining: number;
  message: string | null;
  errorMessage: string | null;
  callStaff: () => Promise<boolean>;
}

export function useStaffCall(token: string): UseStaffCallReturn {
  const t = useT();
  const [isCalling, setIsCalling] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const timeoutId = setTimeout(() => {
      setCooldownRemaining((previous) => Math.max(0, previous - 1));
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [cooldownRemaining]);

  const callStaff = useCallback(async (): Promise<boolean> => {
    if (cooldownRemaining > 0 || isCalling) return false;
    setIsCalling(true);
    setMessage(null);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(token)}/call-staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (response.status === 429) {
        const errorData = await response.json().catch(() => null);
        const retryAfterSeconds = errorData?.error?.details?.retryAfterSeconds ?? 120;
        setCooldownRemaining(retryAfterSeconds);
        setErrorMessage(t("staffCall.cooldown"));
        return false;
      }
      if (!response.ok) {
        setErrorMessage(t("staffCall.failed"));
        return false;
      }
      const parsed = CallStaffResponseSchema.parse(await response.json());
      setCooldownRemaining(parsed.cooldownSeconds || 120);
      setMessage(t("staffCall.called"));
      return true;
    } catch {
      setErrorMessage(t("staffCall.network"));
      return false;
    } finally {
      setIsCalling(false);
    }
  }, [token, cooldownRemaining, isCalling, t]);

  return { isCalling, cooldownRemaining, message, errorMessage, callStaff };
}
