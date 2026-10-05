"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { StaffCallsListResponseSchema, type StaffCallDto } from "@/lib/dto/staffCall";

export interface UseStaffCallsFeedReturn {
  calls: StaffCallDto[];
  unacknowledgedCount: number;
  isLoading: boolean;
  isAcknowledging: boolean;
  error: string | null;
  reload: () => Promise<void>;
  acknowledge: (id: string) => Promise<void>;
}

export function useStaffCallsFeed(pollIntervalMs = 5000): UseStaffCallsFeedReturn {
  const [calls, setCalls] = useState<StaffCallDto[]>([]);
  const [unacknowledgedCount, setUnacknowledgedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isAcknowledging, setIsAcknowledging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollNowRef = useRef<(() => Promise<void>) | null>(null);

  const acknowledge = useCallback(async (id: string) => {
    setIsAcknowledging(true);
    try {
      const response = await fetch(`/api/admin/staff-calls/${encodeURIComponent(id)}/acknowledge`, { method: "POST", headers: { "Content-Type": "application/json" } });
      if (!response.ok) throw new Error("Failed to acknowledge staff call");
      setCalls((prev) => prev.filter((call) => call.id !== id));
      setUnacknowledgedCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      const failure = err instanceof Error ? err : new Error("Error acknowledging staff call");
      throw failure;
    } finally {
      setIsAcknowledging(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let inFlight = false;

    async function poll() {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch("/api/admin/staff-calls?unacknowledgedOnly=true", { cache: "no-store" });
        if (!response.ok) throw new Error("Failed to fetch staff calls");
        const parsed = StaffCallsListResponseSchema.parse(await response.json());
        if (!active) return;
        setCalls(parsed.calls);
        setUnacknowledgedCount(parsed.unacknowledgedCount);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Error fetching staff calls");
      } finally {
        if (active) setIsLoading(false);
        inFlight = false;
      }
    }

    pollNowRef.current = poll;
    const intervalId = setInterval(() => void poll(), pollIntervalMs);
    void poll();
    return () => { active = false; clearInterval(intervalId); pollNowRef.current = null; };
  }, [pollIntervalMs]);

  const reload = useCallback(async () => { await pollNowRef.current?.(); }, []);

  return { calls, unacknowledgedCount, isLoading, isAcknowledging, error, reload, acknowledge };
}
