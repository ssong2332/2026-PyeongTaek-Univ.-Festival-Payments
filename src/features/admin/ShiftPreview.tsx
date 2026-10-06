"use client";

import { useState } from "react";
import type { Shift } from "@/domain/shift/schedule";
import { ShiftManagement, type ShiftApi } from "./ShiftManagement";

// /dev/shifts 미리보기용 메모리 저장소. 새로고침하면 비워진다.
function createMemoryShiftApi(): ShiftApi {
    let shifts: Shift[] = [];
    return {
        list: async () => structuredClone(shifts),
        create: async (input) => {
            const shift = { id: crypto.randomUUID(), ...input };
            shifts = [...shifts, shift];
            return structuredClone(shift);
        },
        update: async (id, input) => {
            const shift = { id, ...input };
            shifts = shifts.map((item) => (item.id === id ? shift : item));
            return structuredClone(shift);
        },
        remove: async (id) => {
            shifts = shifts.filter((item) => item.id !== id);
        },
    };
}

export function ShiftPreview() {
    const [api] = useState(createMemoryShiftApi);
    const [initialNow] = useState(() => new Date().toISOString());
    return (
        <>
            <p className="border-b border-syrup/30 bg-syrup/10 px-4 py-2 text-sm text-syrup">목업 미리보기 · 실제 스케줄과 연결되지 않습니다. 새로고침하면 비워져요.</p>
            <ShiftManagement initialNow={initialNow} api={api} />
        </>
    );
}
