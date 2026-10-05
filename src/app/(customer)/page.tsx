"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useLayoutEffect, useState } from "react";
import { CategoryChips } from "@/components/customer/CategoryChips";
import { MenuCard } from "@/components/customer/MenuCard";
import { MenuDetailSheet } from "@/components/customer/MenuDetailSheet";
import { MenuHero } from "@/components/customer/MenuHero";
import { MenuSkeleton } from "@/components/customer/MenuSkeleton";
import { MyOrderLinks } from "@/components/customer/MyOrderLinks";
import { QueueCount } from "@/components/customer/QueueCount";
import { SearchBox } from "@/components/customer/SearchBox";
import {
    bumpCart,
    cartTargetRect,
    useCartBump,
} from "@/components/motion/cartBump";
import { sharedLayoutId } from "@/components/motion/presets";
import { PullToRefresh } from "@/components/motion/PullToRefresh";
import { RollingNumber } from "@/components/motion/RollingNumber";
import { BottomBar } from "@/components/ui/BottomBar";
import { CTA_ENABLED } from "@/components/ui/cta";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorRetry } from "@/components/ui/ErrorRetry";
import { CartIcon } from "@/components/ui/icons";
import {
    availableCategories,
    inCategory,
    type MenuCategoryId,
} from "@/features/customer/menuCategories";
import { menuImageUrl } from "@/features/customer/menuImages";
import { filterMenuItems } from "@/features/customer/menuSearch";
import { selectionHint } from "@/features/customer/messages";
import { useMyOrders } from "@/features/customer/myOrders";
import {
    selectCartCount,
    selectCartTotal,
    useCart,
    useCartHydrated,
} from "@/features/customer/useCart";
import { useMenu } from "@/features/customer/useMenu";
import { useMenuSelection } from "@/features/customer/useMenuSelection";
import type { MenuItemDto } from "@/lib/dto/menu";
import { formatWon } from "@/lib/format";

// 담기 성공 시 시트 사진 자리에서 장바구니 버튼까지 날아가는 사본
type Flight = { key: number; imageUrl: string | null; from: DOMRect };

const imageLayoutId = (menuId: string) => sharedLayoutId(`menu-image-${menuId}`);

// 고객 메뉴판(/) — PRD 화면 표 "고객 · 메뉴판", Architecture 8절.
export default function MenuPage() {
    const menu = useMenu();
    const hydrated = useCartHydrated();
    const count = useCart(selectCartCount);
    const total = useCart(selectCartTotal);
    const myOrders = useMyOrders();
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState<MenuCategoryId>("all");
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [flight, setFlight] = useState<Flight | null>(null);
    const cartBump = useCartBump();

    const cartCount = hydrated ? count : 0;
    const openMenu = menu.items.find((item) => item.id === openMenuId) ?? null;

    return (
        <>
            <PullToRefresh onRefresh={menu.reload} />
            <MenuHero cartCount={cartCount} />

            {/* 메뉴를 열면 뒤 화면은 살짝 물러나 흐려지고, 고른 메뉴만 앞으로 나온다 */}
            <motion.div
                animate={
                    openMenu
                        ? { scale: 0.96, opacity: 0.45 }
                        : { scale: 1, opacity: 1 }
                }
                transition={{ type: "spring", stiffness: 260, damping: 30 }}
                className="flex origin-top flex-col gap-3 px-4"
            >
                <QueueCount waitingCount={menu.waitingCount} />
                <MyOrderLinks orders={myOrders} />
                <SearchBox value={query} onChange={setQuery} />
                <section
                    aria-labelledby="menu-list-title"
                    className="mt-4 flex flex-col gap-3"
                >
                    <div className="flex items-end justify-between">
                        <h2
                            id="menu-list-title"
                            className="font-display text-2xl text-dough"
                        >
                            전체 메뉴
                        </h2>
                        {menu.status === "ready" && (
                            <span className="font-num pb-1 text-xs text-dough-dim">
                                {menu.items.length}종
                            </span>
                        )}
                    </div>
                    {menu.status === "ready" && (
                        <CategoryChips
                            categories={availableCategories(menu.items)}
                            value={category}
                            onChange={setCategory}
                        />
                    )}
                    <MenuList
                        status={menu.status}
                        items={menu.items}
                        category={category}
                        query={query}
                        onRetry={menu.reload}
                        onSelect={setOpenMenuId}
                    />
                </section>
            </motion.div>

            <BottomBar>
                <AnimatePresence mode="popLayout" initial={false}>
                    {cartCount > 0 ? (
                        <motion.div
                            key="cart"
                            initial={{ y: 60, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 60, opacity: 0 }}
                            transition={{
                                type: "spring",
                                stiffness: 380,
                                damping: 30,
                            }}
                        >
                            <Link
                                href="/cart"
                                aria-label={`장바구니 보기 (${cartCount}개, ${formatWon(total)})`}
                                className={CTA_ENABLED}
                            >
                                <motion.span
                                    animate={cartBump}
                                    data-cart-target="bar"
                                    className="relative flex size-9 items-center justify-center rounded-full bg-molasses/90 text-syrup"
                                >
                                    <CartIcon className="size-[18px]" />
                                    <motion.span
                                        key={cartCount}
                                        initial={{ scale: 0.3 }}
                                        animate={{ scale: 1 }}
                                        transition={{
                                            type: "spring",
                                            stiffness: 700,
                                            damping: 12,
                                        }}
                                        className="font-num absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-dough px-1 text-[10px] font-medium text-molasses"
                                    >
                                        {cartCount}
                                    </motion.span>
                                </motion.span>
                                <span className="flex-1">장바구니 보기</span>
                                <span className="font-num">
                                    <RollingNumber value={formatWon(total)} />
                                </span>
                            </Link>
                        </motion.div>
                    ) : (
                        <motion.button
                            key="empty"
                            type="button"
                            disabled
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex h-14 w-full items-center justify-center rounded-[18px] border border-iron-line bg-iron-2/90 text-[15px] font-bold text-dough-dim backdrop-blur"
                        >
                            메뉴를 선택해 담아보세요
                        </motion.button>
                    )}
                </AnimatePresence>
            </BottomBar>

            <AnimatePresence>
                {openMenu && (
                    <MenuDetail
                        key={openMenu.id}
                        menu={openMenu}
                        onClose={() => setOpenMenuId(null)}
                        onAdded={() => {
                            const source =
                                document.querySelector("[data-fly-source]");
                            if (source) {
                                setFlight({
                                    key: Date.now(),
                                    imageUrl: menuImageUrl(
                                        openMenu.id,
                                        openMenu.imageUrl,
                                    ),
                                    from: source.getBoundingClientRect(),
                                });
                            }
                            // 지원하는 폰(안드로이드)에서는 짧게 톡 — 담겼다는 손끝 신호
                            try {
                                navigator.vibrate?.(25);
                            } catch {
                                // 진동을 못 써도 화면 연출은 그대로다.
                            }
                        }}
                    />
                )}
            </AnimatePresence>

            {flight && (
                <CartFlight
                    key={flight.key}
                    flight={flight}
                    onDone={() => setFlight(null)}
                />
            )}
        </>
    );
}

// 판정: 로딩 → 스켈레톤 / 실패 → 다시 시도 / 판매 가능 0개 → 안내(+ 품절 메뉴는 목록에 둠) / 검색 0건 → "검색 결과가 없습니다".
function MenuList(props: {
    status: "loading" | "ready" | "error";
    items: MenuItemDto[];
    category: MenuCategoryId;
    query: string;
    onRetry: () => void;
    onSelect: (menuId: string) => void;
}) {
    if (props.status === "loading") return <MenuSkeleton />;
    if (props.status === "error")
        return (
            <ErrorRetry
                message="메뉴를 불러오지 못했어요."
                onRetry={props.onRetry}
            />
        );

    const visible = filterMenuItems(
        props.items.filter((item) => inCategory(item, props.category)),
        props.query,
    );
    const noneOrderable = props.items.every(
        (item) => !item.isAvailable || item.isSoldOut,
    );
    return (
        <>
            {noneOrderable && (
                <EmptyState title="현재 주문 가능한 메뉴가 없습니다" />
            )}
            {props.items.length > 0 && visible.length === 0 && (
                <EmptyState title="검색 결과가 없습니다" mascot="search" />
            )}
            {visible.length > 0 && (
                <ul className="flex flex-col gap-3">
                    {visible.map((item, index) => (
                        // 탭·검색으로 목록이 바뀌면 남는 카드가 제자리로 미끄러진다(layout).
                        // 처음 화면에 들어올 때는 스크롤에 맞춰 차례로 떠오른다.
                        <motion.li
                            key={item.id}
                            layout
                            initial={{ opacity: 0, y: 28 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-20px" }}
                            transition={{
                                type: "spring",
                                stiffness: 300,
                                damping: 28,
                                delay: Math.min(index, 4) * 0.04,
                            }}
                        >
                            <MenuCard
                                name={item.name}
                                description={item.description}
                                price={item.price}
                                imageUrl={menuImageUrl(item.id, item.imageUrl)}
                                soldOut={!item.isAvailable || item.isSoldOut}
                                onSelect={() => props.onSelect(item.id)}
                                layoutId={imageLayoutId(item.id)}
                            />
                        </motion.li>
                    ))}
                </ul>
            )}
        </>
    );
}

function MenuDetail({
    menu,
    onClose,
    onAdded,
}: {
    menu: MenuItemDto;
    onClose: () => void;
    onAdded: () => void;
}) {
    const cartItems = useCart((state) => state.items);
    const addItem = useCart((state) => state.addItem);
    const selection = useMenuSelection(menu, cartItems);

    return (
        <MenuDetailSheet
            name={menu.name}
            description={menu.description}
            price={menu.price}
            imageUrl={menuImageUrl(menu.id, menu.imageUrl)}
            imageLayoutId={imageLayoutId(menu.id)}
            groups={menu.optionGroups.map((group) => ({
                ...group,
                hint: selectionHint(group),
            }))}
            selectedIds={selection.selectedIds}
            onToggleOption={selection.toggle}
            quantity={selection.quantity}
            maxQuantity={selection.maxQuantity}
            onQuantityChange={selection.setQuantity}
            total={selection.total}
            canAdd={selection.canAdd}
            message={selection.message}
            onAdd={() => {
                if (addItem(selection.cartInput())) {
                    onAdded();
                    onClose();
                }
            }}
            onClose={onClose}
        />
    );
}


// fly-to-cart: 시트 사진 자리에서 화면에 보이는 장바구니 버튼까지 높은 포물선으로 날아가며 빙글 돌고 작아진다.
// 뒤로 잔상 세 개가 꼬리처럼 따라오고, 닿는 순간 장바구니에서 불티가 튀고 고리가 퍼지며 버튼이 출렁인다.
function CartFlight({ flight, onDone }: { flight: Flight; onDone: () => void }) {
    const [path, setPath] = useState<{ dx: number; dy: number; tx: number; ty: number } | null>(null);
    const [landed, setLanded] = useState(false);
    useLayoutEffect(() => {
        const target = cartTargetRect();
        const from = flight.from;
        if (!target) {
            onDone();
            return;
        }
        // 날아갈 경로는 화면이 그려진 직후의 실제 위치로만 정할 수 있다.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPath({
            dx: target.left + target.width / 2 - (from.left + from.width / 2),
            dy: target.top + target.height / 2 - (from.top + from.height / 2),
            tx: target.left + target.width / 2,
            ty: target.top + target.height / 2,
        });
    }, [flight, onDone]);
    if (!path) return null;
    const size = flight.from.width;
    const peak = Math.min(path.dy * 0.15, 0) - 140; // 포물선 꼭대기(출발점보다 위)
    const keyframes = {
        x: [0, path.dx * 0.4, path.dx],
        y: [0, peak, path.dy],
        scale: [1, 0.62, 36 / size],
        rotate: [0, 200, 400],
    };
    const image = flight.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- 장식용 사본
        <img src={flight.imageUrl} alt="" className="size-full object-cover" />
    ) : (
        <span className="block size-full bg-syrup" />
    );
    return (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-50">
            {/* 잔상 꼬리 */}
            {[3, 2, 1].map((lag) => (
                <motion.div
                    key={lag}
                    className="absolute overflow-hidden rounded-full"
                    style={{ left: flight.from.left, top: flight.from.top, width: size, height: size, opacity: 0.12 + (3 - lag) * 0.1, filter: "blur(2px)" }}
                    initial={{ x: 0, y: 0, scale: 1 }}
                    animate={keyframes}
                    transition={{ duration: 0.8, delay: lag * 0.05, times: [0, 0.45, 1], ease: ["easeOut", "easeIn"] }}
                >
                    {image}
                </motion.div>
            ))}
            {!landed && (
                <motion.div
                    className="absolute overflow-hidden rounded-full shadow-[0_0_34px_rgba(255,181,71,0.75)] ring-2 ring-syrup/70"
                    style={{ left: flight.from.left, top: flight.from.top, width: size, height: size }}
                    initial={{ x: 0, y: 0, scale: 1, rotate: 0 }}
                    animate={keyframes}
                    transition={{ duration: 0.8, times: [0, 0.45, 1], ease: ["easeOut", "easeIn"] }}
                    onAnimationComplete={() => {
                        bumpCart();
                        setLanded(true);
                        setTimeout(onDone, 650);
                    }}
                >
                    {image}
                </motion.div>
            )}
            {/* 착지: 장바구니 자리에서 퍼지는 고리 + 불티 */}
            {landed && (
                <span className="absolute" style={{ left: path.tx, top: path.ty }}>
                    <motion.span
                        className="absolute -top-6 -left-6 size-12 rounded-full border-2 border-syrup"
                        initial={{ scale: 0.3, opacity: 1 }}
                        animate={{ scale: 2.2, opacity: 0 }}
                        transition={{ duration: 0.55, ease: "easeOut" }}
                    />
                    {Array.from({ length: 10 }, (_, index) => {
                        const angle = (index / 10) * Math.PI * 2;
                        return (
                            <motion.span
                                key={index}
                                className="absolute size-1.5 rounded-full bg-[#fff3c9] shadow-[0_0_6px_#ffb547]"
                                initial={{ x: 0, y: 0, opacity: 1 }}
                                animate={{ x: Math.cos(angle) * 38, y: Math.sin(angle) * 38 - 10, opacity: 0, scale: 0.4 }}
                                transition={{ duration: 0.55, ease: "easeOut" }}
                            />
                        );
                    })}
                </span>
            )}
        </div>
    );
}
