// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  openStudioDocumentWorkspace,
  studioDocumentWindowFeatures,
  studioDocumentWindowName,
} from "./studio-document-window-launcher";

function popup() {
  const replace = vi.fn();
  const focus = vi.fn();
  const close = vi.fn();
  const value = {
    opener: { unsafe: true },
    location: { href: "about:blank", replace },
    focus,
    close,
  } as unknown as Window;
  return { value, replace, focus, close };
}

describe("Studio document window launcher", () => {
  it("creates stable document-scoped names without exposing raw identities", () => {
    const name = studioDocumentWindowName(
      "project:secret-project:document:secret-document",
      "review",
    );

    expect(name).toMatch(/^toonspectrum-studio-/u);
    expect(name).toContain("-review");
    expect(name).not.toContain("secret-project");
    expect(name).not.toContain("secret-document");
  });

  it("tiles companion windows into predictable screen cells", () => {
    const first = studioDocumentWindowFeatures({
      index: 0,
      total: 2,
      screen: { availWidth: 1200, availHeight: 800, availLeft: 10, availTop: 20 },
    });
    const second = studioDocumentWindowFeatures({
      index: 1,
      total: 2,
      screen: { availWidth: 1200, availHeight: 800, availLeft: 10, availTop: 20 },
    });

    expect(first).toContain("width=582");
    expect(first).toContain("height=776");
    expect(first).toContain("left=22");
    expect(first).toContain("top=32");
    expect(second).toContain("left=616");
    expect(second).toContain("resizable=yes");
  });

  it("reserves a tab, severs its opener, navigates and focuses it", () => {
    const next = popup();
    const openWindow = vi.fn(() => next.value);

    expect(openStudioDocumentWorkspace({
      href: "/studio/p/project-1/d/document-1?workspace=review",
      documentKey: "project:project-1:document:document-1",
      workspace: "review",
      mode: "tab",
      openWindow,
    })).toBe("opened");

    expect(openWindow).toHaveBeenCalledWith("", "_blank", "");
    expect(next.value.opener).toBeNull();
    expect(next.replace).toHaveBeenCalledWith(
      "/studio/p/project-1/d/document-1?workspace=review",
    );
    expect(next.focus).toHaveBeenCalledOnce();
  });

  it("opens a named reusable window with placement features", () => {
    const next = popup();
    const openWindow = vi.fn(() => next.value);

    expect(openStudioDocumentWorkspace({
      href: "/studio/p/project-1/d/document-1?workspace=3d",
      documentKey: "project:project-1:document:document-1",
      workspace: "3d",
      mode: "window",
      index: 1,
      total: 2,
      screen: { availWidth: 1200, availHeight: 800 },
      openWindow,
    })).toBe("opened");

    expect(openWindow).toHaveBeenCalledWith(
      "",
      expect.stringMatching(/^toonspectrum-studio-.+-3d$/u),
      expect.stringContaining("popup=yes"),
    );
    expect(next.replace).toHaveBeenCalledWith(
      "/studio/p/project-1/d/document-1?workspace=3d",
    );
  });

  it("fails closed for blocked popups and non-Studio destinations", () => {
    const openWindow = vi.fn(() => null);

    expect(openStudioDocumentWorkspace({
      href: "/studio/p/project-1/d/document-1?workspace=draw",
      documentKey: "project:project-1:document:document-1",
      workspace: "draw",
      mode: "tab",
      openWindow,
    })).toBe("blocked");
    expect(openStudioDocumentWorkspace({
      href: "https://evil.example/studio/steal",
      documentKey: "project:project-1:document:document-1",
      workspace: "draw",
      mode: "tab",
      openWindow,
    })).toBe("blocked");
    expect(openWindow).toHaveBeenCalledOnce();
  });
});
