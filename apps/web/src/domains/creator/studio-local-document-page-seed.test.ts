import { describe, expect, it } from "vitest";
import { createStudioProjectWithInitialDocument } from "./studio-project-creation";
import { resolveStudioEditorDocumentRoute } from "./studio-editor-document-source";
import { studioLocalDocumentPageSeed } from "./studio-local-document-page-seed";
import { resolveStudioRoute } from "./studio-router/studio-route-manifest";
import type { StudioProjectKind } from "./studio-project-library-store";

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}
function create(kind: StudioProjectKind, templateId: string, storage = new MemoryStorage()) {
  const result = createStudioProjectWithInitialDocument(storage, { title: "Test art", kind, templateId });
  const url = new URL(result.href, "https://studio.test");
  const resolved = resolveStudioRoute({ pathname: url.pathname, search: url.search });
  if (resolved.kind !== "editor") throw new Error("Expected editor");
  const route = resolveStudioEditorDocumentRoute(resolved.workspaceRoute, storage);
  return { ...result, storage, route };
}
describe("typed document canvas initialization", () => {
  it.each([
    ["webtoon", "webtoon-vertical", 3600],
    ["webtoon", "webtoon-four-cut", 1680],
    ["webtoon", "webtoon-page", 1080],
    ["illustration", "illustration-portrait", 900],
    ["illustration", "illustration-landscape", 480],
    ["illustration", "quick-sketch", 720],
    ["design", "design-cover", 1080],
    ["design", "design-social", 720],
    ["design", "design-thumbnail", 405],
    ["slides", "slides-pitch", 405],
  ] as const)("%s / %s seeds the real canvas height %i", (kind, template, height) => {
    const item = create(kind, template);
    expect(item.document).toMatchObject({ width: 720, height });
    expect(studioLocalDocumentPageSeed(item.route, "page", item.storage)?.canvasH).toBe(height);
  });
  it("seeds four editable, contained frames with deterministic ids", () => {
    const item = create("webtoon", "webtoon-four-cut");
    const page = studioLocalDocumentPageSeed(item.route, "page", item.storage)!;
    expect(page.elements).toHaveLength(4);
    for (const frame of page.elements) {
      expect(frame.type).toBe("frame");
      if (frame.type !== "frame") throw new Error("Expected frame");
      expect(frame.y + frame.height).toBeLessThan(page.canvasH);
      expect(frame.x + frame.width).toBeLessThan(720);
    }
    expect(studioLocalDocumentPageSeed(item.route, "page", item.storage)).toEqual(page);
  });
  it("keeps unknown, remote, remixed and storage-denied sources out of local initialization", () => {
    const item = create("illustration", "quick-sketch");
    expect(studioLocalDocumentPageSeed({ ...item.route, workId: "remote" }, "p", item.storage)).toBeNull();
    expect(studioLocalDocumentPageSeed({ ...item.route, remixSourceWorkId: "remote" }, "p", item.storage)).toBeNull();
    expect(studioLocalDocumentPageSeed({ ...item.route, documentId: "missing" }, "p", item.storage)).toBeNull();
    expect(studioLocalDocumentPageSeed(item.route, "p", null)).toBeNull();
    expect(studioLocalDocumentPageSeed(item.route, "p", {
      getItem() { throw new Error("Denied"); }, setItem() {},
    })).toBeNull();
  });
  it("does not apply another project type's template", () => {
    const item = create("illustration", "webtoon-four-cut");
    expect(studioLocalDocumentPageSeed(item.route, "p", item.storage)).toMatchObject({ canvasH: 900, elements: [] });
  });
});
