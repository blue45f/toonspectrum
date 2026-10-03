import { describe, expect, it } from "vitest";

import {
  activeMentionQuery,
  applyMentionSelection,
  filterMentionCandidates,
  resolveMentionActors,
  type MentionCandidate,
} from "./manuscript-pin-mention-autocomplete";

const CANDIDATES: readonly MentionCandidate[] = [
  { id: "u1", displayName: "김작가", detail: "스토리" },
  { id: "u2", displayName: "김연출" },
  { id: "u3", displayName: "박김치" },
  { id: "u4", displayName: "이편집" },
];

describe("activeMentionQuery", () => {
  it("문두와 공백 뒤의 @만 멘션 작성 중으로 본다", () => {
    expect(activeMentionQuery("@김", 2)).toEqual({ start: 0, query: "김" });
    expect(activeMentionQuery("안녕 @김", 5)).toEqual({ start: 3, query: "김" });
    expect(activeMentionQuery("@", 1)).toEqual({ start: 0, query: "" });
    expect(activeMentionQuery("mail@김", 5)).toBeNull();
  });

  it("@ 뒤에 공백이 지나갔으면 멘션이 아니다", () => {
    expect(activeMentionQuery("@김 철", 4)).toBeNull();
    expect(activeMentionQuery("그냥 문장", 4)).toBeNull();
    expect(activeMentionQuery("", 0)).toBeNull();
  });
});

describe("filterMentionCandidates", () => {
  it("앞에 붙는 일치를 먼저, 포함 일치를 뒤에 둔다", () => {
    expect(filterMentionCandidates(CANDIDATES, "김").map((c) => c.id)).toEqual(["u1", "u2", "u3"]);
    expect(filterMentionCandidates(CANDIDATES, "").map((c) => c.id)).toEqual([
      "u1",
      "u2",
      "u3",
      "u4",
    ]);
    expect(filterMentionCandidates(CANDIDATES, "없음")).toEqual([]);
  });
});

describe("applyMentionSelection", () => {
  it("'@검색어'를 '@이름 '으로 바꾸고 캐럿을 뒤에 둔다", () => {
    expect(applyMentionSelection("@김", 2, CANDIDATES[0] as MentionCandidate)).toEqual({
      text: "@김작가 ",
      caret: 5,
    });
    expect(
      applyMentionSelection("앞 @김 뒤", 4, CANDIDATES[1] as MentionCandidate),
    ).toEqual({ text: "앞 @김연출 뒤", caret: 7 });
    expect(applyMentionSelection("멘션 아님", 3, CANDIDATES[0] as MentionCandidate)).toBeNull();
  });
});

describe("resolveMentionActors", () => {
  it("명단에서 한 명과만 일치하면 id를 싣고, 동명이인·미등록은 이름만 남긴다", () => {
    expect(resolveMentionActors("@김작가 확인해 주세요", CANDIDATES)).toEqual([
      { id: "u1", displayName: "김작가" },
    ]);
    const duplicated: readonly MentionCandidate[] = [
      { id: "u1", displayName: "김작가" },
      { id: "u9", displayName: "김작가" },
    ];
    expect(resolveMentionActors("@김작가", duplicated)).toEqual([{ displayName: "김작가" }]);
    expect(resolveMentionActors("@없는사람", CANDIDATES)).toEqual([{ displayName: "없는사람" }]);
    expect(resolveMentionActors("멘션 없음", CANDIDATES)).toEqual([]);
  });
});
