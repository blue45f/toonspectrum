import { describe, expect, it } from "vitest";

import {
  resolveStudioInspectorContextRoute,
  type StudioInspectorContextSnapshot,
} from "./studio-inspector-context-route";

import type { StudioInspectorLayout } from "./studio-inspector-layout";

const layout = (image: StudioInspectorLayout["image"]): StudioInspectorLayout => ({
  primary: "properties",
  image,
  document: "canvas",
});

const context = (
  contentMode: StudioInspectorContextSnapshot["contentMode"],
  selectedType: string | null,
): StudioInspectorContextSnapshot => ({ contentMode, selectedType });

describe("studio inspector context pin", () => {
  it("preserves the specialist image tab across selection kinds", () => {
    const current = layout("retouch");
    expect(resolveStudioInspectorContextRoute(
      current,
      context("selection", "text"),
      context("selection", "image"),
      null,
      { preserveImageSection: true },
    )).toBe(current);
  });

  it("never suppresses an explicitly activated professional tool", () => {
    expect(resolveStudioInspectorContextRoute(
      layout("mask"),
      context("selection", "text"),
      context("selection", "image"),
      "fill",
      { preserveImageSection: true },
    )).toEqual(layout("fill"));
  });
});
