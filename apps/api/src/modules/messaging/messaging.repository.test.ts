import { describe, expect, it } from "vitest";

import {
  assembleReportEvidence,
  buildDirectMessageKey,
  messageTypeForContext,
  threadContextForViewer,
} from "./messaging.repository";

describe("buildDirectMessageKey", () => {
  it("is stable regardless of member order", () => {
    expect(buildDirectMessageKey("member-a", "member-b")).toBe(
      buildDirectMessageKey("member-b", "member-a"),
    );
  });

  it("returns a non-reversible SHA-256 key", () => {
    expect(buildDirectMessageKey("member-a", "member-b")).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });

  it("keeps ambiguous concatenations distinct", () => {
    expect(buildDirectMessageKey("ab", "c")).not.toBe(
      buildDirectMessageKey("a", "bc"),
    );
  });
});


describe("message context projection", () => {
  const otherUser = {
    id: "member-b",
    name: "회원 B",
    image: null,
    avatar: null,
  };

  it("uses card message types only for shareable work contexts", () => {
    expect(messageTypeForContext("profile")).toBe("text");
    expect(messageTypeForContext("general")).toBe("text");
    expect(messageTypeForContext("work")).toBe("work_card");
    expect(messageTypeForContext("project")).toBe("project_card");
  });

  it("projects profile context to the other member for each viewer", () => {
    expect(
      threadContextForViewer("profile", "member-a", "회원 A", otherUser),
    ).toEqual({
      type: "profile",
      id: "member-b",
      label: "회원 B",
      href: "/u/member-b",
    });
  });

  it("keeps server-resolved work context stable", () => {
    expect(
      threadContextForViewer("work", "work-1", "작품 1", otherUser),
    ).toEqual({
      type: "work",
      id: "work-1",
      label: "작품 1",
      href: "/showcase/work/work-1",
    });
  });
});

describe("assembleReportEvidence", () => {
  it("always places the reported target between nearest before and after messages", () => {
    expect(
      assembleReportEvidence(["before-2", "before-1"], "target", ["after-1", "after-2"]),
    ).toEqual(["before-1", "before-2", "target", "after-1", "after-2"]);
  });
});
