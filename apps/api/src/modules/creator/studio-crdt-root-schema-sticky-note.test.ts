import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { hasValidStudioCrdtRootSchema } from "./studio-crdt-root-schema";

const ELEMENT_ID = "sticky-note";
const PAGE_ID = "page-sticky-note";

function stickyNoteDocument(
  stickyNotePresetId: unknown = "mint",
  stickyNoteFill: unknown = "#bbf7d0"
): { doc: Y.Doc; scene: Y.Map<unknown> } {
  const doc = new Y.Doc();
  doc.getMap<boolean>("scene-elements").set(ELEMENT_ID, true);
  const scene = doc.getMap<unknown>(`scene-element:${ELEMENT_ID}`);
  scene.set("id", ELEMENT_ID);
  scene.set("pageId", PAGE_ID);
  scene.set("layerId", "page-root");
  scene.set("payloadVersion", 1);
  scene.set("type", "text");
  scene.set("deleted", false);
  scene.set("prop:text", "공유 아이디어");
  scene.set("prop:x", 80);
  scene.set("prop:y", 120);
  scene.set("prop:width", 200);
  scene.set("prop:fontSize", 16);
  scene.set("prop:fill", "#14532d");
  scene.set("prop:rotation", 0);
  scene.set("prop:stickyNotePresetId", stickyNotePresetId);
  scene.set("prop:stickyNoteFill", stickyNoteFill);

  const sceneOrder = new Y.Map<unknown>();
  sceneOrder.set("elementId", ELEMENT_ID);
  sceneOrder.set("pageId", PAGE_ID);
  sceneOrder.set("layerId", "page-root");
  sceneOrder.set("kind", "scene");
  sceneOrder.set("active", true);
  doc.getArray<Y.Map<unknown>>("stroke-order").push([sceneOrder]);

  doc.getMap<boolean>("studio-pages").set(PAGE_ID, true);
  const page = doc.getMap<unknown>(`studio-page:${PAGE_ID}`);
  page.set("id", PAGE_ID);
  page.set("payloadVersion", 1);
  page.set("deleted", false);
  page.set("prop:bg", "#ffffff");
  page.set("prop:bgGrad", null);
  page.set("prop:canvasH", 1_600);

  const pageOrder = new Y.Map<unknown>();
  pageOrder.set("pageId", PAGE_ID);
  pageOrder.set("active", true);
  doc.getArray<Y.Map<unknown>>("page-order").push([pageOrder]);
  return { doc, scene };
}

describe("Studio CRDT sticky-note scene boundary", () => {
  it("accepts current and forward-compatible sticky-note text metadata", () => {
    for (const [stickyNotePresetId, stickyNoteFill] of [
      ["mint", "#bbf7d0"],
      ["future-coral", "color(display-p3 1 0.45 0.4)"],
    ]) {
      const { doc } = stickyNoteDocument(stickyNotePresetId, stickyNoteFill);
      expect(hasValidStudioCrdtRootSchema(doc), stickyNotePresetId).toBe(true);
      doc.destroy();
    }
  });

  it("rejects malformed preset identifiers and fill strings", () => {
    const invalidCases: Array<[
      label: string,
      stickyNotePresetId: unknown,
      stickyNoteFill: unknown,
    ]> = [
      ["non-string preset", 42, "#bbf7d0"],
      ["empty preset", "", "#bbf7d0"],
      ["control character preset", "bad\npreset", "#bbf7d0"],
      ["oversize preset", "x".repeat(161), "#bbf7d0"],
      ["non-string fill", "mint", 42],
      ["NUL fill", "mint", "bad\u0000fill"],
      ["oversize fill", "mint", "x".repeat(513)],
    ];

    for (const [label, stickyNotePresetId, stickyNoteFill] of invalidCases) {
      const { doc } = stickyNoteDocument(stickyNotePresetId, stickyNoteFill);
      expect(hasValidStudioCrdtRootSchema(doc), label).toBe(false);
      doc.destroy();
    }
  });

  it("keeps sticky-note metadata exclusive to text elements", () => {
    const { doc, scene } = stickyNoteDocument();
    scene.set("type", "sticker");
    scene.delete("prop:width");
    scene.delete("prop:fill");

    expect(hasValidStudioCrdtRootSchema(doc)).toBe(false);
    doc.destroy();
  });
});
