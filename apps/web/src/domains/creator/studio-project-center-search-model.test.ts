import { describe, expect, it } from "vitest";

import {
  createStudioProjectCenterActionKey,
  normalizeStudioProjectCenterText,
  parseStudioProjectCenterKeys,
  prependStudioProjectCenterKey,
  rankStudioProjectCenterActions,
  type StudioProjectCenterSearchRecord,
} from "./studio-project-center-search-model";

const records = Object.freeze([
  {
    key: "archive",
    label: "아카이브 백업",
    description: "프로젝트 전체를 장기 보관 사본으로 저장",
    sectionLabel: "내보내기 · 백업",
    keywords: ["toonproject zip"],
    order: 0,
  },
  {
    key: "publish-check",
    label: "게시 사전검사",
    description: "게시 전 구조와 품질을 검사",
    sectionLabel: "연출 · 게시 · 검수",
    keywords: ["preflight qa"],
    order: 1,
  },
  {
    key: "version-short",
    label: "버전",
    description: "복구 지점 목록",
    sectionLabel: "버전 · 가져오기",
    order: 2,
  },
  {
    key: "version-long",
    label: "버전 체크포인트",
    description: "이름이 있는 복구 지점 만들기",
    sectionLabel: "버전 · 가져오기",
    order: 3,
  },
] satisfies readonly StudioProjectCenterSearchRecord[]);

describe("studio project center search model", () => {
  it("normalizes width, punctuation and whitespace for Korean and file formats", () => {
    expect(normalizeStudioProjectCenterText("  ＰＳＤ ·  가져오기  ")).toBe(
      "psd 가져오기",
    );
  });

  it("ranks exact labels before broader section matches", () => {
    expect(rankStudioProjectCenterActions(records, "버전").map((item) => item.key)).toEqual([
      "version-short",
      "version-long",
    ]);
  });

  it("supports English synonyms and multi-token intent search", () => {
    expect(rankStudioProjectCenterActions(records, "archive")[0]?.key).toBe(
      "archive",
    );
    expect(rankStudioProjectCenterActions(records, "게시 qa")[0]?.key).toBe(
      "publish-check",
    );
  });

  it("creates stable action keys from normalized section and label text", () => {
    expect(
      createStudioProjectCenterActionKey("내보내기 · 백업", "아카이브 백업"),
    ).toBe(
      createStudioProjectCenterActionKey(" 내보내기  백업 ", "아카이브 백업"),
    );
  });

  it("parses defensive unique key lists and keeps the newest item first", () => {
    expect(
      parseStudioProjectCenterKeys('["a", "a", 3, "b", "c"]', 2),
    ).toEqual(["a", "b"]);
    expect(parseStudioProjectCenterKeys("not-json")).toEqual([]);
    expect(prependStudioProjectCenterKey(["a", "b", "c"], "b", 3)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });
});
