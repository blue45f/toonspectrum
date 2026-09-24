import { describe, expect, it } from "vitest";

import { createDefaultCreatorPublicationDirective } from "@/shared/lib/creator-publication-contract";

import {
  buildStudioPublishResultHref,
  parseStudioPublishResultKind,
  resolveStudioPublishResultKind,
  studioPublishResultCopy,
} from "./studio-publish-result";

function directive(
  patch: Partial<ReturnType<typeof createDefaultCreatorPublicationDirective>> = {},
) {
  return {
    ...createDefaultCreatorPublicationDirective("Asia/Seoul"),
    ...patch,
  };
}

describe("Studio publish result", () => {
  it("classifies publish outcomes without claiming scheduled or private work is public", () => {
    expect(resolveStudioPublishResultKind("draft", "draft", directive())).toBe("draft");
    expect(
      resolveStudioPublishResultKind(
        "publish",
        "draft",
        directive({ visibility: "private" }),
      ),
    ).toBe("private");
    expect(
      resolveStudioPublishResultKind(
        "publish",
        "draft",
        directive({
          mode: "scheduled",
          scheduledAt: "2026-09-25T02:00:00.000Z",
        }),
      ),
    ).toBe("scheduled");
    expect(resolveStudioPublishResultKind("publish", "published", directive())).toBe(
      "published",
    );
  });

  it("parses only explicit result tokens", () => {
    expect(parseStudioPublishResultKind("published")).toBe("published");
    expect(parseStudioPublishResultKind("private")).toBe("private");
    expect(parseStudioPublishResultKind("success")).toBeNull();
    expect(parseStudioPublishResultKind(null)).toBeNull();
  });

  it("builds a canonical, encoded publish workspace URL", () => {
    expect(buildStudioPublishResultHref("work / 한글", "published")).toBe(
      "/studio/work/work%20%2F%20%ED%95%9C%EA%B8%80/publish?result=published",
    );
    expect(buildStudioPublishResultHref("work-1")).toBe(
      "/studio/work/work-1/publish",
    );
  });

  it("only offers a reader action after a real publication", () => {
    expect(studioPublishResultCopy("published").readerActionLabel).toBe("독자 화면 열기");
    expect(studioPublishResultCopy("scheduled").readerActionLabel).toBeNull();
    expect(studioPublishResultCopy("private").readerActionLabel).toBeNull();
    expect(studioPublishResultCopy("draft").readerActionLabel).toBeNull();
  });
});
