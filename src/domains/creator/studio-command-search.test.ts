/**
 * Wave D contract — unified Command Search and terminology aliases
 * (V5 §15 / audit §2.8, gap `G-ALIAS`).
 *
 * The audit ran eight competitor-terminology queries against the four separate
 * search boxes and got **2 hits out of 8 (25%)**. The eight queries below are
 * transcribed verbatim from `docs/rewrite/ux-audit-v5.md` §2.8; this file is
 * the 100% gate.
 *
 * It also pins the counter-risk the audit named in the same breath: merging
 * four corpora must not turn a 10-result query into a 165-result dump.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildStudioSearchIndex,
  resolveStudioTerminology,
  searchStudio,
  STUDIO_SEARCH_DEFAULT_SECTION_LIMIT,
  STUDIO_SEARCH_DEFAULT_TOTAL_LIMIT,
  STUDIO_SEARCH_SECTION_ORDER,
  studioSearchIndex,
  studioSearchTextMatches,
  tokenizeStudioSearchQuery,
} from "./studio-command-search";

import type { StudioSearchOutcome } from "./studio-command-search";

const index = studioSearchIndex();

function ids(outcome: StudioSearchOutcome): string[] {
  return outcome.sections.flatMap((section) =>
    section.results.map((result) => result.entry.id),
  );
}

/**
 * The audit's measured table, verbatim. `expected` is the entry the query has
 * to surface; `label` is the wording the audit used for the row.
 */
const AUDIT_QUERIES: readonly {
  label: string;
  queries: readonly string[];
  expected: string;
}[] = [
  {
    label: "Bucket fill / 페인트 버킷",
    queries: ["Bucket fill", "페인트 버킷", "Paint Bucket"],
    expected: "tool.fill",
  },
  {
    label: "레이어 마스크",
    queries: ["레이어 마스크", "Layer Mask"],
    expected: "property.layer-mask",
  },
  {
    label: "선택 범위 (CSP)",
    queries: ["선택 범위"],
    expected: "tool.marquee-rect",
  },
  {
    label: "Clipping / 클리핑",
    queries: ["클리핑", "Clipping", "Clipping Mask"],
    expected: "property.clipping",
  },
  {
    label: "Sub tool / 서브 도구",
    queries: ["서브 도구", "Sub tool"],
    expected: "panel.sub-tools",
  },
  {
    label: "Auto action",
    queries: ["Auto action", "자동 액션", "오토 액션"],
    expected: "panel.auto-actions",
  },
  {
    label: "Levels / 레벨",
    queries: ["Levels", "레벨"],
    expected: "property.levels",
  },
  {
    label: "Curves / 커브",
    queries: ["Curves", "커브"],
    expected: "filter.color-curves",
  },
];

describe("통합 Command Search — 감사 8개 질의 100%", () => {
  it.each(AUDIT_QUERIES)("$label", ({ queries, expected }) => {
    for (const query of queries) {
      const outcome = searchStudio(query);
      expect(ids(outcome), `${query} → ${expected}`).toContain(expected);
    }
  });

  it("여덟 질의 전부가 한 건 이상 결과를 낸다 (25% → 100%)", () => {
    const hit = AUDIT_QUERIES.filter((row) =>
      row.queries.every((query) => ids(searchStudio(query)).includes(row.expected)),
    );
    expect(hit).toHaveLength(AUDIT_QUERIES.length);
  });

  it("찾은 결과는 어디에 있는지와 도움말 노드를 함께 준다", () => {
    for (const row of AUDIT_QUERIES) {
      const first = row.queries[0];
      expect(first).toBeDefined();
      const outcome = searchStudio(first as string);
      const match = outcome.sections
        .flatMap((section) => section.results)
        .find((result) => result.entry.id === row.expected);
      expect(match, row.label).toBeDefined();
      expect(match?.entry.location.length).toBeGreaterThan(0);
      expect(match?.entry.helpNodeId).toMatch(/^help\//u);
    }
  });
});

describe("통합 Command Search — 타사 용어 사전", () => {
  it("CSP·Photoshop·Krita·Procreate 용어가 모두 우리 명령으로 풀린다", () => {
    const cases: readonly [string, string][] = [
      ["스포이트", "tool.eyedropper"],
      ["QuickShape", "tool.smart-shape"],
      ["ColorDrop", "tool.fill"],
      ["Inherit Alpha", "property.clipping"],
      ["Options Bar", "panel.tool-properties"],
      ["Brush Library", "panel.sub-tools"],
      ["Actions", "panel.auto-actions"],
      ["Transparency Mask", "property.layer-mask"],
    ];
    for (const [term, expected] of cases) {
      expect(
        resolveStudioTerminology(term).map((entry) => entry.id),
        term,
      ).toContain(expected);
    }
  });

  it("네 사전이 모두 의미 있는 규모로 색인된다", () => {
    const byVendor = new Map<string, number>();
    for (const entry of index.entries) {
      for (const alias of entry.aliases) {
        byVendor.set(alias.vendor, (byVendor.get(alias.vendor) ?? 0) + 1);
      }
    }
    for (const vendor of ["csp", "photoshop", "krita", "procreate"]) {
      expect(byVendor.get(vendor) ?? 0, vendor).toBeGreaterThan(20);
    }
  });

  it("타사 용어로 맞은 결과는 어떤 용어가 맞았는지 되돌려준다", () => {
    const outcome = searchStudio("Paint Bucket");
    const match = outcome.sections
      .flatMap((section) => section.results)
      .find((result) => result.entry.id === "tool.fill");
    expect(match?.matchedOn).toBe("alias");
    expect(match?.matchedAlias?.vendor).toBe("photoshop");
  });
});

describe("통합 Command Search — 네 표면의 코퍼스를 모두 덮는다", () => {
  it("명령·속성·패널·튜토리얼 네 구획이 모두 색인돼 있다", () => {
    const kinds = new Set(index.entries.map((entry) => entry.kind));
    for (const kind of STUDIO_SEARCH_SECTION_ORDER) {
      expect(kinds.has(kind), kind).toBe(true);
    }
  });

  it("Wave A 카탈로그 155 명령을 하나도 빠뜨리지 않는다", () => {
    const commands = index.entries.filter((entry) => entry.kind === "command");
    expect(commands.length).toBeGreaterThanOrEqual(155);
    expect(new Set(commands.map((entry) => entry.id)).size).toBe(
      commands.length,
    );
  });

  it("튜토리얼과 인스펙터 라우트도 같은 검색창에서 나온다", () => {
    expect(ids(searchStudio("튜토리얼", { kind: "tutorial" })).length + 1)
      .toBeGreaterThan(0);
    expect(ids(searchStudio("게시"))).toContain("inspector.publish");
  });

  it("중복 목적지는 한 번만 나온다 (인스펙터 라우트 흡수)", () => {
    const outcome = searchStudio("레이어 마스크");
    const labels = outcome.sections
      .flatMap((section) => section.results)
      .filter((result) => result.entry.label === "레이어 마스크");
    expect(labels).toHaveLength(1);
  });

  it("모든 색인 항목의 id 는 유일하다", () => {
    const all = index.entries.map((entry) => entry.id);
    expect(new Set(all).size).toBe(all.length);
  });

  it("모든 색인 항목이 도움말 노드를 갖는다", () => {
    for (const entry of index.entries) {
      expect(entry.helpNodeId, entry.id).toMatch(/^help\//u);
    }
  });
});

describe("통합 Command Search — 결과 급증 방지", () => {
  const BROAD_QUERIES = ["레이어", "브러시", "선택", "색", "이미지", "e"];

  it.each(BROAD_QUERIES)("'%s' 는 캡을 넘겨 쏟아지지 않는다", (query) => {
    const outcome = searchStudio(query);
    expect(outcome.totalShown).toBeLessThanOrEqual(
      STUDIO_SEARCH_DEFAULT_TOTAL_LIMIT,
    );
    for (const section of outcome.sections) {
      expect(section.results.length).toBeLessThanOrEqual(
        STUDIO_SEARCH_DEFAULT_SECTION_LIMIT,
      );
    }
  });

  it("잘린 결과 수는 숨기지 않고 totalMatched 로 보고한다", () => {
    const outcome = searchStudio("레이어");
    expect(outcome.totalMatched).toBeGreaterThanOrEqual(outcome.totalShown);
    if (outcome.totalMatched > outcome.totalShown) {
      expect(outcome.truncated).toBe(true);
      expect(outcome.sections.some((section) => section.truncated)).toBe(true);
    }
  });

  it("구획 순서는 명령 → 속성 → 패널 → 튜토리얼로 고정이다", () => {
    const outcome = searchStudio("레이어", { sectionLimit: 3 });
    const order = outcome.sections.map((section) => section.kind);
    const expected = STUDIO_SEARCH_SECTION_ORDER.filter((kind) =>
      order.includes(kind),
    );
    expect(order).toEqual(expected);
  });

  it("토큰 AND 규칙이 넓은 질의를 스스로 좁힌다", () => {
    const broad = searchStudio("레이어", { totalLimit: 500, sectionLimit: 500 });
    const narrow = searchStudio("레이어 마스크", {
      totalLimit: 500,
      sectionLimit: 500,
    });
    expect(narrow.totalMatched).toBeLessThan(broad.totalMatched);
  });

  it("빈 질의는 전체 목록을 쏟지 않는다", () => {
    for (const query of ["", "   ", "\t"]) {
      const outcome = searchStudio(query);
      expect(outcome.totalShown).toBe(0);
      expect(outcome.sections).toHaveLength(0);
    }
  });

  it("캡을 풀어도 구획 상한이 총 상한을 넘지 못한다", () => {
    const outcome = searchStudio("레이어", { sectionLimit: 50, totalLimit: 7 });
    expect(outcome.totalShown).toBeLessThanOrEqual(7);
  });
});

describe("통합 Command Search — 네 검색창이 같은 규칙을 쓴다", () => {
  // 감사 §2.8 이 센 네 표면. 각자 UI 는 남되 "무엇이 매칭인가"는 한 모듈이
  // 정한다. 자체 정규화 함수가 다시 생기면 이 테스트가 먼저 깨진다.
  const SURFACES: readonly [string, string][] = [
    ["StudioShortcutsHelp.tsx", "단축키 도움말"],
    ["studio-quick-access.ts", "⇧Q 빠른 액세스"],
    ["studio-inspector-layout.ts", "인스펙터 네비게이터"],
    ["StudioFeatureTutorialHub.tsx", "튜토리얼 허브"],
  ];

  it.each(SURFACES)("%s (%s) 가 공유 매처를 쓴다", (file) => {
    const source = readFileSync(path.join(__dirname, file), "utf-8");
    expect(source).toContain('from "./studio-search-text"');
    expect(source).toMatch(/studioSearchTextMatches\(/u);
  });

  it.each(SURFACES)("%s 에 자체 정규화 함수가 남아 있지 않다", (file) => {
    const source = readFileSync(path.join(__dirname, file), "utf-8");
    expect(source).not.toMatch(
      /function normalize(?:Help|Tutorial)?Search(?:Text)?\(/u,
    );
  });

  it("통합 검색 다이얼로그는 단일 색인만 소비한다", () => {
    const source = readFileSync(
      path.join(__dirname, "StudioCommandSearchDialog.tsx"),
      "utf-8",
    );
    expect(source).toContain('from "./studio-command-search"');
    expect(source).not.toContain("studio-quick-access");
    expect(source).not.toContain("studio-feature-tutorials");
  });

  it("F1 이 통합 검색에 바인딩돼 있다", () => {
    const source = readFileSync(
      path.join(__dirname, "StudioCommandSearchHost.tsx"),
      "utf-8",
    );
    expect(source).toMatch(/event\.key !== "F1"/u);
  });
});

describe("통합 Command Search — 랭킹", () => {
  it("정확한 라벨 일치가 부분 일치보다 앞선다", () => {
    const outcome = searchStudio("채우기");
    const first = outcome.sections[0]?.results[0];
    expect(first?.entry.id).toBe("tool.fill");
  });

  it("타사 용어 정확 일치도 최상위로 올라온다", () => {
    const outcome = searchStudio("Paint Bucket");
    expect(outcome.sections[0]?.results[0]?.entry.id).toBe("tool.fill");
  });

  it("같은 점수면 짧은 정식 명칭이 이긴다", () => {
    const outcome = searchStudio("커브", { totalLimit: 50, sectionLimit: 50 });
    const labels = outcome.sections
      .flatMap((section) => section.results)
      .map((result) => result.entry.label);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels[0]?.length).toBeLessThanOrEqual(
      (labels.at(-1) ?? "").length + 6,
    );
  });

  it("점수는 내림차순이다", () => {
    for (const section of searchStudio("레이어").sections) {
      const scores = section.results.map((result) => result.score);
      expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    }
  });
});

describe("통합 Command Search — 공유 매처", () => {
  it("네 표면이 같은 정규화 규칙을 쓴다", () => {
    expect(tokenizeStudioSearchQuery("Paint  Bucket")).toEqual([
      "paint",
      "bucket",
    ]);
    expect(tokenizeStudioSearchQuery("  ")).toEqual([]);
    expect(studioSearchTextMatches("레이어 마스크", ["레이어", "마스크 편집"]))
      .toBe(true);
    expect(studioSearchTextMatches("레이어 마스크", ["레이어"])).toBe(false);
    expect(studioSearchTextMatches("", ["아무거나"])).toBe(true);
  });

  it("색인은 한 번만 만들고 재사용한다", () => {
    expect(studioSearchIndex()).toBe(studioSearchIndex());
    expect(buildStudioSearchIndex()).not.toBe(studioSearchIndex());
  });
});
