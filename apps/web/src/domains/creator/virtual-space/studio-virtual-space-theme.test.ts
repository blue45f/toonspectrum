// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { CAMPUS_ZONES, type StudioCampusZoneTone } from "./studio-virtual-space-campus-blueprint";
import * as dayNightCycle from "./studio-virtual-space-day-night-cycle";
import {
  DEFAULT_STUDIO_SPACE_THEME,
  STUDIO_SPACE_THEME_KEYS,
  STUDIO_SPACE_THEMES,
  isStudioSpaceThemeKey,
  readStudioSpaceTheme,
  studioSpaceTheme,
  studioSpaceThemeFloorSpec,
  studioSpaceThemeSwatch,
  studioSpaceThemeWallTint,
  writeStudioSpaceTheme,
} from "./studio-virtual-space-theme";

const TONES = [...new Set(CAMPUS_ZONES.map((zone) => zone.tone))] as StudioCampusZoneTone[];

describe("공간 테마 모델", () => {
  it("테마 5종이 모두 등록돼 있고 기본 테마가 존재한다", () => {
    expect(STUDIO_SPACE_THEMES.map((theme) => theme.key)).toEqual([...STUDIO_SPACE_THEME_KEYS]);
    expect(STUDIO_SPACE_THEME_KEYS).toEqual(["modern-office", "cozy-wood", "neon-night", "garden-terrace", "library"]);
    expect(studioSpaceTheme(DEFAULT_STUDIO_SPACE_THEME).key).toBe("modern-office");
    expect(isStudioSpaceThemeKey("neon-night")).toBe(true);
    expect(isStudioSpaceThemeKey("pastel")).toBe(false);
    expect(isStudioSpaceThemeKey(null)).toBe(false);
  });

  it("모든 테마가 실제 캠퍼스에 쓰이는 구역 톤 전체에 벽·바닥을 정의한다", () => {
    expect(TONES.length).toBeGreaterThan(8);
    for (const theme of STUDIO_SPACE_THEMES) {
      for (const tone of TONES) {
        expect(theme.wallTints[tone], `${theme.key}/${tone} 벽`).toBeTypeOf("number");
        const spec = theme.floors[tone];
        expect(spec, `${theme.key}/${tone} 바닥`).toBeDefined();
        expect(spec.base).toBeTypeOf("number");
        expect(spec.accent).toBeTypeOf("number");
      }
    }
  });

  it("테마마다 바닥·벽·배경이 실제로 다르다 (색만 살짝 바꾸는 수준 금지)", () => {
    const signature = (key: (typeof STUDIO_SPACE_THEME_KEYS)[number]) => {
      const theme = studioSpaceTheme(key);
      return {
        floors: TONES.map((tone) => theme.floors[tone].base),
        patterns: TONES.map((tone) => theme.floors[tone].pattern),
        walls: TONES.map((tone) => theme.wallTints[tone]),
        background: theme.backgroundColor,
      };
    };
    for (let i = 0; i < STUDIO_SPACE_THEME_KEYS.length; i += 1) {
      for (let j = i + 1; j < STUDIO_SPACE_THEME_KEYS.length; j += 1) {
        const a = signature(STUDIO_SPACE_THEME_KEYS[i]!);
        const b = signature(STUDIO_SPACE_THEME_KEYS[j]!);
        const differing = [
          ...a.floors.filter((value, index) => value !== b.floors[index]),
          ...a.walls.filter((value, index) => value !== b.walls[index]),
        ].length;
        // 배경 + 바닥·벽 중 최소 절반 이상이 달라야 서로 다른 테마로 본다.
        expect(a.background).not.toBe(b.background);
        expect(differing, `${STUDIO_SPACE_THEME_KEYS[i]} vs ${STUDIO_SPACE_THEME_KEYS[j]}`).toBeGreaterThan(TONES.length);
        // 패턴 구성도 최소 한 톤은 달라야 한다.
        expect(a.patterns.some((pattern, index) => pattern !== b.patterns[index])).toBe(true);
      }
    }
  });

  it("모던 오피스는 기존 블루프린트 벽 색을 유지한다 (기본 테마 = 현행 모습)", () => {
    const theme = studioSpaceTheme("modern-office");
    for (const zone of CAMPUS_ZONES) {
      expect(studioSpaceThemeWallTint(theme, zone)).toBe(zone.wallTint);
    }
  });

  it("구역 벽 틴트·바닥 스펙 해석이 테마 값을 반환한다", () => {
    const neon = studioSpaceTheme("neon-night");
    const stage = CAMPUS_ZONES.find((zone) => zone.roomId === "event-stage")!;
    expect(studioSpaceThemeWallTint(neon, stage)).toBe(neon.wallTints.stage);
    expect(studioSpaceThemeFloorSpec(neon, "stage").pattern).toBe("slate");
    expect(studioSpaceThemeFloorSpec(studioSpaceTheme("library"), "mosaic").pattern).toBe("checker");
    expect(studioSpaceThemeFloorSpec(studioSpaceTheme("garden-terrace"), "grass").pattern).toBe("lawn");
  });

  it("전면 틴트 상한 규칙과 무관하다 — 테마는 오버레이 필드를 갖지 않는다", () => {
    for (const theme of STUDIO_SPACE_THEMES) {
      expect(Object.keys(theme)).not.toContain("tint");
      expect(Object.keys(theme)).not.toContain("overlay");
      expect(Object.keys(theme)).not.toContain("ambience");
    }
    // 주야 전면 틴트는 제거되어, 사이클 모듈은 틴트 알파를 산출하지 않는다.
    expect("studioDayNightTintAlpha" in dayNightCycle).toBe(false);
  });

  it("썸네일 견본이 그라데이션 CSS와 대표 색을 만든다", () => {
    const swatch = studioSpaceThemeSwatch(studioSpaceTheme("neon-night"));
    expect(swatch.gradientCss).toContain("linear-gradient(180deg, #070b18");
    expect(swatch.floor).toMatch(/^#[0-9a-f]{6}$/);
    expect(swatch.wall).toMatch(/^#[0-9a-f]{6}$/);
    expect(swatch.accent).toBe("#38dfff");
  });
});

describe("공간 테마 영속성", () => {
  it("저장한 테마를 다시 읽고, 깨진 값은 기본 테마로 되돌린다", () => {
    expect(writeStudioSpaceTheme("library")).toBe(true);
    expect(readStudioSpaceTheme()).toBe("library");
    window.localStorage.setItem("toonspectrum:virtual-space-theme:v1", "broken-value");
    expect(readStudioSpaceTheme()).toBe(DEFAULT_STUDIO_SPACE_THEME);
    expect(writeStudioSpaceTheme("broken" as never)).toBe(false);
  });
});
