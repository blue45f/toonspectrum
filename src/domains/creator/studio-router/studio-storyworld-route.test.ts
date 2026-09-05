import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { resolveStudioRoute, studioRouteOwnsDocumentTitle } from "./studio-route-manifest";

describe("Storyworld route integration", () => {
  it.each([
    ["/studio/storyworld", "", "/studio/storyworld", "/studio/draft/storyworld", null, null],
    ["/studio/storyworld/", "", "/studio/storyworld", "/studio/draft/storyworld", null, null],
    ["/studio/storyworld", "?id=work-1&room=team-a", "/studio/work/work-1/storyworld?room=team-a", "/studio/work:work-1/storyworld", "work-1", null],
    ["/studio/work/work-1/storyworld", "", "/studio/work/work-1/storyworld", "/studio/work:work-1/storyworld", "work-1", null],
    ["/studio/remix/source-1/storyworld", "?room=team-a", "/studio/remix/source-1/storyworld?room=team-a", "/studio/remix:source-1/storyworld", null, "source-1"],
    ["/studio/storyworld", "?remix=source-1", "/studio/remix/source-1/storyworld", "/studio/remix:source-1/storyworld", null, "source-1"],
  ] as const)("canonicalizes %s%s without borrowing another document", (pathname, search, canonicalHref, lifecycleKey, workId, remixSourceWorkId) => {
    expect(resolveStudioRoute({ pathname, search })).toMatchObject({ kind: "storyworld", canonicalHref, lifecycleKey, workId, remixSourceWorkId });
  });

  it.each([
    ["/studio/storyworld", "?mode=upload"],
    ["/studio/storyworld", "?id=work-1&remix=source-1"],
    ["/studio/work/work-1/storyworld", "?id=work-2"],
    ["/studio/remix/source-1/storyworld", "?remix=source-2"],
    ["/studio/storyworld/extra", ""],
    // NOTE: "/studio/work/%2F/storyworld" is deliberately absent. An encoded slash in the
    // work identity is accepted router-wide on main - "/studio/work/%2F/canvas" resolves to
    // "editor" - because hasUnsafeStudioIdentityCharacter rejects backslashes and control
    // characters but not "/". Asserting it here would make Storyworld stricter than every
    // sibling route. If that input should be rejected, it belongs in the shared workspace
    // identity parser, not in this one route.
  ] as const)("rejects conflicting or invalid Storyworld routes %s%s", (pathname, search) => {
    expect(resolveStudioRoute({ pathname, search }).kind).toBe("invalid");
  });

  it("owns its title and has distinct document lifetimes", () => {
    expect(studioRouteOwnsDocumentTitle({ pathname: "/studio/storyworld" })).toBe(true);
    const first = resolveStudioRoute({ pathname: "/studio/work/first/storyworld" });
    const second = resolveStudioRoute({ pathname: "/studio/work/second/storyworld" });
    expect(first.lifecycleKey).not.toBe(second.lifecycleKey);
  });

  it("keys the Storyworld surface by document lifecycle so routes do not share state", () => {
    const router = readFileSync(new URL("./StudioRouter.tsx", import.meta.url), "utf8");
    expect(router).toContain("key={resolution.lifecycleKey}");
  });
});
