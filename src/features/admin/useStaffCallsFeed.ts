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
  const pollNowRef = useRef<(() => void) | null>(null);

  const acknowledge = useCallback(
    async (id: string) => {
      setIsAcknowledging(true);
      try {
        const response = await fetch(`/api/admin/staff-calls/${encodeURIComponent(id)}/acknowledge`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        if (!response.ok) {
          throw new Error("Failed to acknowledge staff call");
        }

        setCalls((prev) => prev.filter((c) => c.id !== id));
        setUnacknowledgedCount((prev) => Math.max(0, prev - 1));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error acknowledging staff call");
      } finally {
        setIsAcknowledging(false);
      }
    },
    [],
  );

  useEffect(() => {
    let active = true;
    let inFlight = false;

    async function poll() {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch("/api/admin/staff-calls?unacknowledgedOnly=true", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Failed to fetch staff calls");
        }

        const data = await response.json();
        const parsed = StaffCallsListResponseSchema.parse(data);

        if (!active) return;
        setCalls(parsed.calls);
        setUnacknowledgedCount(parsed.unacknowledgedCount);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Error fetching staff calls");
      } finally {
        if (active) {
          setIsLoading(false);
        }
        inFlight = false;
      }
    }

    const intervalId = setInterval(() => void poll(), pollIntervalMs);
    pollNowRef.current = () => void poll();
    void poll();

    return () => {
      active = false;
      clearInterval(intervalId);
      pollNowRef.current = null;
    };
  }, [pollIntervalMs]);

  const reload = useCallback(async () => {
    pollNowRef.current?.();
  }, []);

  return {
    calls,
    unacknowledgedCount,
    isLoading,
    isAcknowledging,
    error,
    reload,
    acknowledge,
  };
}
