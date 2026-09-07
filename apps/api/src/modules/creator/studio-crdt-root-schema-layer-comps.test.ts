import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { captureLayerComp, STUDIO_LAYER_COMPS_MAX_COUNT } from "../../../../web/src/domains/creator/layer/studio-layer-comps";
import { parseStudioLayerComps } from "../../../../web/src/domains/creator/layer/studio-layer-comps-document";
import { StudioCrdtDocument } from "../../../../web/src/domains/creator/live/studio-crdt-document";
import { studioPageToCrdtPage } from "../../../../web/src/domains/creator/live/studio-crdt-page-bridge";

import { hasValidStudioCrdtRootSchema } from "./studio-crdt-root-schema";

const PAGE_ID = "layer-comp-page";
const EMPTY_COMP = captureLayerComp("Preset", [], "comp-1", 1);
const STATE = { layerId: "layer-1", visible: false, opacity: 0.35, blendMode: "multiply", groupId: "group-1" };
const FULL_COMP = {
  ...EMPTY_COMP,
  notes: "조명과 폴더 상태",
  layerStates: { "layer-1": STATE },
  groupStates: { "group-1": { groupId: "group-1", visible: true } },
};

function browserPage(layerComps = [EMPTY_COMP]) {
  return { id: PAGE_ID, bg: "#fff", bgGrad: null, canvasH: 1080, elements: [], layerComps };
}

function serverDocument(): { doc: Y.Doc; page: Y.Map<unknown> } {
  const browser = new StudioCrdtDocument();
  const doc = new Y.Doc();
  browser.upsertPage(studioPageToCrdtPage(browserPage()));
  Y.applyUpdate(doc, browser.encodeStateAsUpdate());
  browser.destroy();
  return { doc, page: doc.getMap<unknown>(`studio-page:${PAGE_ID}`) };
}

describe("Studio CRDT layer comp server admission", () => {
  it("accepts the browser's authored update, another peer's edit, and preset removal", () => {
    const author = new StudioCrdtDocument();
    const peer = new StudioCrdtDocument();
    const server = new Y.Doc();
    try {
      const page = browserPage([FULL_COMP]);
      author.upsertPage(studioPageToCrdtPage(page));
      Y.applyUpdate(server, author.encodeStateAsUpdate());
      expect(hasValidStudioCrdtRootSchema(server)).toBe(true);
      peer.applyUpdate(Y.encodeStateAsUpdate(server));
      expect(peer.getPage(PAGE_ID)?.payload.props.layerComps).toEqual([FULL_COMP]);
      peer.patchPage(PAGE_ID, { set: { note: "동료 메모" } });
      Y.applyUpdate(server, peer.encodeStateAsUpdate());
      expect(hasValidStudioCrdtRootSchema(server)).toBe(true);
      peer.patchPage(PAGE_ID, { unset: ["layerComps"] });
      Y.applyUpdate(server, peer.encodeStateAsUpdate());
      expect(hasValidStudioCrdtRootSchema(server)).toBe(true);
      author.applyUpdate(Y.encodeStateAsUpdate(server));
      expect(author.getPage(PAGE_ID)?.payload.props).not.toHaveProperty("layerComps");
    } finally {
      author.destroy();
      peer.destroy();
      server.destroy();
    }
  });

  it("accepts empty and maximum-count presets normalized by the document parser", () => {
    const { doc, page } = serverDocument();
    try {
      for (const layerComps of [[], Array.from({ length: STUDIO_LAYER_COMPS_MAX_COUNT }, (_, index) => ({
        ...EMPTY_COMP, id: `c${index}`, name: "P",
      }))]) {
        page.set("prop:layerComps", parseStudioLayerComps(layerComps));
        expect(hasValidStudioCrdtRootSchema(doc)).toBe(true);
      }
    } finally {
      doc.destroy();
    }
  });

  it.each([
    ["not an array", "invalid"],
    ["null preset", [null]],
    ["duplicate ids", [EMPTY_COMP, EMPTY_COMP]],
    ["too many presets", Array.from({ length: STUDIO_LAYER_COMPS_MAX_COUNT + 1 }, (_, index) => ({ ...EMPTY_COMP, id: `c${index}` }))],
    ["empty id", [{ ...EMPTY_COMP, id: "" }]],
    ["long id", [{ ...EMPTY_COMP, id: "x".repeat(161) }]],
    ["empty name", [{ ...EMPTY_COMP, name: "" }]],
    ["long name", [{ ...EMPTY_COMP, name: "x".repeat(161) }]],
    ["fractional timestamp", [{ ...EMPTY_COMP, createdAt: 0.5 }]],
    ["negative timestamp", [{ ...EMPTY_COMP, createdAt: -1 }]],
    ["unsafe timestamp", [{ ...EMPTY_COMP, createdAt: Number.MAX_SAFE_INTEGER + 1 }]],
    ["long notes", [{ ...EMPTY_COMP, notes: "x".repeat(8193) }]],
    ["missing states", [{ ...EMPTY_COMP, layerStates: null }]],
    ["array states", [{ ...EMPTY_COMP, layerStates: [] }]],
    ["layer identity mismatch", [{ ...FULL_COMP, layerStates: { other: STATE } }]],
    ["layer visibility", [{ ...FULL_COMP, layerStates: { "layer-1": { ...STATE, visible: "false" } } }]],
    ["layer opacity", [{ ...FULL_COMP, layerStates: { "layer-1": { ...STATE, opacity: 1.01 } } }]],
    ["long blend mode", [{ ...FULL_COMP, layerStates: { "layer-1": { ...STATE, blendMode: "x".repeat(81) } } }]],
    ["empty group id", [{ ...FULL_COMP, layerStates: { "layer-1": { ...STATE, groupId: "" } } }]],
    ["group identity mismatch", [{ ...FULL_COMP, groupStates: { other: { groupId: "group-1", visible: true } } }]],
    ["group visibility", [{ ...FULL_COMP, groupStates: { "group-1": { groupId: "group-1", visible: 1 } } }]],
    ["unknown wire property", [{ ...EMPTY_COMP, sourceBytes: "private" }]],
    ["unknown layer property", [{ ...FULL_COMP, layerStates: { "layer-1": { ...STATE, sourceBytes: "private" } } }]],
  ])("rejects malformed wire candidates: %s", (_label, value) => {
    const { doc, page } = serverDocument();
    try {
      page.set("prop:layerComps", value);
      expect(hasValidStudioCrdtRootSchema(doc)).toBe(false);
    } finally {
      doc.destroy();
    }
  });

  it.each(["base", "prop"])("rejects an invalid hidden %s candidate before a later unset can reveal it", (prefix) => {
    const { doc, page } = serverDocument();
    try {
      page.set("base:layerComps", [EMPTY_COMP]);
      page.set("prop:layerComps", [EMPTY_COMP]);
      page.set(`${prefix}:layerComps`, [{ ...EMPTY_COMP, layerStates: null }]);
      if (prefix === "prop") page.set("unset:layerComps", true);
      expect(hasValidStudioCrdtRootSchema(doc)).toBe(false);
    } finally {
      doc.destroy();
    }
  });

  it("preserves both the page byte budget and the budget for hidden baseline values", () => {
    const { doc, page } = serverDocument();
    try {
      const medium = [{ ...EMPTY_COMP, notes: "가".repeat(1000) }];
      page.set("prop:layerComps", medium);
      expect(hasValidStudioCrdtRootSchema(doc)).toBe(true);
      page.set("prop:note", "가".repeat(2000));
      expect(hasValidStudioCrdtRootSchema(doc)).toBe(false);
      page.delete("prop:note");
      page.set("base:layerComps", Array.from({ length: 4 }, (_, index) => ({ ...medium[0], id: `c${index}` })));
      page.set("prop:layerComps", []);
      expect(hasValidStudioCrdtRootSchema(doc)).toBe(false);
    } finally {
      doc.destroy();
    }
  });
});
