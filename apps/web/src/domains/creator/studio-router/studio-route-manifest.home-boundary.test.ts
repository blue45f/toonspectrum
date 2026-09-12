import { describe, expect, it } from "vitest";

import { parseStudioWorkspaceRoute } from "../studio-workspace-route";

import { resolveStudioRoute } from "./studio-route-manifest";

describe("Studio home and editor route boundary", () => {
  it.each(["", "?utm_source=campaign"])("keeps the home page outside the editor for %s", (search) => {
    expect(parseStudioWorkspaceRoute({ pathname: "/studio", search })).toMatchObject({ valid: false });
    expect(resolveStudioRoute({ pathname: "/studio", search })).toMatchObject({
      kind: "invalid", ownsDocumentTitle: false,
    });
  });

  it.each(["projects", "review", "versions", "present", "share", "join"])(
    "resolves the draft %s scope through the explicit canvas, not the home page", (surface) => {
      for (const search of ["", "?scope=draft"]) {
        expect(resolveStudioRoute({ pathname: `/studio/${surface}`, search })).toMatchObject({
          kind: "production", surface, editorHref: "/studio/canvas", lifecycleKey: `/studio/${surface}`,
        });
      }
    },
  );

  it.each(["work", "remix"])("preserves an opaque legacy %s identity", (scope) => {
    const identity = "회차 / A:100% ?#";
    const search = new URLSearchParams({ [scope === "work" ? "id" : "remix"]: identity });
    expect(resolveStudioRoute({ pathname: "/studio", search })).toMatchObject({
      kind: "editor", canonicalPathname: `/studio/${scope}/${encodeURIComponent(identity)}/canvas`,
    });
  });

  it.each([
    ["/studio/publish", "publish", "/studio/publish"],
    ["/studio/upload", "publish", "/studio/publish"],
    ["/studio/storyworld", "storyworld", "/studio/storyworld"],
  ])("resolves %s without treating the home page as an editor", (pathname, kind, canonicalPathname) => {
    expect(resolveStudioRoute({ pathname })).toMatchObject({ kind, canonicalPathname });
  });

  it.each([
    ["/studio", "?id=", "invalid-work-id"],
    ["/studio", "?id=a&remix=b", "identity-conflict"],
    ["/studio", "?mode=upload&mode=upload", "invalid-mode"],
    ["/studio/share", "?scope=work:a&id=b", "identity-conflict"],
  ])("never falls back to draft for conflicting or invalid state: %s%s", (pathname, search, errorCode) => {
    expect(resolveStudioRoute({ pathname, search })).toMatchObject({ kind: "invalid", errorCode });
  });
});
