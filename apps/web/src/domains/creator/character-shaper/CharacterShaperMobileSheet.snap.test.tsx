/** @vitest-environment jsdom */

/**
 * 모바일 시트의 스냅 상태 표시와 안전영역 계약을 고정한다.
 * 기존 `CharacterShaperMobileSheet.test.tsx`가 역할·ARIA 슬라이더 계약을,
 * 이 파일은 새로 생긴 시각 상태 표시만 담당한다.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CharacterShaperMobileSheet } from "./CharacterShaperMobileSheet";

import type { CharacterShaperMobileSheetProps } from "./character-shaper-ui-contract";

afterEach(cleanup);

function renderSheet(state: CharacterShaperMobileSheetProps["state"]): void {
  render(
    <CharacterShaperMobileSheet
      state={state}
      onStateChange={vi.fn()}
      title="프리셋"
      header={null}
    >
      <p>내용</p>
    </CharacterShaperMobileSheet>,
  );
}

describe("모바일 시트 스냅 상태 표시", () => {
  it.each([
    ["collapsed", 1],
    ["half", 2],
    ["full", 3],
  ] as const)("%s 상태에서 켜진 눈금 개수가 %d개다", (state, litCount) => {
    renderSheet(state);
    const snaps = document.querySelectorAll("[data-character-shaper-sheet-snap]");
    expect(snaps).toHaveLength(3);
    expect(document.querySelectorAll('[data-character-shaper-sheet-snap="on"]')).toHaveLength(litCount);
  });

  it("스냅 눈금은 장식이라 스크린리더에 중복 노출하지 않는다", () => {
    renderSheet("half");
    expect(document.querySelector('[data-character-shaper-sheet-snaps="true"]')?.closest("[aria-hidden]"))
      .not.toBeNull();
  });

  it("그래버 슬라이더의 aria-valuenow가 스냅 표시와 같은 단계다", () => {
    renderSheet("full");
    const slider = screen.getByRole("slider");
    expect(slider.getAttribute("aria-valuenow")).toBe("2");
    expect(document.querySelectorAll('[data-character-shaper-sheet-snap="on"]')).toHaveLength(3);
  });

  it("펼치기/접기 토글은 글자 수와 무관하게 고정 폭이라 헤더가 흔들리지 않는다", () => {
    renderSheet("collapsed");
    const toggle = screen.getByRole("button", { name: "펼치기" });
    expect(toggle.className).toContain("w-16");
    expect(toggle.className).toContain("shrink-0");
  });

  it("안전영역 스페이콘텐츠를 렌더해 홈 인디케이터 여백을 확보한다", () => {
    renderSheet("half");
    const spacer = document.querySelector('[data-character-shaper-sheet-safe-area="true"]');
    expect(spacer).not.toBeNull();
    expect(spacer?.getAttribute("aria-hidden")).toBe("true");
  });
});
