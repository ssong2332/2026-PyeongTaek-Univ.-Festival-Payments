// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MenuCard } from "@/components/customer/MenuCard";
import { MenuSkeleton } from "@/components/customer/MenuSkeleton";
import { QueueCount } from "@/components/customer/QueueCount";
import { SearchBox } from "@/components/customer/SearchBox";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorRetry } from "@/components/ui/ErrorRetry";

afterEach(cleanup);

describe("MenuCard", () => {
    const base = { name: "치즈 호떡", description: "모짜렐라 치즈가 쭉", price: 2500, imageUrl: null, soldOut: false };

    it("이름·설명·가격을 보이고, 누르면 onSelect", () => {
        const onSelect = vi.fn();
        render(<MenuCard {...base} onSelect={onSelect} />);
        const card = screen.getByRole("button", { name: /치즈 호떡/ });
        expect(card.textContent).toContain("모짜렐라 치즈가 쭉");
        expect(card.textContent).toContain("2,500원");
        fireEvent.click(card);
        expect(onSelect).toHaveBeenCalledTimes(1);
    });

    it("F-01·F-25: 품절이면 '품절' 라벨과 함께 선택 불가", () => {
        const onSelect = vi.fn();
        render(<MenuCard {...base} soldOut onSelect={onSelect} />);
        const card = screen.getByRole("button", { name: /치즈 호떡/ });
        expect(card.textContent).toContain("품절");
        expect((card as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(card);
        expect(onSelect).not.toHaveBeenCalled();
    });

    it("설명이 없어도 그린다, 판매 중이면 '품절' 라벨 없음", () => {
        render(<MenuCard {...base} description={null} onSelect={() => {}} />);
        const card = screen.getByRole("button", { name: /치즈 호떡/ });
        expect(card.textContent).not.toContain("품절");
        expect((card as HTMLButtonElement).disabled).toBe(false);
    });

    it("이미지가 있으면 장식용(alt=\"\" — 이름은 옆 글자로 읽힘), 없으면 메뉴 이미지 대신 마스코트 자리표시(장식)", () => {
        const { container, rerender } = render(<MenuCard {...base} imageUrl="https://example.com/a.jpg" onSelect={() => {}} />);
        const image = container.querySelector("img");
        expect(image?.getAttribute("src")).toBe("https://example.com/a.jpg");
        expect(image?.getAttribute("alt")).toBe("");
        rerender(<MenuCard {...base} onSelect={() => {}} />);
        // 사진이 없으면 사진 대신 호떡이 스티커(장식)를 그린다.
        const images = container.querySelectorAll("img");
        expect(images).toHaveLength(1);
        expect(images[0].getAttribute("src")).toBe("/mascot/hotteoki/hello.webp");
        expect(images[0].getAttribute("alt")).toBe("");
        expect(images[0].closest("[aria-hidden='true']")).not.toBeNull();
    });
});

describe("QueueCount — 현재 처리 중인 주문 (F-11)", () => {
    it("대기 3건", () => {
        render(<QueueCount waitingCount={3} />);
        expect(screen.getByText("현재 처리 중인 주문")).toBeTruthy();
        expect(screen.getByText("3건이 처리 중입니다")).toBeTruthy();
    });

    it("경계: 0건이면 '대기 없음'", () => {
        render(<QueueCount waitingCount={0} />);
        expect(screen.getByText("대기 없음")).toBeTruthy();
    });

    it("아직 모르면(null) '확인 중', 큰 숫자 자리는 비운다", () => {
        render(<QueueCount waitingCount={null} />);
        expect(screen.getByText("확인 중")).toBeTruthy();
        expect(screen.getByRole("region", { name: "현재 처리 중인 주문" }).textContent).toBe("현재 처리 중인 주문확인 중");
    });

    it("큰 숫자는 대기 건수 그대로", () => {
        render(<QueueCount waitingCount={12} />);
        expect(screen.getByRole("region", { name: "현재 처리 중인 주문" }).textContent).toBe("현재 처리 중인 주문12건이 처리 중입니다12");
    });
});

describe("SearchBox — 메뉴 검색", () => {
    it("입력하면 onChange, 라벨로 찾을 수 있다", () => {
        const onChange = vi.fn();
        render(<SearchBox value="" onChange={onChange} />);
        fireEvent.change(screen.getByLabelText("메뉴 검색"), { target: { value: "치즈" } });
        expect(onChange).toHaveBeenCalledWith("치즈");
    });

    it("값이 있을 때만 지우기 버튼이 있고, 누르면 빈 값", () => {
        const onChange = vi.fn();
        const { rerender } = render(<SearchBox value="" onChange={onChange} />);
        expect(screen.queryByRole("button", { name: "검색어 지우기" })).toBeNull();
        rerender(<SearchBox value="치즈" onChange={onChange} />);
        fireEvent.click(screen.getByRole("button", { name: "검색어 지우기" }));
        expect(onChange).toHaveBeenCalledWith("");
    });
});

describe("MenuSkeleton / EmptyState / ErrorRetry", () => {
    it("스켈레톤은 불러오는 중임을 알린다", () => {
        render(<MenuSkeleton />);
        expect(screen.getByRole("status").textContent).toContain("메뉴를 불러오는 중");
    });

    it("빈 상태는 제목과 추가 내용을 보인다", () => {
        render(<EmptyState title="장바구니가 비어 있습니다"><button type="button">메뉴판으로</button></EmptyState>);
        expect(screen.getByText("장바구니가 비어 있습니다")).toBeTruthy();
        expect(screen.getByRole("button", { name: "메뉴판으로" })).toBeTruthy();
    });

    it("오류는 alert로 알리고 다시 시도 버튼이 onRetry를 부른다", () => {
        const onRetry = vi.fn();
        render(<ErrorRetry message="메뉴를 불러오지 못했어요." onRetry={onRetry} />);
        expect(screen.getByRole("alert").textContent).toContain("메뉴를 불러오지 못했어요.");
        fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });
});
