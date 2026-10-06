// 로컬 미리보기용 데모 데이터 — `npm run dev`인데 Supabase 연결 값(.env.local)이 없을 때만 켜진다.
// 운영 빌드(NODE_ENV=production)와 단위 테스트(NODE_ENV=test)에서는 이 모듈이 아무것도 하지 않는다.
// 브라우저 fetch를 가로채 고객 API(/api/menu 등)에 시드와 같은 메뉴·가짜 주문을 돌려준다. 서버·DB는 건드리지 않는다.

export const DEMO_MODE = process.env.NODE_ENV === "development" && !process.env.NEXT_PUBLIC_SUPABASE_URL;

// [ID, 가격, 이름(ko), 설명(ko), 이름(en), 설명(en)] — seed.sql과 같은 값
const MENU: readonly [string, number, string, string, string, string][] = [
    ["11111111-1111-1111-1111-111111111111", 2000, "기본 호떡", "달달한 호떡소가 가득 들어간 클래식 호떡", "Original Hotteok", "Classic hotteok filled with sweet syrup."],
    ["55555555-5555-5555-5555-555555555555", 2500, "허니버터 호떡", "달콤한 호떡에 고소하고 진한 허니버터 풍미를 듬뿍!", "Honey Butter Hotteok", "Sweet hotteok with rich honey butter flavor."],
    ["66666666-6666-6666-6666-666666666666", 2500, "체다치즈 호떡", "달콤한 호떡소와 짭짤하고 진한 체다치즈의 단짠 조합", "Cheddar Cheese Hotteok", "Sweet filling with savory, rich cheddar cheese."],
    ["77777777-7777-7777-7777-777777777777", 2500, "콘소메 호떡", "바삭하게 구운 호떡에 짭짤하고 고소한 콘소메 시즈닝을 듬뿍!", "Consomme Hotteok", "Crispy hotteok coated in savory consomme seasoning."],
    ["22222222-2222-2222-2222-222222222222", 2500, "뿌링클 호떡", "달콤한 호떡에 치즈 풍미 가득한 뿌링클 시즈닝을 듬뿍 입힌 단짠 호떡", "Bburinkle Hotteok", "Sweet hotteok coated in cheesy Bburinkle seasoning."],
    ["88888888-8888-8888-8888-888888888888", 3000, "콘치즈 호떡", "톡톡 터지는 옥수수와 쭉 늘어나는 치즈가 가득한 고소한 호떡", "Corn Cheese Hotteok", "Hotteok filled with sweet corn and stretchy cheese."],
    ["99999999-9999-9999-9999-999999999999", 3000, "고구마 치즈 호떡", "달콤하고 부드러운 고구마에 고소한 치즈를 더한 달달한 호떡", "Sweet Potato Cheese Hotteok", "Sweet, soft sweet potato with savory cheese."],
    ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", 3000, "흑임자 콩가루 호떡", "고소한 콩가루와 진한 흑임자가루를 듬뿍 입힌 고소달달 호떡", "Black Sesame Soybean Powder Hotteok", "Sweet hotteok coated in soybean and black sesame powders."],
    ["bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", 3500, "불닭 콘치즈 호떡", "고소한 콘치즈에 매콤한 불닭소스와 불닭 마요를 더한 화끈한 호떡", "Buldak Corn Cheese Hotteok", "Corn cheese hotteok with spicy Buldak sauce and mayo."],
    ["cccccccc-cccc-cccc-cccc-cccccccccccc", 3500, "말차 화이트초코 호떡", "쌉싸름한 말차와 달콤하고 부드러운 화이트초코가 어우러진 달콤쌉싸름 호떡", "Matcha White Chocolate Hotteok", "Bittersweet matcha with sweet, creamy white chocolate."],
];
const OPTION_NAMES: readonly [string, string][] = [
    ["허니버터", "Honey Butter"],
    ["체다치즈", "Cheddar Cheese"],
    ["콘소메", "Consomme"],
    ["뿌링클", "Bburinkle"],
];
// 메뉴 API처럼 ?lang=en이면 영어 이름(F-05)
function itemsFor(lang: string) {
    const en = lang === "en";
    const options = OPTION_NAMES.map(([ko, english], index) => ({
        id: `0000000${index}-0000-0000-0000-00000000000${index}`,
        name: en ? english : ko,
        extraPrice: 500,
    }));
    return MENU.map(([id, price, name, description, nameEn, descriptionEn], index) => ({
        id,
        price,
        name: en ? nameEn : name,
        description: en ? descriptionEn : description,
        stock: 30,
        // 데모에서 추천 영역(T-38)이 보이게 앞 3개만 추천
        isRecommended: index < 3,
        isAvailable: true,
        isSoldOut: false,
        imageUrl: null,
        optionGroups: [{ id: "10000000-0000-0000-0000-000000000001", name: en ? "Extra Seasoning" : "시즈닝 추가", minSelect: 0, maxSelect: 1, options }],
    }));
}

// 데모 주문: 만든 시각부터 결제대기 → (15초) 결제확인 → (25초) 조리중 → (45초) 완료로 저절로 넘어간다.
type DemoOrder = {
    token: string;
    pickupNumber: number;
    paymentMethod: "cash" | "transfer";
    totalAmount: number;
    createdAt: number;
    items: { name: string; quantity: number; options: string[]; lineTotal: number }[];
    transferReportedAt: string | null;
    cancelRequestedAt: string | null;
};
const STORE = "hotteok:demo-orders";

function readOrders(): DemoOrder[] {
    try {
        return JSON.parse(sessionStorage.getItem(STORE) ?? "[]") as DemoOrder[];
    } catch {
        return [];
    }
}
function writeOrders(orders: DemoOrder[]) {
    try {
        sessionStorage.setItem(STORE, JSON.stringify(orders));
    } catch {
        // 저장 못 해도 이번 화면에서는 동작한다.
    }
}
function statusOf(order: DemoOrder) {
    if (order.cancelRequestedAt) return "pending" as const;
    const seconds = (Date.now() - order.createdAt) / 1000;
    if (seconds < 15) return "pending" as const;
    if (seconds < 25) return "paid" as const;
    if (seconds < 45) return "cooking" as const;
    return "completed" as const;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function handle(url: URL, init?: RequestInit): Response | null {
    const path = url.pathname;
    if (path === "/api/menu") {
        const lang = url.searchParams.get("lang") === "en" ? "en" : "ko";
        return json({ items: itemsFor(lang), waitingCount: 3, locale: lang });
    }
    if (path === "/api/queue") return json({ waitingCount: 3 });
    if (path === "/api/settings/transfer") return json({ configured: true, bankName: "데모은행", accountNumber: "000-0000-0000", accountHolder: "호떡 부스" });
    if (path === "/api/orders" && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { paymentMethod: "cash" | "transfer"; locale?: string; items: { menuItemId: string; quantity: number; optionIds: string[] }[] };
        // 서버처럼 주문 언어로 이름을 남긴다(orders.locale)
        const menuItems = itemsFor(body.locale ?? "ko");
        const lines = body.items.map((line) => {
            const menu = menuItems.find((item) => item.id === line.menuItemId);
            const options = menuItems[0].optionGroups[0].options.filter((option) => line.optionIds.includes(option.id));
            const unit = (menu?.price ?? 0) + options.reduce((sum, option) => sum + option.extraPrice, 0);
            return { name: menu?.name ?? "호떡", quantity: line.quantity, options: options.map((option) => option.name), lineTotal: unit * line.quantity };
        });
        const orders = readOrders();
        const order: DemoOrder = {
            token: Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join(""),
            pickupNumber: 27 + orders.length,
            paymentMethod: body.paymentMethod,
            totalAmount: lines.reduce((sum, line) => sum + line.lineTotal, 0),
            createdAt: Date.now(),
            items: lines,
            transferReportedAt: null,
            cancelRequestedAt: null,
        };
        writeOrders([...orders, order]);
        return json(
            {
                orderId: "99999999-9999-4999-8999-999999999999",
                pickupNumber: order.pickupNumber,
                statusToken: order.token,
                status: "pending",
                totalAmount: order.totalAmount,
                createdAt: new Date(order.createdAt).toISOString(),
                created: true,
            },
            201,
        );
    }
    const match = path.match(/^\/api\/orders\/([0-9a-f]{64})(\/[a-z-]+)?$/);
    if (match) {
        const orders = readOrders();
        const order = orders.find((entry) => entry.token === match[1]);
        if (!order) return json({ error: { code: "NOT_FOUND", message: "x" } }, 404);
        const action = match[2];
        const now = new Date().toISOString();
        if (action === "/transfer-report") {
            order.transferReportedAt ??= now;
            writeOrders(orders);
            return json({ transferReportedAt: order.transferReportedAt });
        }
        if (action === "/cancel-request") {
            order.cancelRequestedAt ??= now;
            writeOrders(orders);
            return json({ cancelRequestedAt: order.cancelRequestedAt });
        }
        if (action === "/reviews") return json({ createdAt: now }, 201);
        const status = statusOf(order);
        return json({
            orderId: "11111111-1111-1111-1111-111111111111",
            pickupNumber: order.pickupNumber,
            status,
            paymentMethod: order.paymentMethod,
            totalAmount: order.totalAmount,
            items: order.items,
            createdAt: new Date(order.createdAt).toISOString(),
            transferReportedAt: order.transferReportedAt,
            cancelRequestedAt: order.cancelRequestedAt,
            cancelRejectedAt: null,
            aheadCount: status === "completed" ? 0 : 2,
            canTransferReport: order.paymentMethod === "transfer" && status === "pending" && !order.transferReportedAt,
            canCancelRequest: (status === "pending" || status === "paid") && !order.cancelRequestedAt,
        });
    }
    return null;
}

let installed = false;

export function installDemoFetch() {
    if (!DEMO_MODE || installed || typeof window === "undefined") return;
    installed = true;
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin);
        if (url.origin === window.location.origin && url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/admin")) {
            const response = handle(url, init);
            if (response) {
                // 실제 네트워크처럼 잠깐 기다린다. 주문 전송은 조금 더 길게 — 버튼의 캐러멜 진행 연출이 보이게.
                const slow = url.pathname === "/api/orders" && init?.method === "POST";
                await new Promise((resolve) => setTimeout(resolve, slow ? 1400 : 250));
                return response;
            }
        }
        return original(input, init);
    };
}
