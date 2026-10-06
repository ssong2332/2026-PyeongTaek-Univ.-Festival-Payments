import { devices } from "@playwright/test";
import { expect, test } from "./support/transferOrderFixture";

// T-24 (N-13, Architecture "E2E 1개"): QR 진입 → 메뉴 담기 → 계좌이체 주문 → 송금 안내 → [송금했어요]
// → 관리자 로그인 → 대시보드 "송금 신고됨" 확인 → 입금 확인. 로컬 Supabase 실물, mock 없음.
// 고객은 모바일 프로젝트(Pixel 7·iPhone 14) 화면, 관리자는 같은 테스트 안에서 데스크톱 창을 따로 연다.
test.skip(({ isMobile }) => !isMobile, "고객 화면은 모바일 프로젝트에서 실행한다");

const won = (amount: number) => `${amount.toLocaleString("ko-KR")}원`;
const pickup = (number: number) => String(number).padStart(3, "0");

test("계좌이체 주문 → 송금 신고 → 관리자 입금 확인", async ({ page, browser, baseURL, scenario }) => {
    const { db, menu, transfer, admin } = scenario;

    // 1. 메뉴판 → 담기 → 장바구니 → 결제수단
    await page.goto("/");
    await page.getByRole("region", { name: "전체 메뉴" }).getByRole("button", { name: new RegExp(menu.name) }).click();
    await page.getByRole("dialog").getByRole("button", { name: /담기/ }).click();
    await page.getByRole("link", { name: /장바구니 보기 \(1개/ }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await page.getByRole("link", { name: "주문하기" }).click();
    await expect(page).toHaveURL(/\/checkout$/);

    // 2. 계좌이체 선택 → 주문 확정
    await page.getByRole("radio", { name: /계좌이체/ }).check({ force: true });
    await page.getByRole("button", { name: `${won(menu.price)} 주문하기` }).click();
    await expect(page).toHaveURL(/\/orders\/[^/?]+\?new=1$/);
    const token = new URL(page.url()).pathname.split("/").pop() as string;

    // 3. 주문 완료 화면: 계좌 안내(설정값 그대로)와 입금할 금액
    const guide = page.getByRole("region", { name: /계좌/ });
    await expect(guide).toContainText(transfer.bankName);
    await expect(guide).toContainText(transfer.accountNumber);
    await expect(guide).toContainText(transfer.accountHolder);
    await expect(guide).toContainText(won(menu.price));

    const created = await db.from("orders")
        .select("id, pickup_number, status, payment_method, total_amount, transfer_reported_at")
        .eq("status_token", token).single();
    expect(created.error).toBeNull();
    const order = created.data!;
    expect(order).toMatchObject({
        status: "pending", payment_method: "transfer", total_amount: menu.price, transfer_reported_at: null,
    });
    const stock = await db.from("menu_items").select("stock").eq("id", menu.id).single();
    expect(stock.data?.stock).toBe(menu.stock - 1);

    // 4. [송금했어요] → 신고 시각 저장, 상태는 결제대기 그대로
    await guide.getByRole("button", { name: "송금했어요" }).click();
    await expect(guide.getByRole("status")).toContainText("송금 신고 완료");
    const reported = await db.from("orders").select("status, transfer_reported_at").eq("id", order.id).single();
    expect(reported.data?.status).toBe("pending");
    expect(reported.data?.transfer_reported_at).not.toBeNull();

    // 5. 관리자: 비로그인이면 로그인 화면으로 → 로그인 → 대시보드
    const adminContext = await browser.newContext({ ...devices["Desktop Chrome"], baseURL });
    try {
        const adminPage = await adminContext.newPage();
        await adminPage.goto("/admin");
        await expect(adminPage).toHaveURL(/\/admin\/login$/);
        await adminPage.getByLabel("이메일").fill(admin.email);
        await adminPage.getByLabel("비밀번호").fill(admin.password);
        await adminPage.getByRole("button", { name: /로그인/ }).click();
        await expect(adminPage).toHaveURL(/\/admin$/);

        // 6. 대시보드: 해당 주문표에 "송금 신고됨" → 상세 → [입금 확인]
        const card = adminPage.getByRole("button", { name: `픽업 ${pickup(order.pickup_number)} 주문 상세` });
        await expect(card).toContainText("송금 신고됨");
        await expect(card).toHaveAttribute("data-status", "pending");
        await card.click();
        const detail = adminPage.getByRole("region", { name: "주문 상세" });
        await expect(detail).toContainText("송금 신고됨");
        await expect(detail).toContainText("계좌이체");
        await detail.getByRole("button", { name: "입금 확인" }).click();
        await expect(card).toHaveAttribute("data-status", "paid");

        // 7. DB: 결제확인으로 한 번만 전환, 이력은 주문 생성 + 관리자 입금 확인 2행, 재고는 그대로
        const paid = await db.from("orders").select("status, paid_at").eq("id", order.id).single();
        expect(paid.data?.status).toBe("paid");
        expect(paid.data?.paid_at).not.toBeNull();
        const history = await db.from("order_status_history")
            .select("from_status, to_status, action, actor_type, actor_id").eq("order_id", order.id).order("id");
        expect(history.data).toEqual([
            { from_status: null, to_status: "pending", action: "create", actor_type: "customer", actor_id: null },
            { from_status: "pending", to_status: "paid", action: "confirm_payment", actor_type: "admin", actor_id: admin.id },
        ]);
        const after = await db.from("menu_items").select("stock").eq("id", menu.id).single();
        expect(after.data?.stock).toBe(menu.stock - 1);
    } finally {
        await adminContext.close();
    }
});
