// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  InlineHelp,
  PresenceAvatarStack,
  ProductionGuideEmptyState,
  ProductionSpotlightTour,
  ProductionWizard,
} from "./ProductionUxKit";
import { PRODUCTION_HUB_TOUR_STEPS, PRODUCTION_TOUR_STORAGE_KEY } from "./production-ux-kit/production-ux-kit-model";

afterEach(() => cleanup());

const STEPS = [
  { id: "pick", title: "제출본 선택", description: "검수할 제출본을 고릅니다." },
  { id: "options", title: "링크 설정", description: "만료와 권한을 정합니다." },
  { id: "share", title: "공유", description: "링크를 복사해 전달합니다." },
];

describe("ProductionWizard", () => {
  it("3단계 진행 표시와 현재 단계 내용을 보여준다", () => {
    const onIndexChange = vi.fn();
    render(
      <ProductionWizard steps={STEPS} currentIndex={0} onIndexChange={onIndexChange} onComplete={vi.fn()}>
        {(index) => <p>단계 {index + 1} 본문</p>}
      </ProductionWizard>,
    );
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("33");
    expect(screen.getByRole("heading", { name: "제출본 선택" })).toBeTruthy();
    expect(screen.getByText("단계 1 본문")).toBeTruthy();
    // 다음 버튼으로 이동
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  it("마지막 단계에서는 완료 버튼을 보여준다", () => {
    const onComplete = vi.fn();
    render(
      <ProductionWizard steps={STEPS} currentIndex={2} onIndexChange={vi.fn()} onComplete={onComplete}>
        {() => null}
      </ProductionWizard>,
    );
    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    expect(onComplete).toHaveBeenCalled();
  });

  it("완료된 단계 버튼에 체크 상태가 표시된다", () => {
    render(
      <ProductionWizard steps={STEPS} currentIndex={1} onIndexChange={vi.fn()} onComplete={vi.fn()}>
        {() => null}
      </ProductionWizard>,
    );
    expect(screen.getByRole("button", { name: /1단계.*완료/ })).toBeTruthy();
  });
});

describe("ProductionSpotlightTour", () => {
  it("보지 않은 사용자에게 3단계 투어를 보여주고 건너뛸 수 있다", () => {
    const storage = { getItem: () => null, setItem: vi.fn() };
    render(<ProductionSpotlightTour storage={storage} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(PRODUCTION_HUB_TOUR_STEPS[0]!.title)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "투어 건너뛰기" }));
    expect(storage.setItem).toHaveBeenCalledWith(PRODUCTION_TOUR_STORAGE_KEY, "seen");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("이미 본 사용자에게는 투어를 보여주지 않는다", () => {
    const storage = { getItem: () => "seen", setItem: vi.fn() };
    render(<ProductionSpotlightTour storage={storage} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("다음 버튼으로 3단계를 순회한다", () => {
    const storage = { getItem: () => null, setItem: vi.fn() };
    render(<ProductionSpotlightTour storage={storage} />);
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    expect(screen.getByText(PRODUCTION_HUB_TOUR_STEPS[1]!.title)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    expect(screen.getByText(PRODUCTION_HUB_TOUR_STEPS[2]!.title)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /시작하기/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("PresenceAvatarStack", () => {
  it("멤버가 없으면 렌더링하지 않는다", () => {
    const { container } = render(<PresenceAvatarStack members={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("활성 멤버를 먼저 보여주고 넘침 개수를 표시한다", () => {
    render(
      <PresenceAvatarStack
        max={2}
        members={[
          { id: "a", name: "김작가", roleLabel: "편집자", active: false },
          { id: "b", name: "이검수", roleLabel: "검수자", active: true },
          { id: "c", name: "박뷰어", roleLabel: "뷰어", active: false },
        ]}
      />,
    );
    expect(screen.getByLabelText(/이검수.*지금 보고 있음/)).toBeTruthy();
    expect(screen.getByLabelText("그 외 1명")).toBeTruthy();
  });
});

describe("ProductionGuideEmptyState", () => {
  it("가이드 문구와 원클릭 시작 버튼을 보여준다", () => {
    const onAction = vi.fn();
    render(<ProductionGuideEmptyState guideId="review-empty" onAction={onAction} />);
    expect(screen.getByText("활성 외부 검수 링크가 없습니다")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "외부 검수 링크 만들기" }));
    expect(onAction).toHaveBeenCalled();
  });
});

describe("InlineHelp", () => {
  it("도움말 버튼을 누르면 설명이 펼쳐진다", () => {
    render(<InlineHelp label="WIP 한도">동시에 진행할 수 있는 작업 수입니다.</InlineHelp>);
    expect(screen.queryByRole("note")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /도움말/ }));
    const note = screen.getByRole("note");
    expect(note.textContent).toContain("동시에 진행할 수 있는 작업 수입니다.");
    expect(screen.getByRole("button", { name: /도움말/ }).getAttribute("aria-expanded")).toBe("true");
  });
});
