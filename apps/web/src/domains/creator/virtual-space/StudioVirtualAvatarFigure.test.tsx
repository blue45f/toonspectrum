// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StudioVirtualAvatarFigure } from "./StudioVirtualAvatarFigure";
import type { StudioVirtualAvatarProfile } from "./studio-virtual-space-model";
import type { StudioSpriteDirection } from "./studio-virtual-space-sprite";

/** 8방향 (StudioSpriteDirection 유니온과 동일 순서). */
const SPRITE_DIRECTIONS: readonly StudioSpriteDirection[] = [
  "down", "down-left", "left", "up-left", "up", "up-right", "right", "down-right",
];

const PROFILE: StudioVirtualAvatarProfile = {
  skin: "oklch(0.91 0.055 55)",
  hair: "oklch(0.31 0.055 25)",
  hairHighlight: "oklch(0.56 0.12 25)",
  outfit: "oklch(0.63 0.2 300)",
  accent: "oklch(0.78 0.19 335)",
  accessory: "glasses",
  hairStyle: "twin",
  outfitStyle: "hoodie",
  expression: "sparkle",
};

describe("StudioVirtualAvatarFigure", () => {
  // jsdom에는 window.matchMedia가 없어 컴포넌트의 reduced-motion 감지가 깨진다.
  // 저장소 관례(StudioCommentThreadPopover.test.tsx)대로 스텁을 주입한다.
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    });
  });

  it("8방향 모두 렌더링된다", () => {
    const { container } = render(
      <div>
        {SPRITE_DIRECTIONS.map((direction) => (
          <StudioVirtualAvatarFigure key={direction} profile={PROFILE} direction={direction} />
        ))}
      </div>,
    );
    const figures = container.querySelectorAll("svg[data-avatar-direction]");
    expect(figures).toHaveLength(8);
    for (const direction of SPRITE_DIRECTIONS) {
      expect(container.querySelector(`svg[data-avatar-direction="${direction}"]`)).not.toBeNull();
    }
  });

  it("프로필 색상이 SVG에 반영된다", () => {
    const { container } = render(<StudioVirtualAvatarFigure profile={PROFILE} />);
    const markup = container.innerHTML;
    expect(markup).toContain(PROFILE.skin);
    expect(markup).toContain(PROFILE.hair);
    expect(markup).toContain(PROFILE.outfit);
    expect(markup).toContain(PROFILE.accent);
  });

  it("title이 있으면 role=img와 aria-label을 가진다", () => {
    render(<StudioVirtualAvatarFigure profile={PROFILE} title="내 아바타 미리보기" />);
    // jest-dom 매처가 설정에 없어 표준 단언을 사용한다.
    expect(screen.getByRole("img", { name: "내 아바타 미리보기" })).not.toBeNull();
  });

  it("12종 헤어스타일과 12종 의상이 모두 깨지지 않고 그려진다", () => {
    const hairStyles = ["bob", "long", "short", "twin", "wave", "crop", "ponytail", "bun", "curly", "braid", "pigtails", "mohawk"] as const;
    const outfits = ["hoodie", "tee", "jacket", "dress", "suit", "sweater", "uniform", "apron", "coat", "sportswear", "cardigan", "overalls"] as const;
    const { container } = render(
      <div>
        {hairStyles.map((hairStyle) => (
          <StudioVirtualAvatarFigure key={hairStyle} profile={{ ...PROFILE, hairStyle }} />
        ))}
        {outfits.map((outfitStyle) => (
          <StudioVirtualAvatarFigure key={outfitStyle} profile={{ ...PROFILE, outfitStyle }} />
        ))}
      </div>,
    );
    expect(container.querySelectorAll("svg[data-avatar-direction]").length).toBe(24);
  });
});
