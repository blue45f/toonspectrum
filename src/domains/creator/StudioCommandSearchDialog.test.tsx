// @vitest-environment jsdom

/**
 * 통합 Command Search UI 계약.
 *
 * 검색 랭킹·별칭 커버리지는 `studio-command-search.test.ts` 가 잡는다. 여기서는
 * 그 결과가 화면에서 실제로 구획으로 나뉘어 나오고, 급증하지 않고, 도움말과
 * F1 진입점이 살아 있는지를 본다.
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_SEARCH_DEFAULT_SECTION_LIMIT,
  STUDIO_SEARCH_DEFAULT_TOTAL_LIMIT,
} from "./studio-command-search";
import { StudioCommandSearchDialog } from "./StudioCommandSearchDialog";
import { StudioCommandSearchHost } from "./StudioCommandSearchHost";

afterEach(cleanup);

function openDialog(
  overrides: Partial<
    Parameters<typeof StudioCommandSearchDialog>[0]
  > = {},
) {
  const onClose = vi.fn();
  render(
    <StudioCommandSearchDialog open onClose={onClose} {...overrides} />,
  );
  return { onClose };
}

function type(value: string) {
  const input = screen.getByRole("searchbox");
  fireEvent.change(input, { target: { value } });
  return input;
}

describe("StudioCommandSearchDialog", () => {
  it("모달 계약을 지킨다", () => {
    openDialog();
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByRole("searchbox")).toBeTruthy();
  });

  it("타사 용어로 검색하면 우리 기능과 '무엇으로 맞았는지'가 함께 나온다", () => {
    openDialog();
    type("Paint Bucket");
    expect(screen.getByText("채우기")).toBeTruthy();
    expect(screen.getByText(/Photoshop "Paint Bucket"/u)).toBeTruthy();
  });

  it("결과를 구획으로 나눠 보여준다", () => {
    openDialog();
    type("레이어");
    const headings = screen
      .getAllByRole("heading", { level: 3 })
      .map((node) => node.textContent);
    expect(headings.length).toBeGreaterThan(1);
    // 구획 제목은 선언된 순서를 따른다.
    expect(headings).toEqual([...headings].sort(
      (a, b) =>
        ["명령", "속성·보정", "패널·팔레트", "튜토리얼"].indexOf(a ?? "") -
        ["명령", "속성·보정", "패널·팔레트", "튜토리얼"].indexOf(b ?? ""),
    ));
  });

  it("넓은 질의에도 화면에 쏟아붓지 않고 잘린 수를 알린다", () => {
    openDialog();
    type("레이어");
    const rows = screen
      .getAllByRole("listitem")
      .filter((node) => within(node).queryAllByRole("button").length > 0);
    expect(rows.length).toBeLessThanOrEqual(STUDIO_SEARCH_DEFAULT_TOTAL_LIMIT);
    for (const list of screen.getAllByRole("list")) {
      expect(within(list).queryAllByRole("listitem").length).toBeLessThanOrEqual(
        STUDIO_SEARCH_DEFAULT_SECTION_LIMIT,
      );
    }
  });

  it("결과를 고르면 인스펙터 라우트로 이동하고 닫힌다", () => {
    const onNavigateInspector = vi.fn();
    const { onClose } = openDialog({ onNavigateInspector });
    type("레이어 마스크");
    fireEvent.click(screen.getByText("레이어 마스크"));
    expect(onNavigateInspector).toHaveBeenCalledWith({
      primary: "properties",
      image: "mask",
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("도움말 소비자가 있으면 결과마다 도움말 버튼이 붙는다", () => {
    const onOpenHelp = vi.fn();
    openDialog({ onOpenHelp });
    type("채우기");
    const helpButton = screen.getAllByRole("button", { name: /도움말$/u })[0];
    expect(helpButton).toBeTruthy();
    fireEvent.click(helpButton as HTMLElement);
    expect(onOpenHelp).toHaveBeenCalledWith(expect.stringMatching(/^help\//u));
  });

  it("빈 질의는 목록 대신 안내만 보여준다", () => {
    openDialog();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("Esc 로 닫는다", () => {
    const { onClose } = openDialog();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});

describe("StudioCommandSearchHost", () => {
  it("F1 이 통합 검색을 연다 (감사 §2.8 'F1 바인딩 없음' 해소)", async () => {
    render(<StudioCommandSearchHost />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(window, { key: "F1" });
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("입력 중에는 F1 을 가로채지 않는다", () => {
    render(
      <>
        <input data-testid="editing" />
        <StudioCommandSearchHost />
      </>,
    );
    const input = screen.getByTestId("editing");
    input.focus();
    fireEvent.keyDown(input, { key: "F1" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("트리거 버튼도 같은 검색을 연다", async () => {
    render(<StudioCommandSearchHost />);
    fireEvent.click(screen.getByTestId("studio-command-search-trigger"));
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("모바일에서는 트리거를 숨기고 F1 만 남긴다", () => {
    render(<StudioCommandSearchHost hideTrigger />);
    expect(screen.queryByTestId("studio-command-search-trigger")).toBeNull();
  });
});
