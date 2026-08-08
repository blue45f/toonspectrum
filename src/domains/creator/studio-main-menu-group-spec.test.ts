/**
 * V5 §15.3 coverage contract.
 *
 * The point of this file is that the menu and the coverage table cannot drift
 * apart. Every built menu item must be claimed by exactly one §15.3 row or
 * declared as an extra, and every claim must point at an item that exists — so
 * adding, moving or dropping a menu command without saying what it does to §15.3
 * coverage fails here rather than silently changing the audit's numbers.
 */

import { describe, expect, it, vi } from "vitest";

import {
  STUDIO_MENU_GROUP_ORDER,
  STUDIO_MENU_GROUP_SPEC,
  studioMenuSpecClaimedItems,
  studioMenuSpecCoverageSummary,
  studioMenuSpecMissingRows,
} from "./studio-main-menu-group-spec";
import { buildStudioMainMenuGroups } from "./studio-main-menu-groups";

import type {
  StudioMainMenuBuilderState,
  StudioMainMenuEditAvailability,
  StudioMainMenuEditorActions,
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
};

function liveMenu() {
  const noop = () => vi.fn();
  const editor = new Proxy({} as StudioMainMenuEditorActions, {
    get: () => noop(),
  });
  const ui = new Proxy({} as StudioMainMenuUiActions, { get: () => noop() });
  return buildStudioMainMenuGroups({ state: BASE_STATE, editor, ui, t: (key) => key });
}

function liveItemIds(): string[] {
  return liveMenu().flatMap((group) =>
    group.items.map((item) => `${group.id}/${item.id}`),
  );
}

describe("§15.3 menu group spec", () => {
  it("declares all 17 §15.3 groups plus the product-only AI group, in menubar order", () => {
    expect(STUDIO_MENU_GROUP_SPEC.filter((group) => group.inV5Spec)).toHaveLength(17);
    expect(STUDIO_MENU_GROUP_SPEC.filter((group) => !group.inV5Spec).map((g) => g.id)).toEqual([
      "ai",
    ]);
    expect(STUDIO_MENU_GROUP_ORDER).toEqual([
      "file",
      "edit",
      "view",
      "canvas",
      "layer",
      "select",
      "transform",
      "brush",
      "filter",
      "vector",
      "text",
      "comic",
      "animation",
      "3d",
      "collaboration",
      "window",
      "ai",
      "help",
    ]);
    expect(
      STUDIO_MENU_GROUP_SPEC.map((group) => group.specName),
      "spec names are the §15.3 headings",
    ).toContain("Text & Balloon");
  });

  it("claims every live menu item exactly once, and claims nothing that does not exist", () => {
    const live = liveItemIds();
    const claimed = STUDIO_MENU_GROUP_SPEC.flatMap((group) =>
      studioMenuSpecClaimedItems(group.id),
    );

    expect(claimed.filter((id) => !live.includes(id)), "claims a missing item").toEqual([]);
    expect(live.filter((id) => !claimed.includes(id)), "unclaimed menu item").toEqual([]);
    expect(new Set(claimed).size, "an item claimed twice").toBe(claimed.length);
  });

  it("only ever claims items that belong to the claiming group", () => {
    for (const group of STUDIO_MENU_GROUP_SPEC) {
      for (const id of studioMenuSpecClaimedItems(group.id)) {
        expect(id.startsWith(`${group.id}/`), `${group.id} claims ${id}`).toBe(true);
      }
    }
  });

  it("renders every group that has an item and no group that does not", () => {
    const rendered = liveMenu().map((group) => group.id);
    const withItems = STUDIO_MENU_GROUP_SPEC.filter(
      (group) => studioMenuSpecClaimedItems(group.id).length > 0,
    ).map((group) => group.id);

    expect(rendered).toEqual(withItems);
    expect(rendered).not.toContain("transform");
    expect(rendered).not.toContain("animation");
    expect(rendered).not.toContain("collaboration");
  });

  it("pins the measured §15.3 coverage so it cannot move without a decision", () => {
    // Audit baseline (docs/rewrite/ux-audit-v5.md §2.7): 5 of 17 groups, 12 absent.
    expect(studioMenuSpecCoverageSummary()).toEqual({
      specGroups: 17,
      groupsWithItems: 14,
      emptyGroupIds: ["transform", "animation", "collaboration"],
      specRows: 135,
      rowsPresent: 14,
      rowsPartial: 19,
      rowsAbsent: 102,
      extras: 32,
    });
  });

  it("keeps the §15.3 shortfall list enumerable rather than folklore", () => {
    const missing = studioMenuSpecMissingRows();

    expect(missing).toContain("Layer ▸ Mask/Clipping");
    expect(missing).toContain("Transform ▸ Scale/Rotate/Skew/Perspective");
    expect(missing).toContain("Filter ▸ Adjustment Layer");
    expect(missing).toContain("Help ▸ Command Search");
    expect(missing).toHaveLength(studioMenuSpecCoverageSummary().rowsAbsent);
  });

  /**
   * §15 rule 4 (1–2–3) re-measurement for the five commands the audit measured as
   * failing (`docs/rewrite/ux-audit-v5.md` §2.2). A top-level menu item costs 2
   * actions: open the group, click the row. Anything not in the menu keeps the
   * cost the audit measured on its panel path.
   */
  it("re-measures the 1–2–3 rule failures against the new group structure", () => {
    const live = liveMenu();
    const commandIds = new Set(
      live.flatMap((group) => group.items.map((item) => item.commandId)),
    );
    const menuCost = (commandId: string): number | null =>
      commandIds.has(commandId) ? 2 : null;

    // Resolved by the regroup: these were only reachable through a right-panel tab
    // switch (+1 action) before Layer / Select / Canvas existed.
    expect(menuCost("layer.bring-front")).toBe(2);
    // Catalog id is still `edit.crop-layer`; only the menu group moved.
    expect(menuCost("edit.crop-layer")).toBe(2);
    expect(menuCost("select.all")).toBe(2);
    expect(menuCost("view.canvas-rulers")).toBe(2);

    // Still failing: the commands exist in the product but have no host callback
    // on the menu contract, so Wave C (menu-only, no StudioPage budget left)
    // cannot reach them. Recorded so the next wave inherits an exact list.
    const stillBlocked = [
      { audit: "선택 후 변형", commandId: "transform.pixel-selection", needs: "ui.activateTransformTool" },
      { audit: "레벨(Levels)", commandId: null, needs: "ui.openImageAdjustments (레벨 명령 자체가 없음)" },
      { audit: "커브(Curves)", commandId: null, needs: "ui.openImageAdjustments (필터의 색상 커브와 다른 명령)" },
      { audit: "클리핑 마스크", commandId: null, needs: "editor.toggleClippingMask" },
    ] as const;
    for (const row of stillBlocked) {
      expect(row.commandId === null || !commandIds.has(row.commandId), row.audit).toBe(true);
      expect(row.needs).not.toBe("");
    }
    expect(live.find((group) => group.id === "transform")).toBeUndefined();
  });

  it("gives every partial row a note saying what is missing", () => {
    for (const group of STUDIO_MENU_GROUP_SPEC) {
      for (const row of group.rows) {
        if (row.coverage === "partial") {
          expect(row.note?.trim(), `${group.specName} ▸ ${row.spec}`).toBeTruthy();
          expect(row.items.length, `${group.specName} ▸ ${row.spec}`).toBeGreaterThan(0);
        }
        if (row.coverage === "present") {
          expect(row.items.length, `${group.specName} ▸ ${row.spec}`).toBeGreaterThan(0);
        }
        if (row.coverage === "absent") {
          expect(row.items, `${group.specName} ▸ ${row.spec}`).toEqual([]);
        }
      }
      for (const extra of group.extras) {
        expect(extra.note.trim(), extra.item).not.toBe("");
      }
    }
  });
});
