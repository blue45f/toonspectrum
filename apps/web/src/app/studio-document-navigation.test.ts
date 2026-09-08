// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  installStudioDocumentNavigationBridge,
  shouldUseStudioDocumentNavigation,
} from "./studio-document-navigation";

afterEach(() => {
  document.body.replaceChildren();
});

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

  it("does not hijack external, modified, download, disabled, new-tab, or invalid links", () => {
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
    expect(shouldUseStudioDocumentNavigation({ ...base, targetHref: "::invalid::" })).toBe(false);
  });

  it("forces an ordinary same-tab boundary click into one document navigation", () => {
    const assign = vi.fn();
    const removeBridge = installStudioDocumentNavigationBridge(document, {
      href: "https://toonstudio.cloud/community",
      assign,
    });
    const anchor = document.createElement("a");
    anchor.href = "https://toonstudio.cloud/studio/work/work-1/canvas";
    document.body.append(anchor);

    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    expect(anchor.dispatchEvent(event)).toBe(false);
    expect(assign).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledWith(anchor.href);

    removeBridge();
  });

  it("honors target/component click guards before forcing document navigation", () => {
    const assign = vi.fn();
    const removeBridge = installStudioDocumentNavigationBridge(document, {
      href: "https://toonstudio.cloud/music",
      assign,
    });
    const anchor = document.createElement("a");
    anchor.href = "https://toonstudio.cloud/studio";
    anchor.addEventListener("click", (event) => event.preventDefault());
    document.body.append(anchor);

    anchor.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    }));
    expect(assign).not.toHaveBeenCalled();

    removeBridge();
  });

  it("ignores non-anchor targets and removes the bridge cleanly", () => {
    const assign = vi.fn();
    const removeBridge = installStudioDocumentNavigationBridge(document, {
      href: "https://toonstudio.cloud/community",
      assign,
    });
    const button = document.createElement("button");
    document.body.append(button);
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(assign).not.toHaveBeenCalled();

    const anchor = document.createElement("a");
    anchor.href = "https://toonstudio.cloud/studio";
    document.body.append(anchor);
    removeBridge();
    anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(assign).not.toHaveBeenCalled();
  });

  it("waits for component click guards before forcing document navigation", () => {
    const bridgeSource = readFileSync(
      path.resolve(process.cwd(), "apps/web/src/app/studio-document-navigation.ts"),
      "utf8",
    );

    expect(bridgeSource).toContain('addEventListener("click", handleClick)');
    expect(bridgeSource).toContain('removeEventListener("click", handleClick)');
    expect(bridgeSource).not.toContain('addEventListener("click", handleClick, true)');
    expect(bridgeSource).not.toContain("event.stopPropagation()");
  });

  it("installs the boundary bridge inside the BrowserRouter-owned app content", () => {
    const appSource = readFileSync(
      path.resolve(process.cwd(), "apps/web/src/app/App.tsx"),
      "utf8",
    );

    expect(appSource).toContain("installStudioDocumentNavigationBridge");
    expect(appSource).toContain("<StudioDocumentNavigationBridge />");
    expect(appSource).toContain("<StudioRouterDocumentNavigationBoundary>");
  });
});
