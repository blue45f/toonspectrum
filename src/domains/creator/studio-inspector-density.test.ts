/**
 * Wave D contract — inspector information density (V5 §15 / audit §2.5).
 *
 * The audit measured 33 controls in the properties tab and 13 groups / 35
 * leaves in the tool-properties palette, with **zero** disclosure affordances
 * in `StudioInspectorAside.tsx`. These tests pin the three things that must
 * stay true afterwards:
 *
 * 1. the default tier stays inside the 5~9 budget,
 * 2. nothing was deleted — every control is still reachable from Advanced,
 * 3. the same concept is called the same thing in every panel.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  inspectorAdvancedSectionIds,
  inspectorDefaultLeafCount,
  inspectorGroups,
  inspectorGroupsByTier,
  inspectorTotalLeafCount,
  STUDIO_INSPECTOR_CANONICAL_LABELS,
  STUDIO_INSPECTOR_DEFAULT_BUDGET,
  STUDIO_INSPECTOR_DENSITY,
} from "./studio-inspector-density";
import { STUDIO_SEARCH_CORPUS_BY_ID } from "./studio-search-corpus";

import type { StudioInspectorPanelId } from "./studio-inspector-density";

const PANELS: readonly StudioInspectorPanelId[] = [
  "element-properties",
  "tool-properties",
];

/** Counts the audit reported for each panel before Wave D. */
const AUDITED_LEAVES: Readonly<Record<StudioInspectorPanelId, number>> = {
  "element-properties": 33,
  "tool-properties": 35,
};

describe("inspector density — 기본 노출 예산 5~9", () => {
  it.each(PANELS)("%s 는 기본 노출 컨트롤이 5~9개다", (panel) => {
    const count = inspectorDefaultLeafCount(panel);
    expect(count).toBeGreaterThanOrEqual(STUDIO_INSPECTOR_DEFAULT_BUDGET.min);
    expect(count).toBeLessThanOrEqual(STUDIO_INSPECTOR_DEFAULT_BUDGET.max);
  });

  it("두 패널 모두 감사가 실측한 33/35 에서 예산 안으로 줄었다", () => {
    for (const panel of PANELS) {
      expect(inspectorDefaultLeafCount(panel)).toBeLessThan(
        AUDITED_LEAVES[panel],
      );
    }
  });

  it("모든 그룹은 default 또는 advanced 중 하나를 명시한다", () => {
    for (const panel of PANELS) {
      for (const group of inspectorGroups(panel)) {
        expect(["default", "advanced"]).toContain(group.tier);
        expect(group.leaves).toBeGreaterThan(0);
        expect(group.source).toMatch(/StudioInspectorAside\.tsx:\d/u);
      }
    }
  });

  it("기본 티어 그룹은 어떤 근거로 기본인지 반드시 적는다", () => {
    // 사용 빈도 텔레메트리가 레포에 없다는 사실 자체가 근거 문서화의 이유다.
    for (const panel of PANELS) {
      for (const group of inspectorGroupsByTier(panel, "default")) {
        expect(group.rationale.length, group.id).toBeGreaterThan(10);
      }
    }
  });
});

describe("inspector density — 기능 제거 없음", () => {
  it("전체 도달 가능 컨트롤 수가 감사 실측치 이상이다", () => {
    for (const panel of PANELS) {
      expect(inspectorTotalLeafCount(panel)).toBeGreaterThanOrEqual(
        AUDITED_LEAVES[panel],
      );
    }
  });

  it("기본에 없는 컨트롤은 전부 Advanced 섹션 하나에 속한다", () => {
    for (const panel of PANELS) {
      const total = inspectorTotalLeafCount(panel);
      const inDefault = inspectorDefaultLeafCount(panel);
      const inAdvanced = inspectorGroupsByTier(panel, "advanced").reduce(
        (sum, group) => sum + group.leaves,
        0,
      );
      expect(inDefault + inAdvanced).toBe(total);
      expect(inAdvanced).toBeGreaterThan(0);
    }
  });

  it("Advanced 섹션 id 는 패널 안에서 유일하다", () => {
    for (const panel of PANELS) {
      const ids = inspectorAdvancedSectionIds(panel);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("접힌 컨트롤은 통합 검색으로 이름을 대면 찾을 수 있다", () => {
    // 접기가 허용되는 이유는 검색이 대체 경로이기 때문이다. 링크가 끊기면
    // 접기는 곧 은폐가 된다.
    for (const panel of PANELS) {
      for (const group of inspectorGroups(panel)) {
        if (!group.searchEntryId) continue;
        expect(
          STUDIO_SEARCH_CORPUS_BY_ID.has(group.searchEntryId),
          `${group.id} → ${group.searchEntryId}`,
        ).toBe(true);
      }
    }
  });
});

describe("inspector density — 모드가 달라도 동일 명칭", () => {
  it("같은 canonical 키는 어느 패널에서든 같은 라벨을 쓴다", () => {
    const seen = new Map<string, string>();
    for (const panel of PANELS) {
      for (const group of inspectorGroups(panel)) {
        const previous = seen.get(group.canonical);
        if (previous === undefined) seen.set(group.canonical, group.label);
        else expect(group.label, group.id).toBe(previous);
      }
    }
  });

  it("라벨은 SSOT 표에서만 온다", () => {
    for (const panel of PANELS) {
      for (const group of inspectorGroups(panel)) {
        expect(group.label).toBe(
          STUDIO_INSPECTOR_CANONICAL_LABELS[group.canonical],
        );
      }
    }
  });

  it("불투명도는 두 패널에서 같은 이름이다 (기존 '투명도' 불일치 회귀 방지)", () => {
    const element = inspectorGroups("element-properties").find(
      (group) => group.canonical === "opacity",
    );
    const tool = inspectorGroups("tool-properties").find(
      (group) => group.canonical === "opacity",
    );
    expect(element?.label).toBe("불투명도");
    expect(tool?.label).toBe("불투명도");
  });

  it("도구 속성 팔레트에 '투명도' 라는 옛 라벨이 남아 있지 않다", () => {
    const source = readFileSync(
      path.join(__dirname, "StudioInspectorAside.tsx"),
      "utf-8",
    );
    expect(source).not.toMatch(/>\s*투명도\s*</u);
  });
});

describe("inspector density — 컴포넌트가 실제로 접기를 렌더한다", () => {
  const source = readFileSync(
    path.join(__dirname, "StudioInspectorAside.tsx"),
    "utf-8",
  );

  const sectionSource = readFileSync(
    path.join(__dirname, "StudioInspectorSection.tsx"),
    "utf-8",
  );

  it("Advanced 섹션 헤더가 aria-expanded 와 chevron 을 노출한다", () => {
    // 감사 시점에는 인스펙터 전체에 aria-expanded 가 0건, <details> 0건이었다.
    expect(sectionSource).toMatch(/aria-expanded=\{open\}/u);
    expect(sectionSource).toMatch(/ChevronDown/u);
  });

  it("인스펙터가 그 접기 프리미티브를 실제로 임포트한다", () => {
    expect(source).toMatch(
      /import \{ StudioInspectorSection \} from "\.\/StudioInspectorSection"/u,
    );
  });

  it("선언된 Advanced 섹션 id 가 전부 컴포넌트에 배선돼 있다", () => {
    for (const panel of PANELS) {
      for (const id of inspectorAdvancedSectionIds(panel)) {
        expect(source.includes(`"${id}"`), id).toBe(true);
      }
    }
  });

  it("두 패널 정의가 모두 등록돼 있다", () => {
    expect(Object.keys(STUDIO_INSPECTOR_DENSITY).sort()).toEqual([
      "element-properties",
      "tool-properties",
    ]);
  });
});
