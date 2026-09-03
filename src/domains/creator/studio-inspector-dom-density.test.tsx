// @vitest-environment jsdom

/**
 * DOM-measured inspector density (UX 감사 2026-09-02 §5.4 / §8 P0-1).
 *
 * `studio-inspector-density.test.ts` checks the *declared* budget. This file mounts the
 * surfaces that can be rendered in isolation and counts what is actually interactive, so
 * a control that is rendered outside the declaration (the way the geometry grid used to
 * be) fails here even when the table still adds up.
 *
 * Surfaces mounted: the navigator chrome in its representative states and the selection
 * geometry panel folded / unfolded, single / multi. Full-inspector states (text, balloon,
 * image, frame, drawing) need the page model and are measured by
 * `scripts/verify-studio-inspector-walkthrough.mts` with the same helper.
 */

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveStudioFigmaSelectionLayoutMetrics } from "./studio-figma-selection-ux";
import { STUDIO_INSPECTOR_DEFAULT_BUDGET } from "./studio-inspector-density";
import {
  auditStudioInspectorDensity,
  countStudioInspectorControls,
} from "./studio-inspector-dom-density";
import { resetStudioInspectorSectionStateCache } from "./studio-inspector-section-state";
import { createStudioInspectorTabA11y } from "./studio-inspector-tab-a11y";
import { StudioFigmaDesignPanel } from "./StudioFigmaDesignPanel";
import { StudioInspectorNavigator } from "./StudioInspectorNavigator";

import type { El, ImageEl } from "./studio-element-model";
import type { StudioInspectorLayout } from "./studio-inspector-layout";

const TAB_A11Y = createStudioInspectorTabA11y("density");

beforeEach(() => {
  globalThis.localStorage?.clear();
  resetStudioInspectorSectionStateCache();
});
afterEach(cleanup);

function image(id: string, overrides: Partial<ImageEl> = {}): ImageEl {
  return {
    id,
    type: "image",
    src: "data:image/png;base64,AA==",
    x: 10,
    y: 20,
    width: 640,
    height: 320,
    ...overrides,
  } as ImageEl;
}

function mountGeometry(elements: readonly El[]) {
  const view = render(
    <StudioFigmaDesignPanel
      metrics={resolveStudioFigmaSelectionLayoutMetrics(elements)}
      onChange={() => undefined}
      onFlipHorizontal={() => undefined}
      onFlipVertical={() => undefined}
      onZoomToSelection={() => undefined}
    />,
  );
  return view.container;
}

function mountNavigator(
  layout: StudioInspectorLayout,
  overrides: Partial<React.ComponentProps<typeof StudioInspectorNavigator>> = {},
) {
  const view = render(
    <StudioInspectorNavigator
      layout={layout}
      tabA11y={TAB_A11Y}
      selectedType={null}
      selectionLabel={null}
      drawing={false}
      layerCount={3}
      onChange={() => undefined}
      {...overrides}
    />,
  );
  return view.container;
}

describe("selection geometry panel — measured on the DOM", () => {
  it("shows one essential control and a summary while folded (감사 §5.7)", () => {
    const root = mountGeometry([image("a")]);
    const count = countStudioInspectorControls(root);

    expect(count.essential).toBe(1);
    expect(count.advanced).toBe(0);
    expect(count.chrome).toBe(1);
    expect(count.unclassified).toBe(0);
    expect(root.querySelector('[data-studio-selection-geometry-summary="true"]')?.textContent)
      .toBe("X 10 · Y 20 · 640×320 · 0°");
    expect(auditStudioInspectorDensity(root).violations).toEqual([]);
  });

  it("keeps the unfolded grid inside the default budget and inside a disclosure", () => {
    const root = mountGeometry([image("a")]);
    fireEvent.click(root.querySelector('[data-studio-selection-geometry-toggle="true"]')!);
    const audit = auditStudioInspectorDensity(root);

    expect(audit.count.essential).toBe(1);
    expect(audit.count.advanced).toBe(8);
    expect(audit.count.properties).toBeLessThanOrEqual(STUDIO_INSPECTOR_DEFAULT_BUDGET.max);
    expect(audit.violations).toEqual([]);
  });

  it("names the reason on every inert field of a multi-selection", () => {
    const root = mountGeometry([image("a"), image("b", { x: 80, y: 60 })]);
    fireEvent.click(root.querySelector('[data-studio-selection-geometry-toggle="true"]')!);
    const audit = auditStudioInspectorDensity(root);

    expect(audit.violations.filter((v) => v.kind === "disabled-without-reason")).toEqual([]);
    expect(root.querySelector('[data-studio-selection-geometry-summary="true"]')?.textContent)
      .toBe("2개 · X 10 · Y 20");
  });

  it("never exposes the same canonical control twice", () => {
    const root = mountGeometry([image("a")]);
    fireEvent.click(root.querySelector('[data-studio-selection-geometry-toggle="true"]')!);
    expect(
      auditStudioInspectorDensity(root).violations.filter((v) => v.kind === "duplicate-control-id"),
    ).toEqual([]);
  });
});

describe("navigator chrome — measured on the DOM", () => {
  const STATES: readonly [string, StudioInspectorLayout, Partial<React.ComponentProps<typeof StudioInspectorNavigator>>][] = [
    ["empty canvas", { primary: "properties", image: "quick", document: "canvas" }, {}],
    ["pen tool", { primary: "properties", image: "quick", document: "canvas" }, { drawing: true }],
    [
      "image selected",
      { primary: "properties", image: "quick", document: "canvas" },
      { selectedType: "image", selectionLabel: "이미지", selectionCount: 1 },
    ],
    [
      "text selected on layers tab",
      { primary: "layers", image: "quick", document: "canvas" },
      { selectedType: "text", selectionLabel: "텍스트", selectionCount: 1 },
    ],
    ["document settings", { primary: "document", image: "quick", document: "canvas" }, {}],
    ["publish mode", { primary: "publish", image: "quick", document: "canvas" }, {}],
    [
      "mobile sheet",
      { primary: "properties", image: "quick", document: "canvas" },
      { onRequestClose: () => undefined },
    ],
  ];

  it.each(STATES)("%s: every control is chrome, none unclassified, ≤ 12 controls", (_name, layout, overrides) => {
    const root = mountNavigator(layout, overrides);
    const audit = auditStudioInspectorDensity(root);

    expect(audit.count.unclassified).toBe(0);
    expect(audit.count.properties).toBe(0);
    // 3 tabs + up to 5 image tabs or 3 document tabs + search/close/CTA/back.
    expect(audit.count.chrome).toBeLessThanOrEqual(12);
    expect(audit.violations).toEqual([]);
  });

  it("caps the top chrome to one tab strip plus one sub-strip", () => {
    const root = mountNavigator(
      { primary: "properties", image: "quick", document: "canvas" },
      { selectedType: "image", selectionLabel: "이미지", selectionCount: 1 },
    );
    expect(root.querySelectorAll('[role="tablist"]')).toHaveLength(2);
    // 감사 §5.5: 전역 검색과 별개의 인스펙터 내부 검색창은 더 이상 없다.
    expect(root.querySelector('input[type="search"]')).toBeNull();
  });
});
