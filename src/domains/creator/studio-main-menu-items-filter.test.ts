/**
 * Filter-surface parity contract.
 *
 * Measured 2026-08-09 before this file existed: the top Filter menu offered 32 filters, the
 * dialog gallery said "48개 필터", and 16 shipped filters (the whole union wave — warps, film
 * grain, pointillize, god rays…) had no menu row at all. The menu had its own hand-written list
 * of 27 pack kinds; the gallery counted the registry. One of the two was always going to fall
 * behind, and it did.
 *
 * These tests fail the moment the menu and the dialog gallery can show different numbers of
 * filters, or the moment a registered filter kind has no way in from the menubar.
 */

import { describe, expect, it, vi } from "vitest";

import { STUDIO_ADJUSTMENT_ENGINE_IDS } from "./studio-adjustment-stack";
import { STUDIO_COMMAND_CATALOG } from "./studio-command-catalog";
import { STUDIO_FILTER_CATALOG, STUDIO_FILTER_DIALOG_CATALOG } from "./studio-filter-catalog";
import { STUDIO_FILTER_LABELS, STUDIO_FILTER_MENU_KINDS } from "./studio-filter-menu";
import { STUDIO_FILTER_PACK_DEFS } from "./studio-filter-pack";
import {
  STUDIO_FILTER_ALL_KINDS,
  STUDIO_FILTER_PACK_KINDS,
  STUDIO_FILTER_PACK_LABELS,
} from "./studio-filter-pack-registry";
import { buildStudioFilterMenuItems } from "./studio-main-menu-items-filter";

import type {
  StudioMainMenuEditAvailability,
  StudioMainMenuEditorActions,
  StudioMainMenuBuilderState,
  StudioMainMenuUiActions,
} from "./studio-main-menu-contract";

const AVAILABLE_EDIT_ACTIONS: StudioMainMenuEditAvailability = {
  undoDisabled: false,
  redoDisabled: false,
  cutDisabled: false,
  copyDisabled: false,
  pasteDisabled: false,
  selectAllDisabled: false,
  deselectDisabled: false,
  invertSelectionDisabled: false,
  clearSelectionDisabled: false,
  duplicateDisabled: false,
  reorderDisabled: false,
  cropLayerDisabled: false,
};

const BASE_STATE: StudioMainMenuBuilderState = {
  sharedNonOwnerSave: false,
  saving: false,
  collaborationDocumentLocked: false,
  hasWorkId: false,
  projectArchiveBusy: false,
  interchangeImportBusy: false,
  psdImportBusy: false,
  edit: AVAILABLE_EDIT_ACTIONS,
  filterDisabled: false,
  filterUnavailableReason: null,
  viewTransformSuppressed: false,
  canvasFlipH: false,
  canvasRotation: 0,
  fullscreen: false,
  canvasRulersVisible: true,
  colorVisionMode: "none",
  referencePanelOpen: false,
  pageSequenceOpen: false,
  hasSavedView: false,
  perspectiveRulerActive: false,
  hasLocallyHiddenLayers: false,
  quickAccessPaletteOpen: false,
  quickAccessPaletteLoading: false,
  leftPanelOpen: true,
  rightPanelOpen: true,
  lastFilterDraft: null,
  clippingMaskActive: false,
  clippingMaskDisabled: false,
  imageLayerSelected: true,
  activeToolCommandId: "tool.pen",
  pixelSelectionTool: null,
  quickMaskActive: false,
  animationTimelineOpen: false,
  onionSkinEnabled: false,
  documentCommentsOpen: false,
  canvasGridVisible: false,
  vectorEraseToIntersection: false,
  masterEditMode: false,
};

/** Rows that open a filter dialog — everything except 마지막 필터 and the two layer adjustments. */
const NON_FILTER_ROW_IDS = new Set(["last-filter", "levels", "tone-curve"]);

function filterRows(state: Partial<StudioMainMenuBuilderState> = {}) {
  const opened: string[] = [];
  const editor = new Proxy({} as StudioMainMenuEditorActions, {
    get: (_target, prop) =>
      prop === "openStudioFilter"
        ? (kind: string) => opened.push(kind)
        : vi.fn(),
  });
  const ui = new Proxy({} as StudioMainMenuUiActions, { get: () => vi.fn() });
  const items = buildStudioFilterMenuItems({
    state: { ...BASE_STATE, ...state },
    editor,
    ui,
    t: (key: string) => key,
  } as never);
  return { items, opened };
}

describe("filter menu ↔ filter gallery parity", () => {
  it("offers exactly one menu row per registered filter kind, in registration order", () => {
    const { items } = filterRows();
    const openable = items.filter((item) => !NON_FILTER_ROW_IDS.has(item.id));

    expect(openable.map((item) => item.id)).toEqual([...STUDIO_FILTER_MENU_KINDS]);
    // The registry is the one list; the menu and the gallery are two readers of it.
    expect(openable).toHaveLength(STUDIO_FILTER_DIALOG_CATALOG.length);
    expect(openable).toHaveLength(STUDIO_FILTER_ALL_KINDS.length);
    expect(items).toHaveLength(STUDIO_FILTER_MENU_KINDS.length + NON_FILTER_ROW_IDS.size);
  });

  it("counts the same filters the dialog gallery counts", () => {
    const { items } = filterRows();
    const menuKinds = items.filter((item) => !NON_FILTER_ROW_IDS.has(item.id)).map((i) => i.id);
    const galleryKinds = STUDIO_FILTER_DIALOG_CATALOG.map((entry) => entry.kind);

    // The gallery header renders `STUDIO_FILTER_DIALOG_CATALOG.length`개 필터. If these two ever
    // differ, the product is telling the artist two different numbers on two screens.
    expect([...menuKinds].sort()).toEqual([...galleryKinds].sort());
  });

  it("names every filter exactly as the dialog names it", () => {
    const { items } = filterRows();
    for (const item of items) {
      if (NON_FILTER_ROW_IDS.has(item.id)) continue;
      expect(item.label, `${item.id} label`).toBe(
        STUDIO_FILTER_LABELS[item.id as keyof typeof STUDIO_FILTER_LABELS],
      );
    }
  });

  it("keeps the pack schema label and the registry label the same string", () => {
    for (const kind of STUDIO_FILTER_PACK_KINDS) {
      expect(STUDIO_FILTER_PACK_DEFS[kind].label, kind).toBe(STUDIO_FILTER_PACK_LABELS[kind]);
    }
  });

  it("gives every row an icon and a catalog command that actually opens the filter", () => {
    const catalogIds = new Set(STUDIO_COMMAND_CATALOG.map((entry) => entry.id));
    const { items, opened } = filterRows();

    for (const item of items) {
      expect(item.icon, `${item.id} icon`).toBeTruthy();
      expect(item.commandId, `${item.id} commandId`).toBeTruthy();
      expect(catalogIds.has(item.commandId as string), `${item.commandId} in catalog`).toBe(true);
      if (!NON_FILTER_ROW_IDS.has(item.id)) {
        expect(item.commandId).toBe(`filter.${item.id}`);
      }
    }

    for (const item of items) {
      if (NON_FILTER_ROW_IDS.has(item.id)) continue;
      item.onSelect();
    }
    expect(opened).toEqual([...STUDIO_FILTER_MENU_KINDS]);
  });

  it("reaches the 16 union-wave filters that used to exist only in gallery search", () => {
    const { items } = filterRows();
    const ids = new Set(items.map((item) => item.id));
    for (const kind of [
      "wave-warp",
      "ripple-warp",
      "fisheye",
      "twirl",
      "pinch-bloat",
      "lens-distortion",
      "film-grain-pro",
      "salt-pepper",
      "rgb-noise",
      "perlin-texture",
      "pointillize",
      "stained-glass",
      "poster-edges",
      "photocopy",
      "normal-map",
      "god-rays",
    ]) {
      expect(ids.has(kind), `Filter ▸ ${kind}`).toBe(true);
    }
  });

  it("carries the host's unavailable reason onto every destructive row", () => {
    const { items } = filterRows({
      filterDisabled: true,
      filterUnavailableReason: "저장이 끝난 뒤 필터를 적용하세요.",
    });
    for (const item of items) {
      if (item.id === "levels" || item.id === "tone-curve") continue;
      expect(item.disabled, `${item.id} disabled`).toBe(true);
      expect(item.unavailableReason, `${item.id} reason`).toBe("저장이 끝난 뒤 필터를 적용하세요.");
    }
  });
});

describe("inspector smart-filter inventory is a different list, on purpose", () => {
  /**
   * The inspector's "사용 가능한 필터 N개" counts non-destructive adjustment-layer engines, not the
   * destructive dialog filters, so it is legitimately a different number (60 vs 48 as measured).
   * This pins the overlap so the difference stays a decision instead of becoming drift: anything
   * that is both an adjustment engine and a dialog filter must be reachable from the menu too.
   */
  it("keeps every shared engine reachable from the menubar as well", () => {
    const { items } = filterRows();
    const menuEngines = new Set(
      STUDIO_FILTER_DIALOG_CATALOG.filter((entry) =>
        items.some((item) => item.id === entry.kind),
      ).map((entry) => entry.engine),
    );
    const inspectorEngines = new Set<string>(STUDIO_ADJUSTMENT_ENGINE_IDS);
    const shared = STUDIO_FILTER_CATALOG.filter((entry) => inspectorEngines.has(entry.engine));

    expect(shared).toHaveLength(STUDIO_ADJUSTMENT_ENGINE_IDS.length);
    for (const entry of shared) {
      if (!STUDIO_FILTER_DIALOG_CATALOG.some((dialog) => dialog.engine === entry.engine)) continue;
      expect(menuEngines.has(entry.engine), `menu door for ${entry.engine}`).toBe(true);
    }
  });
});
