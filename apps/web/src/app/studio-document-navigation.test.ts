import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { shouldUseStudioDocumentNavigation } from "./studio-document-navigation";

describe("Studio document navigation boundary", () => {
  it.each([
    ["https://toonstudio.cloud/market", "/studio"],
    ["https://toonstudio.cloud/community", "/studio/work/work-1/canvas?tool=brush"],
    ["https://toonstudio.cloud/studio", "/market"],
    ["https://toonstudio.cloud/studio/work/work-1/canvas", "/community"],
  ])("uses one document navigation from %s to %s", (currentHref, targetHref) => {
    expect(shouldUseStudioDocumentNavigation({ currentHref, targetHref })).toBe(true);
  });

  it.each([
    ["https://toonstudio.cloud/market", "/community"],
    ["https://toonstudio.cloud/studio", "/studio/work/work-1/canvas"],
    ["https://toonstudio.cloud/studio/work/work-1/canvas", "/studio/work/work-2/canvas"],
  ])("keeps same-boundary navigation as SPA from %s to %s", (currentHref, targetHref) => {
    expect(shouldUseStudioDocumentNavigation({ currentHref, targetHref })).toBe(false);
  });

  it("does not hijack external, modified, download, disabled, or new-tab links", () => {
    const base = {
      currentHref: "https://toonstudio.cloud/market",
      targetHref: "https://toonstudio.cloud/studio",
    } as const;

    expect(shouldUseStudioDocumentNavigation({
      ...base,
      targetHref: "https://example.com/studio",
    })).toBe(false);
    expect(shouldUseStudioDocumentNavigation({ ...base, metaKey: true })).toBe(false);
    expect(shouldUseStudioDocumentNavigation({ ...base, button: 1 })).toBe(false);
    expect(shouldUseStudioDocumentNavigation({ ...base, download: true })).toBe(false);
    expect(shouldUseStudioDocumentNavigation({ ...base, disabled: true })).toBe(false);
    expect(shouldUseStudioDocumentNavigation({ ...base, anchorTarget: "_blank" })).toBe(false);
  });

  it("installs the boundary bridge inside the BrowserRouter-owned app content", () => {
    const appSource = readFileSync(
      path.resolve(process.cwd(), "apps/web/src/app/App.tsx"),
      "utf8",
    );

    expect(appSource).toContain("installStudioDocumentNavigationBridge");
    expect(appSource).toContain("<StudioDocumentNavigationBridge />");
  });
});
