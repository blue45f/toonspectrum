// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioWebtoonPosePresetGrid } from "./StudioWebtoonPosePresetGrid";
import { ADVANCED_WEBTOON_POSES } from "./studio-3d-advanced-poses-library";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("StudioWebtoonPosePresetGrid (Shaper식 클릭 적용 UX)", () => {
  it(
    "기본적으로 전체 프리셋 카드를 보여준다",
    () => {
    render(<StudioWebtoonPosePresetGrid onApplyPreset={() => {}} />);
    expect(
      screen.getByRole("heading", { name: "웹툰 포즈 프리셋" }),
    ).toBeTruthy();
    for (const preset of ADVANCED_WEBTOON_POSES) {
      expect(
        screen.getByRole("button", { name: `${preset.name} 포즈 적용` }),
      ).toBeTruthy();
    }
    // 느린 CI/샌드박스에서 첫 렌더가 5초를 넘길 수 있어 타임아웃을 명시한다.
    },
    15000,
  );

  it("카드 클릭 한 번으로 포즈가 적용되고 최근 사용에 기록된다", () => {
    const onApplyPreset = vi.fn();
    render(<StudioWebtoonPosePresetGrid onApplyPreset={onApplyPreset} />);

    fireEvent.click(
      screen.getByRole("button", { name: "히어로 3점 착지 (Superhero Landing) 포즈 적용" }),
    );
    expect(onApplyPreset).toHaveBeenCalledTimes(1);
    expect(onApplyPreset).toHaveBeenCalledWith("action-hero-landing");

    expect(screen.getByRole("region", { name: "최근 사용한 포즈" })).toBeTruthy();
  });

  it("카테고리 필터로 그리드가 좁혀진다", () => {
    render(<StudioWebtoonPosePresetGrid onApplyPreset={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "액션" }));
    expect(
      screen.getByRole("button", { name: "히어로 3점 착지 (Superhero Landing) 포즈 적용" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "머그잔 마시기 (Coffee Sip) 포즈 적용" }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "일상" }));
    expect(
      screen.getByRole("button", { name: "머그잔 마시기 (Coffee Sip) 포즈 적용" }),
    ).toBeTruthy();
  });

  it("검색어로 포즈를 찾을 수 있다", () => {
    render(<StudioWebtoonPosePresetGrid onApplyPreset={() => {}} />);

    fireEvent.change(screen.getByRole("textbox", { name: "포즈 프리셋 검색" }), {
      target: { value: "포옹" },
    });
    expect(
      screen.getByRole("button", { name: "로맨스 포옹 (Romantic Embrace) 포즈 적용" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "히어로 3점 착지 (Superhero Landing) 포즈 적용" }),
    ).toBeNull();
  });

  it("핀 버튼으로 즐겨찾기를 고정하고 localStorage에 유지된다", () => {
    const { unmount } = render(<StudioWebtoonPosePresetGrid onApplyPreset={() => {}} />);

    fireEvent.click(
      screen.getByRole("button", { name: "머그잔 마시기 즐겨찾기 고정" }),
    );
    expect(screen.getByRole("region", { name: "즐겨찾기 포즈" })).toBeTruthy();
    const stored = window.localStorage.getItem(
      "toonstudio.webtoon-pose-preset.favorites.v1",
    );
    expect(stored).toContain("daily-coffee-sip");

    unmount();
    render(<StudioWebtoonPosePresetGrid onApplyPreset={() => {}} />);
    // 다시 마운트해도 즐겨찾기가 복원된다.
    expect(screen.getByRole("region", { name: "즐겨찾기 포즈" })).toBeTruthy();
  });

  it("조건에 맞는 포즈가 없으면 빈 상태를 보여준다", () => {
    render(<StudioWebtoonPosePresetGrid onApplyPreset={() => {}} />);
    fireEvent.change(screen.getByRole("textbox", { name: "포즈 프리셋 검색" }), {
      target: { value: "존재하지않는검색어" },
    });
    expect(screen.getByText("조건에 맞는 포즈가 없습니다. 필터나 검색어를 바꿔 보세요.")).toBeTruthy();
  });
});
