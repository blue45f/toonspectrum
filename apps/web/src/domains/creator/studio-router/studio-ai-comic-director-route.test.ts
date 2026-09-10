import { describe, expect, it } from "vitest";

import { resolveStudioRoute } from "./studio-route-manifest";

describe("AI Comic Director composition route", () => {
  it("keeps draft session identity in the path", () => {
    const resolved = resolveStudioRoute({
      pathname: "/studio/compose/session-1",
      search: "?from=launcher",
    });

    expect(resolved).toMatchObject({
      kind: "composition",
      sessionId: "session-1",
      workId: null,
      remixSourceWorkId: null,
      canonicalPathname: "/studio/compose/session-1",
      canonicalHref: "/studio/compose/session-1?from=launcher",
      editorHref: "/studio",
    });
    expect(resolved.lifecycleKey).toContain("composition:session-1");
  });

  it("keeps work and session identities independent", () => {
    const resolved = resolveStudioRoute({
      pathname: "/studio/work/work-42/compose/session-9",
      search: "?id=legacy&mode=comic&focus=quality",
    });

    expect(resolved).toMatchObject({
      kind: "composition",
      sessionId: "session-9",
      workId: "work-42",
      remixSourceWorkId: null,
      canonicalPathname: "/studio/work/work-42/compose/session-9",
      canonicalHref: "/studio/work/work-42/compose/session-9?focus=quality",
      editorHref: "/studio/work/work-42/canvas",
    });
    expect(resolved.lifecycleKey).toBe(
      "/studio/work:work-42/composition:session-9",
    );
  });

  it("keeps remix identity and rejects malformed session ids", () => {
    const remix = resolveStudioRoute({
      pathname: "/studio/remix/source-7/compose/session-2",
    });
    expect(remix).toMatchObject({
      kind: "composition",
      sessionId: "session-2",
      workId: null,
      remixSourceWorkId: "source-7",
      editorHref: "/studio/remix/source-7/canvas",
    });

    expect(resolveStudioRoute({ pathname: "/studio/compose/%2Fescape" })).toMatchObject({
      kind: "invalid",
      errorCode: "invalid-path",
    });
  });
});
