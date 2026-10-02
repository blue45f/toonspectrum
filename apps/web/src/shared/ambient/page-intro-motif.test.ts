import { describe, expect, it } from "vitest";

import { resolvePageIntroMotif } from "./page-intro-motif";

describe("resolvePageIntroMotif", () => {
  it("담당 영역 경로에 맞는 모티프를 돌려준다", () => {
    expect(resolvePageIntroMotif("/production")).toBe("pipeline");
    expect(resolvePageIntroMotif("/production/projects/demo/overview")).toBe("pipeline");
    expect(resolvePageIntroMotif("/studio/p/demo/overview")).toBe("frames");
    expect(resolvePageIntroMotif("/collaborate")).toBe("gather");
    expect(resolvePageIntroMotif("/collaborate/positions")).toBe("gather");
    expect(resolvePageIntroMotif("/team/people")).toBe("workspace");
    expect(resolvePageIntroMotif("/team/recruiting")).toBe("workspace");
    expect(resolvePageIntroMotif("/messages")).toBe("bubbles");
    expect(resolvePageIntroMotif("/messages/thread-1")).toBe("bubbles");
  });

  it("담당 영역 밖 경로는 null이다", () => {
    expect(resolvePageIntroMotif("/")).toBeNull();
    expect(resolvePageIntroMotif("/studio/assets")).toBeNull();
    expect(resolvePageIntroMotif("/market")).toBeNull();
    expect(resolvePageIntroMotif("/community")).toBeNull();
  });

  it("대소문자와 끝 슬래시를 무시한다", () => {
    expect(resolvePageIntroMotif("/Production/")).toBe("pipeline");
    expect(resolvePageIntroMotif("/MESSAGES/")).toBe("bubbles");
  });
});
