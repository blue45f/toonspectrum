import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { hasValidStudioCrdtRootSchema } from "./studio-crdt-root-schema";

function psdTextDocument(overrides: Record<string, unknown> = {}) {
  const doc = new Y.Doc();
  doc.getMap<boolean>("scene-elements").set("text", true);
  const scene = doc.getMap<unknown>("scene-element:text");
  for (const [key, value] of Object.entries({ id: "text", pageId: "page", layerId: "page-root", payloadVersion: 1, type: "text", deleted: false })) scene.set(key, value);
  for (const [key, value] of Object.entries({
    text: "PSD 문자", x: 0, y: 0, width: 100, fontSize: 18, fill: "#123456", rotation: 0, hidden: true,
    psdSource: { version: 1, hash: `sha256:${"a".repeat(64)}`, name: "original.psd", bytes: 100 },
    psdFolderPath: [{ id: "folder", name: "원본 폴더" }], psdGroupId: "folder", psdRasterSourceId: "raster",
    ...overrides,
  })) scene.set(`prop:${key}`, value);
  const order = new Y.Map<unknown>();
  for (const [key, value] of Object.entries({ elementId: "text", pageId: "page", layerId: "page-root", kind: "scene", active: true })) order.set(key, value);
  doc.getArray<Y.Map<unknown>>("stroke-order").push([order]);
  doc.getMap<boolean>("studio-pages").set("page", true);
  const page = doc.getMap<unknown>("studio-page:page");
  for (const [key, value] of Object.entries({ id: "page", payloadVersion: 1, deleted: false, "prop:bg": "#ffffff", "prop:bgGrad": null, "prop:canvasH": 100 })) page.set(key, value);
  const pageOrder = new Y.Map<unknown>();
  pageOrder.set("pageId", "page");
  pageOrder.set("active", true);
  doc.getArray<Y.Map<unknown>>("page-order").push([pageOrder]);
  return doc;
}

describe("PSD 원본·폴더 협업 참조 경계", () => {
  it("원본 바이트 없이 검증된 PSD 참조와 숨겨진 문자 편집본을 허용한다", () => {
    const doc = psdTextDocument();
    expect(hasValidStudioCrdtRootSchema(doc)).toBe(true);
    doc.destroy();
  });
  it("원본 바이트 주입·위조 해시·과도한 폴더 깊이를 거부한다", () => {
    for (const override of [
      { psdSource: { version: 1, hash: "blob:temporary", name: "original.psd", bytes: 100 } },
      { psdSource: { version: 1, hash: `sha256:${"a".repeat(64)}`, name: "original.psd", bytes: 100, data: "inline bytes" } },
      { psdFolderPath: Array.from({ length: 65 }, () => ({ id: "folder", name: "folder" })) },
    ]) {
      const doc = psdTextDocument(override);
      expect(hasValidStudioCrdtRootSchema(doc)).toBe(false);
      doc.destroy();
    }
  });
});
