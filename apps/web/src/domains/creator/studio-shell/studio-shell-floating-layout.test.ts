import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_SHELL_FLOATING_VISIBILITY,
  STUDIO_SHELL_FLOATING_SURFACES,
  STUDIO_SHELL_FLOATING_SURFACE_IDS,
  STUDIO_SHELL_FLOATING_VISIBILITY_IDS,
  applyStudioShellFloatingPreset,
  encodeStudioShellFloatingVisibility,
  hideAllStudioShellFloatingSurfaces,
  isStudioShellFloatingSurfaceVisible,
  normalizeStudioShellFloatingVisibility,
  setStudioShellFloatingSurfaceVisible,
  studioShellFloatingSurfaceById,
  studioShellFloatingVisibilityEqual,
} from "./studio-shell-floating-layout";

describe("studio shell floating layout registry", () => {
  it("keeps selectors and surface IDs unique while sharing the document-tools visibility group", () => {
    expect(STUDIO_SHELL_FLOATING_SURFACES.map(({ id }) => id))
      .toEqual(STUDIO_SHELL_FLOATING_SURFACE_IDS);
    expect(new Set(STUDIO_SHELL_FLOATING_SURFACES.map(({ selector }) => selector)).size)
      .toBe(STUDIO_SHELL_FLOATING_SURFACES.length);
    expect(STUDIO_SHELL_FLOATING_SURFACES.filter(
      ({ visibilityId }) => visibilityId === "document-tools",
    ).map(({ id }) => id)).toEqual(["document-tools", "document-tools-panel"]);
    expect(STUDIO_SHELL_FLOATING_SURFACES.filter(
      ({ visibilityId }) => visibilityId === "drawing-input",
    ).map(({ id }) => id)).toEqual(["drawing-input", "drawing-input-panel"]);
    expect(STUDIO_SHELL_FLOATING_SURFACES.every(
      ({ defaultLayout }) => defaultLayout.version === 2 && Object.isFrozen(defaultLayout),
    )).toBe(true);
  });

  it("rebuilds an exact ordered allowlist from untrusted visibility input", () => {
    const state = normalizeStudioShellFloatingVisibility({
      version: 1,
      hidden: [
        "collaboration",
        "unknown",
        "document-tools",
        "collaboration",
        42,
      ],
      token: "must-drop",
    });

    expect(state).toEqual({
      version: 1,
      hidden: ["document-tools", "collaboration"],
    });
    expect(Object.keys(state)).toEqual(["version", "hidden"]);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.hidden)).toBe(true);
    expect(JSON.parse(encodeStudioShellFloatingVisibility(state))).toEqual(state);
  });

  it("falls back safely for malformed or future-version snapshots", () => {
    const fallback = applyStudioShellFloatingPreset("production");
    expect(normalizeStudioShellFloatingVisibility(null, fallback)).toEqual(fallback);
    expect(normalizeStudioShellFloatingVisibility({ version: 99 }, fallback)).toEqual(fallback);
    expect(normalizeStudioShellFloatingVisibility({ version: 1, hidden: "bad" }))
      .toEqual(DEFAULT_STUDIO_SHELL_FLOATING_VISIBILITY);
  });

  it("toggles visibility immutably and compares normalized values", () => {
    const hidden = setStudioShellFloatingSurfaceVisible(
      DEFAULT_STUDIO_SHELL_FLOATING_VISIBILITY,
      "collaboration",
      false,
    );
    const restored = setStudioShellFloatingSurfaceVisible(
      hidden,
      "collaboration",
      true,
    );

    expect(isStudioShellFloatingSurfaceVisible(hidden, "collaboration")).toBe(false);
    expect(DEFAULT_STUDIO_SHELL_FLOATING_VISIBILITY.hidden).toEqual([]);
    expect(studioShellFloatingVisibilityEqual(
      restored,
      DEFAULT_STUDIO_SHELL_FLOATING_VISIBILITY,
    )).toBe(true);
  });

  it("provides deterministic presets and a recoverable hide-all state", () => {
    expect(applyStudioShellFloatingPreset("canvas-focus").hidden).toEqual([
      "document-tools",
      "draft-save-status",
      "drawing-input",
      "offline-readiness",
      "collaboration",
    ]);
    expect(applyStudioShellFloatingPreset("production").hidden)
      .toEqual(["collaboration"]);
    expect(applyStudioShellFloatingPreset("collaboration").hidden)
      .toEqual(["drawing-input", "offline-readiness"]);
    expect(hideAllStudioShellFloatingSurfaces().hidden)
      .toEqual(STUDIO_SHELL_FLOATING_VISIBILITY_IDS);
    expect(applyStudioShellFloatingPreset("all"))
      .toBe(DEFAULT_STUDIO_SHELL_FLOATING_VISIBILITY);
  });

  it("resolves known surfaces and rejects unknown runtime IDs", () => {
    expect(studioShellFloatingSurfaceById("offline-readiness").safetyBehavior)
      .toMatch(/자동으로 표시/);
    expect(studioShellFloatingSurfaceById("draft-save-status").safetyBehavior)
      .toMatch(/저장 실패/);
    expect(() => studioShellFloatingSurfaceById("missing" as never))
      .toThrowError(/Unknown Studio shell floating surface/);
  });
});
