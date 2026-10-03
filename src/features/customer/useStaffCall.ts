"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { CallStaffResponseSchema } from "@/lib/dto/staffCall";

export interface UseStaffCallReturn {
  isCalling: boolean;
  cooldownRemaining: number; // 남은 쿨다운 초 (0이면 호출 가능)
  message: string | null;
  errorMessage: string | null;
  callStaff: () => Promise<boolean>;
}

export function useStaffCall(token: string): UseStaffCallReturn {
  const [isCalling, setIsCalling] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (cooldownRemaining <= 0) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [cooldownRemaining]);

  const callStaff = useCallback(async (): Promise<boolean> => {
    if (cooldownRemaining > 0 || isCalling) {
      return false;
    }

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
        const retryAfter = errorData?.error?.details?.retryAfter ?? 120;
        setCooldownRemaining(retryAfter);
        setErrorMessage("잠시 후 다시 호출 가능합니다.");
        return false;
      }

      if (!response.ok) {
        setErrorMessage("직원 호출에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        return false;
      }

      const data = await response.json();
      const parsed = CallStaffResponseSchema.parse(data);

      setCooldownRemaining(parsed.cooldownSeconds || 120);
      setMessage("직원을 호출했습니다. 잠시만 기다려 주세요.");
      return true;
    } catch {
      setErrorMessage("네트워크 오류가 발생했습니다. 다시 시도해 주세요.");
      return false;
    } finally {
      setIsCalling(false);
    }
  }, [token, cooldownRemaining, isCalling]);

  return {
    isCalling,
    cooldownRemaining,
    message,
    errorMessage,
    callStaff,
  };
}
