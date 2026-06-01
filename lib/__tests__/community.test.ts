import { describe, expect, it } from "vitest";
import {
  getCommunityScopeTargetLink,
  parseCommunityScope,
  parseCommunitySort,
  parseCommunityScopeWithAll,
} from "../community-ui";
import { validatePostInput, validateReplyText } from "../server/community";

describe("community validation", () => {
  it("팬카페 게시글 입력을 정규화한다", () => {
    const result = validatePostInput({
      scope: "title",
      targetId: "nw-183559",
      targetLabel: "신의 탑",
      kind: "theory",
      title: "  세계관 해석  ",
      text: "  좋은 글\n\n\n입니다  ",
      tags: ["#정주행", "해석", "세계관", "긴태그".repeat(20), "", "초과"],
    });

    expect(result.error).toBeUndefined();
    expect(result.value?.title).toBe("세계관 해석");
    expect(result.value?.text).toContain("좋은 글");
    expect(result.value?.tags).toHaveLength(5);
    expect(result.value?.kind).toBe("theory");
  });

  it("잘못된 scope와 빈 본문을 거부한다", () => {
    expect(validatePostInput({ scope: "bad" }).error).toBeTruthy();
    expect(
      validatePostInput({
        scope: "title",
        targetId: "t1",
        targetLabel: "작품",
        title: "a",
        text: "",
      }).error
    ).toBeTruthy();
  });

  it("답글은 1자 이상 700자 이하만 허용한다", () => {
    expect(validateReplyText("").error).toBeTruthy();
    expect(validateReplyText("좋아요").text).toBe("좋아요");
    expect(validateReplyText("x".repeat(900)).text).toHaveLength(700);
  });

  it("커뮤니티 스코프 파싱은 허용값만 통과한다", () => {
    expect(parseCommunityScope("title")).toBe("title");
    expect(parseCommunityScope("all")).toBeNull();
    expect(parseCommunityScopeWithAll("all")).toBe("all");
    expect(parseCommunityScopeWithAll("bad")).toBe("all");
  });

  it("커뮤니티 정렬 파싱은 알 수 없는 값은 인기순으로 정규화한다", () => {
    expect(parseCommunitySort("recent")).toBe("recent");
    expect(parseCommunitySort("popular")).toBe("popular");
    expect(parseCommunitySort("invalid")).toBe("popular");
  });

  it("커뮤니티 스코프 상세 라우트 링크를 안전하게 생성한다", () => {
    expect(getCommunityScopeTargetLink("title", "nw-183559", "작품명")).toBe("/title/nw-183559");
    expect(getCommunityScopeTargetLink("author", "unused", "김초월 작가")).toBe("/author/김초월%20작가");
    expect(getCommunityScopeTargetLink("pencafe", "unused", "번역자_카페")).toBe("/pencafe/%EB%B2%88%EC%97%AD%EC%9E%90_%EC%B9%B4%ED%8E%98");
  });
});
