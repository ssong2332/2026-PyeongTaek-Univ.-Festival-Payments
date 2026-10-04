"use client";

import Link from "next/link";
import { useState } from "react";
import { MenuCard } from "@/components/customer/MenuCard";
import { MenuDetailSheet } from "@/components/customer/MenuDetailSheet";
import { MenuSkeleton } from "@/components/customer/MenuSkeleton";
import { MyOrderLinks } from "@/components/customer/MyOrderLinks";
import { QueueCount } from "@/components/customer/QueueCount";
import { SearchBox } from "@/components/customer/SearchBox";
import { BottomBar } from "@/components/ui/BottomBar";
import { CTA_ENABLED } from "@/components/ui/cta";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorRetry } from "@/components/ui/ErrorRetry";
import { HotteokMascot } from "@/components/ui/HotteokMascot";
import { CartIcon } from "@/components/ui/icons";
import { filterMenuItems } from "@/features/customer/menuSearch";
import { selectionHint } from "@/features/customer/messages";
import { useMyOrders } from "@/features/customer/myOrders";
import { selectCartCount, selectCartTotal, useCart, useCartHydrated } from "@/features/customer/useCart";
import { useMenu } from "@/features/customer/useMenu";
import { useMenuSelection } from "@/features/customer/useMenuSelection";
import type { MenuItemDto } from "@/lib/dto/menu";
import { formatWon } from "@/lib/format";

// 고객 메뉴판(/) — PRD 화면 표 "고객 · 메뉴판", Architecture 8절.
export default function MenuPage() {
    const menu = useMenu();
    const hydrated = useCartHydrated();
    const count = useCart(selectCartCount);
    const total = useCart(selectCartTotal);
    const myOrders = useMyOrders();
    const [query, setQuery] = useState("");
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);

    const cartCount = hydrated ? count : 0;
    const openMenu = menu.items.find((item) => item.id === openMenuId) ?? null;

    return (
        <>
            <header className="relative overflow-hidden rounded-b-[28px] bg-linear-to-br from-brand-deep to-brand-amber px-4 pt-5 pb-16 text-white shadow-[0_16px_40px_rgba(103,55,35,0.16)]">
                {/* 장식: 옅은 원 2개 + 호떡 사진(Codex 생성) + 손 흔드는 마스코트. 글씨는 왼쪽 어두운 쪽에 둔다. */}
                <span aria-hidden="true" className="absolute -top-20 -right-24 size-52 rounded-full bg-white/8" />
                <span aria-hidden="true" className="absolute -bottom-14 -left-12 size-24 rounded-full bg-white/7" />
                {/* eslint-disable-next-line @next/next/no-img-element -- 고정 장식 이미지(480×320 WebP) */}
                <img
                    src="/images/hotteok-hero.webp"
                    alt=""
                    aria-hidden="true"
                    width={480}
                    height={320}
                    className="pointer-events-none absolute right-1 bottom-7 w-40 drop-shadow-[0_18px_24px_rgba(69,26,3,0.34)] select-none motion-safe:animate-sway"
                />
                <HotteokMascot variant="wave" size={44} motion="bob" className="absolute right-38 bottom-8" />
                <div className="relative flex items-start justify-between gap-3">
                    <div className="pr-2">
                        <p className="inline-flex rounded-full border border-white/30 bg-white/15 px-3 py-1 text-xs font-bold">2026 평택대학교 대동제</p>
                        <h1 className="mt-3 text-3xl font-black tracking-tight">호떡 부스</h1>
                        <p className="mt-1 text-sm font-semibold">바삭하게 구워낸 따끈한 호떡</p>
                    </div>
                    <Link
                        href="/cart"
                        aria-label={`장바구니 ${cartCount}개`}
                        className="relative flex size-12 items-center justify-center rounded-2xl bg-white text-brand-deep shadow-[0_8px_20px_rgba(69,26,3,0.22)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    >
                        <CartIcon className="size-6" />
                        {cartCount > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 flex min-w-5 items-center justify-center rounded-full bg-orange-700 px-1 text-xs font-bold text-white">
                                {cartCount}
                            </span>
                        )}
                    </Link>
                </div>
            </header>

            {/* relative: 헤더(relative)보다 위에 그려져 검색창이 헤더 아래쪽을 덮는다 */}
            <div className="relative -mt-6 flex flex-col gap-4 px-4">
                <SearchBox value={query} onChange={setQuery} />
                <QueueCount waitingCount={menu.waitingCount} />
                <MyOrderLinks orders={myOrders} />
                <section aria-labelledby="menu-list-title" className="flex flex-col gap-3">
                    <h2 id="menu-list-title" className="flex items-center gap-2 pt-2 text-lg font-extrabold text-brand-deep">
                        전체 메뉴
                        <HotteokMascot variant="heart" size={28} />
                    </h2>
                    <MenuList status={menu.status} items={menu.items} query={query} onRetry={menu.reload} onSelect={setOpenMenuId} />
                </section>
            </div>

            <BottomBar>
                {cartCount > 0 ? (
                    <Link href="/cart" aria-label={`장바구니 보기 (${cartCount}개, ${formatWon(total)})`} className={CTA_ENABLED}>
                        <span className="flex size-7 items-center justify-center rounded-full bg-white/25 text-sm">{cartCount}</span>
                        <span className="flex-1 text-center">장바구니 보기</span>
                        <span>{formatWon(total)}</span>
                    </Link>
                ) : (
                    <button
                        type="button"
                        disabled
                        className="flex h-13 w-full items-center justify-center rounded-2xl border border-line bg-stone-100 text-base font-bold text-stone-400"
                    >
                        메뉴를 선택해 담아보세요
                    </button>
                )}
            </BottomBar>

            {openMenu && <MenuDetail key={openMenu.id} menu={openMenu} onClose={() => setOpenMenuId(null)} />}
        </>
    );
}

// 판정: 로딩 → 스켈레톤 / 실패 → 다시 시도 / 판매 가능 0개 → 안내(+ 품절 메뉴는 목록에 둠) / 검색 0건 → "검색 결과가 없습니다".
function MenuList(props: {
    status: "loading" | "ready" | "error";
    items: MenuItemDto[];
    query: string;
    onRetry: () => void;
    onSelect: (menuId: string) => void;
}) {
    if (props.status === "loading") return <MenuSkeleton />;
    if (props.status === "error") return <ErrorRetry message="메뉴를 불러오지 못했어요." onRetry={props.onRetry} />;

    const visible = filterMenuItems(props.items, props.query);
    const noneOrderable = props.items.every((item) => !item.isAvailable || item.isSoldOut);
    return (
        <>
            {noneOrderable && <EmptyState title="현재 주문 가능한 메뉴가 없습니다" />}
            {props.items.length > 0 && visible.length === 0 && <EmptyState title="검색 결과가 없습니다" />}
            {visible.length > 0 && (
                <ul className="flex flex-col gap-3">
                    {visible.map((item) => (
                        <li key={item.id}>
                            <MenuCard
                                name={item.name}
                                description={item.description}
                                price={item.price}
                                imageUrl={item.imageUrl}
                                soldOut={!item.isAvailable || item.isSoldOut}
                                onSelect={() => props.onSelect(item.id)}
                            />
                        </li>
                    ))}
                </ul>
            )}
        </>
    );
}

function MenuDetail({ menu, onClose }: { menu: MenuItemDto; onClose: () => void }) {
    const cartItems = useCart((state) => state.items);
    const addItem = useCart((state) => state.addItem);
    const selection = useMenuSelection(menu, cartItems);

    return (
        <MenuDetailSheet
            name={menu.name}
            description={menu.description}
            price={menu.price}
            imageUrl={menu.imageUrl}
            groups={menu.optionGroups.map((group) => ({ ...group, hint: selectionHint(group) }))}
            selectedIds={selection.selectedIds}
            onToggleOption={selection.toggle}
            quantity={selection.quantity}
            maxQuantity={selection.maxQuantity}
            onQuantityChange={selection.setQuantity}
            total={selection.total}
            canAdd={selection.canAdd}
            message={selection.message}
            onAdd={() => {
                if (addItem(selection.cartInput())) onClose();
            }}
            onClose={onClose}
        />
    );
}
