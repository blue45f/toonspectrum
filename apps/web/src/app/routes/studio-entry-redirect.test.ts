import { describe, expect, it } from "vitest";
import { legacyStudioEditorHref } from "./studio-entry-redirect";
import { STUDIO_DRAFT_CANVAS_PATHNAME } from "@/domains/creator/studio-workspace-route";

describe("market editor entry", () => {
  it.each([
    "?installMarketResource=release-1&assetMarket=community",
    "?assetMarket=community&installMarketResource=release-2",
    "?tool=draw", "?id=existing-work&mode=edit",
  ])("preserves the complete editor query: %s", search => {
    expect(legacyStudioEditorHref("/studio", search)).toBe(`${STUDIO_DRAFT_CANVAS_PATHNAME}${search}`);
  });
  it.each(["", "?utm_source=market", "?assetMarket=community"])("does not create an editor from unrelated home state: %s", search => {
    expect(legacyStudioEditorHref("/studio", search)).toBeNull();
  });
  it.each(["/market", "/studio/canvas", "/studio/work/existing"])("preserves non-home routes: %s", pathname => {
    expect(legacyStudioEditorHref(pathname, "?installMarketResource=release-1")).toBeNull();
  });
});
