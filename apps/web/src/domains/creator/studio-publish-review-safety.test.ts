import { describe, expect, it } from "vitest";

import {
  resolveStudioPublishAudienceReview,
  resolveStudioPublishEnvironment,
  resolveStudioPublisherIdentity,
  studioPublishEnvironmentLabel,
} from "./studio-publish-review-safety";

describe("Studio publish review safety", () => {
  it("normalizes the exact publishing identity and elevated role", () => {
    expect(resolveStudioPublisherIdentity({
      id: " user-1 ",
      name: " 김희준 ",
      email: " blue45f@gmail.com ",
      role: " ADMIN ",
      image: " https://example.test/avatar.png ",
    })).toEqual({
      id: "user-1",
      name: "김희준",
      email: "blue45f@gmail.com",
      image: "https://example.test/avatar.png",
      role: "admin",
      roleLabel: "관리자",
      elevated: true,
    });
  });

  it("falls back to a useful identity without inventing authentication", () => {
    expect(resolveStudioPublisherIdentity({ email: "artist@example.test" })).toMatchObject({
      id: null,
      name: "artist@example.test",
      email: "artist@example.test",
      role: "user",
      roleLabel: "일반 사용자",
      elevated: false,
    });
    expect(resolveStudioPublisherIdentity(null).id).toBeNull();
  });

  it("separates production, preview, local and unknown hosts", () => {
    expect(resolveStudioPublishEnvironment("www.toonstudio.cloud")).toBe("production");
    expect(resolveStudioPublishEnvironment("feature-123.pages.dev")).toBe("preview");
    expect(resolveStudioPublishEnvironment("localhost")).toBe("local");
    expect(resolveStudioPublishEnvironment("[::1]")).toBe("local");
    expect(resolveStudioPublishEnvironment("tempui-MacBookPro.local")).toBe("local");
    expect(resolveStudioPublishEnvironment("")).toBe("unknown");
    expect(studioPublishEnvironmentLabel("production")).toBe("운영 환경");
  });

  it("describes anonymous access without overstating discoverability", () => {
    expect(resolveStudioPublishAudienceReview("public", "anonymous")).toMatchObject({
      anonymousAccessible: true,
      discoverable: true,
    });
    expect(resolveStudioPublishAudienceReview("unlisted", "anonymous")).toMatchObject({
      anonymousAccessible: true,
      discoverable: false,
    });
    expect(resolveStudioPublishAudienceReview("private", "anonymous")).toMatchObject({
      anonymousAccessible: false,
      discoverable: false,
    });
  });
});
