import { vi } from "vitest";

// 실제 클라이언트는 유지하고 Next.js의 서버 전용 표시만 테스트 환경에서 대체한다.
vi.mock("server-only", () => ({}));
