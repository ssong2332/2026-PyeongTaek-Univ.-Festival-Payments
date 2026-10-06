import { buildOperationsReport, listReportDates, type OperationsReport } from "@/domain/report/operationsReport";
import { AppError } from "@/lib/api/errors";
import { OperationsReportSchema, type OperationsReportDto } from "@/lib/dto/report";
import type { ReportRepository } from "./reportPorts";

export interface ReportDateRange {
    from: string;
    to: string;
}

/** 기간 검증: 형식·달력 오류, 역순, 최대 일수 초과는 400. DB를 읽기 전에 호출한다. */
export function resolveReportDates(range: ReportDateRange): string[] {
    try {
        return listReportDates(range.from, range.to);
    } catch {
        throw new AppError("VALIDATION_ERROR", 400);
    }
}

export async function getOperationsReport(
    range: ReportDateRange,
    repository: ReportRepository,
): Promise<OperationsReportDto> {
    const dates = resolveReportDates(range);
    const [dailyStats, reviews] = await Promise.all([
        Promise.all(dates.map(date => repository.loadDailyStats(date))),
        repository.listReviews(),
    ]);

    let report: OperationsReport;
    try {
        report = buildOperationsReport({ from: range.from, to: range.to, dailyStats, reviews });
    } catch {
        // 날짜가 맞지 않는 집계·범위 밖 별점 등 DB 응답 이상 — 상세는 노출하지 않는다.
        throw new AppError("INTERNAL_ERROR", 500);
    }
    const parsed = OperationsReportSchema.safeParse(report);
    if (!parsed.success) throw new AppError("INTERNAL_ERROR", 500);
    return parsed.data;
}
