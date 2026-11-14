// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReview } from "@/features/customer/useReview";

const TOKEN = "0123456789abcdef".repeat(4);
const OTHER_TOKEN = "abcdef0123456789".repeat(4);
const MARKER_KEY = `hotteok:review:v2:${TOKEN.slice(0, 24)}`;
const LEGACY_KEY = `hotteok:review:${TOKEN}`;
const START = new Date("2026-10-07T03:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

const response = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(START);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useReview device marker", () => {
  it("successful submission stores only a 24-hour marker, never the full status token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(201, { createdAt: START.toISOString() }));
    vi.stubGlobal("fetch", fetchMock);

    const first = renderHook(() => useReview(TOKEN));
    await act(async () => first.result.current.submit(5, "좋아요"));
    expect(first.result.current.submitted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(localStorage.getItem(MARKER_KEY)).toBe(String(START.getTime()));
    expect([...Array(localStorage.length)].map((_, index) => localStorage.key(index))).toEqual([MARKER_KEY]);

    first.unmount();
    const reopened = renderHook(() => useReview(TOKEN));
    expect(reopened.result.current.submitted).toBe(true);
    reopened.unmount();

    vi.setSystemTime(new Date(START.getTime() + DAY_MS));
    const expired = renderHook(() => useReview(TOKEN));
    expect(expired.result.current.submitted).toBe(false);
    expect(localStorage.getItem(MARKER_KEY)).toBeNull();
  });

  it("migrates the current legacy marker and removes all full-token keys", () => {
    localStorage.setItem(LEGACY_KEY, "1");
    localStorage.setItem(`hotteok:review:${OTHER_TOKEN}`, "1");

    const { result } = renderHook(() => useReview(TOKEN));
    expect(result.current.submitted).toBe(true);
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(localStorage.getItem(`hotteok:review:${OTHER_TOKEN}`)).toBeNull();
    expect(localStorage.getItem(MARKER_KEY)).toBe(String(START.getTime()));
  });

  it("server duplicate response still shows submitted without retaining the full token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(409, {
      error: { code: "REVIEW_ALREADY_SUBMITTED", message: "already submitted" },
    })));

    const { result } = renderHook(() => useReview(TOKEN));
    await act(async () => result.current.submit(4, ""));
    expect(result.current.submitted).toBe(true);
    expect(result.current.error).toBeNull();
    expect(localStorage.getItem(MARKER_KEY)).toBe(String(START.getTime()));
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });
});
