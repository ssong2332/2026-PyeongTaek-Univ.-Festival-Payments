import type { SweepRepository, SweepResult } from "./ports";

export function sweepOrders(repository: SweepRepository): Promise<SweepResult> {
    return repository.sweep();
}
