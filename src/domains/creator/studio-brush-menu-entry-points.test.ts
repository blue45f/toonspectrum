/**
 * §15.3 Brush ▸ the rows must actually open something.
 *
 * A menu row is worthless if it dispatches into a handler the host never wired,
 * so this checks both ends of every new Brush row:
 *
 * 1. the row calls the contract action it claims to (handler contract), and
 * 2. StudioPage supplies that action from a function that touches the real
 *    surface — the catalogue launcher, the inspector focus bus, or the brush
 *    import input (source contract, the same technique the other StudioPage
 *    boundary tests use, because StudioPage cannot be imported in a unit test).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  STUDIO_INSPECTOR_FOCUS_TARGETS,
  requestStudioInspectorFocus,
  studioInspectorFocusTokenFor,
  subscribeStudioInspectorFocus,
} from "./studio-inspector-focus";
import { buildStudioBrushMenuItems } from "./studio-main-menu-items-brush";

import type {
  StudioMainMenuBuilderState,
  StudioMainMenuEditorActions,
  StudioMainMenuUiActions,
} from "./studio-main-menu-contract";

function pageSource(): string {
  return readFileSync(fileURLToPath(new URL("./StudioPage.tsx", import.meta.url)), "utf8");
}

function brushItems() {
  const calls: string[] = [];
  const record = (name: string) => () => {
    calls.push(name);
  };
  const ui = new Proxy({} as StudioMainMenuUiActions, {
    get: (_target, property) => record(String(property)),
  });
  const editor = new Proxy({} as StudioMainMenuEditorActions, {
    get: (_target, property) => record(String(property)),
  });
  const state = {} as StudioMainMenuBuilderState;
  return { items: buildStudioBrushMenuItems({ state, editor, ui }), calls };
}

describe("Brush menu rows dispatch into the surfaces they name", () => {
  it("routes each new row to its own host action", () => {
    const expected: Record<string, string> = {
      "preset-browser": "openBrushPresetBrowser",
      "brush-studio": "openBrushStudio",
      "natural-media": "openNaturalMediaBrushes",
      "my-brushes": "openBrushLibrary",
      "import-pack": "requestBrushPackImport",
    };
    for (const [id, action] of Object.entries(expected)) {
      const { items, calls } = brushItems();
      const item = items.find((candidate) => candidate.id === id);
      expect(item, `Brush ▸ ${id}`).toBeDefined();
      item?.onSelect();
      expect(calls, `Brush ▸ ${id}`).toEqual([action]);
    }
  });

  it("keeps every row labelled and pointed at a catalog command", () => {
    const { items } = brushItems();
    for (const item of items) {
      expect(item.label.trim(), item.id).not.toBe("");
      expect(item.commandId, item.id).toBeTruthy();
    }
    // The import row has to say which formats it takes, or artists will not try.
    const importRow = items.find((item) => item.id === "import-pack");
    for (const format of ["ABR", "MYB", "KPP"]) {
      expect(importRow?.label, format).toContain(format);
    }
  });
});

describe("StudioPage wires the Brush rows to real surfaces", () => {
  const source = pageSource();

  it("hands every contract action a dedicated handler", () => {
    for (const [action, handler] of [
      ["openBrushPresetBrowser", "openBrushPresetBrowserFromMenu"],
      ["openBrushStudio", "openBrushStudioFromMenu"],
      ["openBrushLibrary", "openBrushLibraryFromMenu"],
      ["requestBrushPackImport", "requestBrushPackImportFromMenu"],
      ["openNaturalMediaBrushes", "openNaturalMediaBrushesFromMenu"],
    ] as const) {
      expect(source, action).toContain(`${action}: studioMainMenuActions.${handler}`);
      expect(source, handler).toContain(`function ${handler}(`);
    }
  });

  it("opens the catalogue through the existing launcher path, not a new one", () => {
    const start = source.indexOf("function openBrushPresetBrowserFromMenu(");
    const body = source.slice(start, start + 900);
    expect(body).toContain("resolveBrushMenuLauncher()");
    expect(body).toContain("openBrushCatalogFromHelp(launcher)");
    // Focus must land on a live control; the menubar row is the last resort.
    expect(source).toContain('[data-studio-main-menu-trigger="brush"]');
  });

  it("reveals the inspector sections instead of only switching the route", () => {
    for (const [handler, target] of [
      ["openBrushStudioFromMenu", "tool.brush-studio"],
      ["openNaturalMediaBrushesFromMenu", "tool.brush-engines"],
      ["openBrushLibraryFromMenu", "brush.saved-library"],
    ] as const) {
      const start = source.indexOf(`function ${handler}(`);
      const body = source.slice(start, start + 900);
      expect(body, handler).toContain(`requestStudioInspectorFocus("${target}")`);
    }
  });

  it("owns a brush import input that accepts the MYB and KPP lanes", () => {
    expect(source).toContain("ref={brushPackImportInputRef}");
    expect(source).toContain("accept={STUDIO_BRUSH_PACK_ACCEPT}");
    expect(source).toContain("handleBrushPackImportFromMenu(event)");
    // Dynamic: the format-gateway parsers must not enter the eager Studio graph.
    expect(source).toContain('await import("./studio-brush-pack-import")');
  });
});

describe("inspector focus bus", () => {
  it("only serves targets that have a mount", () => {
    expect([...STUDIO_INSPECTOR_FOCUS_TARGETS]).toEqual([
      "tool.brush-studio",
      "tool.brush-engines",
      "brush.saved-library",
    ]);
  });

  it("gives a repeat request a new token, so re-selecting a row reopens", () => {
    requestStudioInspectorFocus("tool.brush-studio");
    const first = studioInspectorFocusTokenFor("tool.brush-studio");
    expect(first).toBeGreaterThan(0);
    expect(studioInspectorFocusTokenFor("tool.brush-engines")).toBe(0);

    requestStudioInspectorFocus("tool.brush-studio");
    expect(studioInspectorFocusTokenFor("tool.brush-studio")).toBeGreaterThan(first);
  });

  it("notifies subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeStudioInspectorFocus(listener);
    requestStudioInspectorFocus("brush.saved-library");
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });
});
