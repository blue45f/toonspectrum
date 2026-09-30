// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProcessCompareViewer } from "./ProcessCompareViewer";
import { buildProcessCompareItems } from "./process-compare-model";

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({
  useBilingual: () => (ko: string) => ko,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const PROCESSES = [
  {
    id: "p-storyboard",
    label: "콘티",
    kind: "image" as const,
    revisions: [
      { id: "r1", createdAt: "2026-09-20T00:00:00Z" },
      { id: "r2", createdAt: "2026-09-21T00:00:00Z" },
    ],
  },
  {
    id: "p-line",
    label: "선화",
    kind: "image" as const,
    revisions: [{ id: "r3", createdAt: "2026-09-22T00:00:00Z" }],
  },
  {
    id: "p-color",
    label: "채색",
    kind: "image" as const,
    revisions: [{ id: "r4", createdAt: "2026-09-23T00:00:00Z" }],
  },
];

function renderViewer() {
  const items = buildProcessCompareItems(PROCESSES, () => null);
  render(<ProcessCompareViewer items={items} />);
  return items;
}

describe("ProcessCompareViewer", () => {
  it("기본 2개 페인을 렌더한다", () => {
    renderViewer();
    expect(screen.getByTestId("pcv-root")).toBeTruthy();
    expect(screen.getByTestId("pcv-viewport-1")).toBeTruthy();
    expect(screen.getByTestId("pcv-viewport-2")).toBeTruthy();
  });

  it("항목이 2개 미만이면 안내 메시지를 보여준다", () => {
    const items = buildProcessCompareItems([PROCESSES[1]], () => null);
    expect(items).toHaveLength(1);
    render(<ProcessCompareViewer items={items} />);
    expect(screen.getByText("비교할 공정 결과물이 2개 이상 필요합니다")).toBeTruthy();
  });

  it("항목이 2개 미만이면 일러스트·다음 행동 가이드를 보여준다", () => {
    const items = buildProcessCompareItems([PROCESSES[1]], () => null);
    const { container } = render(<ProcessCompareViewer items={items} onClose={() => {}} />);
    expect(container.querySelector(".pcv-empty-art")).toBeTruthy();
    expect(screen.getByText(/결과물\(리비전\)을 2개 이상 등록/)).toBeTruthy();
    // 핵심 액션 1개: 닫기
    expect(screen.getByRole("button", { name: "닫기" })).toBeTruthy();
  });

  it("빈 페인에는 위쪽 피커를 가리키는 일러스트를 보여준다", () => {
    const items = buildProcessCompareItems(PROCESSES, () => null);
    const { container, rerender } = render(<ProcessCompareViewer items={items} />);
    // 페인이 바라보던 공정이 사라지면 해당 페인은 빈 상태가 된다
    const fewer = buildProcessCompareItems([PROCESSES[0]], () => null);
    rerender(<ProcessCompareViewer items={fewer} />);
    expect(container.querySelectorAll(".pcv-empty-art-sm")).toHaveLength(2);
    expect(screen.getAllByText("위에서 공정과 버전을 선택하세요")).toHaveLength(2);
  });

  it("페인 개수를 3·4로 바꿀 수 있다", () => {
    renderViewer();
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    expect(screen.getByTestId("pcv-viewport-3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "4" }));
    // 항목은 3개 공정뿐이라 3개 페인까지만 채워진다
    expect(screen.queryByTestId("pcv-viewport-4")).not.toBeTruthy();
  });

  it("비교 방식을 슬라이더로 전환한다", () => {
    renderViewer();
    fireEvent.click(screen.getByRole("button", { name: "비포·애프터" }));
    expect(screen.getByTestId("pcv-slider-stage")).toBeTruthy();
    expect(screen.getByTestId("pcv-slider-handle")).toBeTruthy();
    expect(screen.getByTestId("pcv-hint").textContent ?? "").toContain("가운데 핸들을 잡고 드래그하세요");
  });

  it("슬라이더 핸들은 키보드로 조작할 수 있다", () => {
    renderViewer();
    fireEvent.click(screen.getByRole("button", { name: "비포·애프터" }));
    const handle = screen.getByTestId("pcv-slider-handle");
    expect(handle.getAttribute("role")).toBe("slider");
    expect(handle.getAttribute("aria-valuenow")).toBe("50");
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(handle.getAttribute("aria-valuenow")).toBe("52");
    fireEvent.keyDown(handle, { key: "ArrowLeft", shiftKey: true });
    expect(handle.getAttribute("aria-valuenow")).toBe("42");
    fireEvent.keyDown(handle, { key: "Home" });
    expect(handle.getAttribute("aria-valuenow")).toBe("0");
    fireEvent.keyDown(handle, { key: "End" });
    expect(handle.getAttribute("aria-valuenow")).toBe("100");
  });

  it("비교 방식을 깜빡임으로 전환한다", () => {
    renderViewer();
    fireEvent.click(screen.getByRole("button", { name: "깜빡임 비교" }));
    expect(screen.getByTestId("pcv-blink-stage")).toBeTruthy();
    expect(screen.getByTestId("pcv-blink-a")).toBeTruthy();
    expect(screen.getByTestId("pcv-blink-b")).toBeTruthy();
  });

  it("동기 스크롤 토글 버튼이 있다", () => {
    renderViewer();
    const toggle = screen.getByRole("button", { name: "동기 스크롤" });
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });

  it("줌 컨트롤이 동작한다", () => {
    renderViewer();
    const zoomVal = screen.getByTestId("pcv-zoomval");
    expect(zoomVal.textContent).toBe("100%");
    fireEvent.click(screen.getByRole("button", { name: "확대" }));
    expect(zoomVal.textContent).toBe("125%");
    fireEvent.click(screen.getByRole("button", { name: "축소" }));
    fireEvent.click(screen.getByRole("button", { name: "축소" }));
    expect(zoomVal.textContent).toBe("75%");
  });

  it("페인별 공정·버전을 선택할 수 있다", () => {
    renderViewer();
    const pickers = screen.getAllByLabelText("이 페인에 표시할 공정과 버전 선택");
    expect(pickers).toHaveLength(2);
    // 첫 페인을 콘티 v1으로 변경
    fireEvent.change(pickers[0], { target: { value: "p-storyboard::r1" } });
    expect(screen.getAllByText("콘티 · v1").length).toBeGreaterThan(0);
  });

  it("이미지가 없으면 플레이스홀더 아트를 사용한다", () => {
    renderViewer();
    const images = screen.getAllByRole("img");
    expect(images.length).toBeGreaterThan(0);
    for (const img of images) {
      expect(img.getAttribute("src") ?? "").toContain("data:image/svg+xml,");
    }
  });

  it("비교 방식을 바꾸면 live region에 안내한다", () => {
    renderViewer();
    const live = screen.getByTestId("pcv-live");
    expect(live.textContent).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "비포·애프터" }));
    expect(live.textContent).toBe("비포·애프터");
    fireEvent.click(screen.getByRole("button", { name: "깜빡임 비교" }));
    expect(live.textContent).toBe("깜빡임 비교");
  });

  it("슬라이더 드래그 중에는 핸들에 data-dragging이 표시된다", () => {
    renderViewer();
    fireEvent.click(screen.getByRole("button", { name: "비포·애프터" }));
    const stage = screen.getByTestId("pcv-slider-stage");
    const handle = screen.getByTestId("pcv-slider-handle");
    expect(handle.getAttribute("data-dragging")).toBe("false");
    fireEvent.pointerDown(stage, { clientX: 100, pointerId: 1 });
    expect(handle.getAttribute("data-dragging")).toBe("true");
    fireEvent.pointerUp(stage);
    expect(handle.getAttribute("data-dragging")).toBe("false");
  });

  it("깜빡임 모드에서 수동 전환 버튼이 있다", () => {
    renderViewer();
    fireEvent.click(screen.getByRole("button", { name: "깜빡임 비교" }));
    expect(screen.getByRole("button", { name: "수동 전환" })).toBeTruthy();
    expect(screen.getByLabelText("깜빡임 주기")).toBeTruthy();
  });

  it("깜빡임 주기 설정은 고급 설정으로 접혀 있다", () => {
    renderViewer();
    fireEvent.click(screen.getByRole("button", { name: "깜빡임 비교" }));
    const details = screen.getByText("고급 설정").closest("details");
    expect(details).toBeTruthy();
    expect(details?.hasAttribute("open")).toBe(false);
    // 접힌 상태에서도 설정값은 유지된다
    expect(screen.getByLabelText("깜빡임 주기")).toBeTruthy();
  });
});
