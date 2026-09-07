import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { captureLayerComp, type StudioLayerComp } from "../../../../web/src/domains/creator/layer/studio-layer-comps";
import { parseStudioLayerComps } from "../../../../web/src/domains/creator/layer/studio-layer-comps-document";
import { StudioCrdtDocument } from "../../../../web/src/domains/creator/live/studio-crdt-document";
import { studioPageToCrdtPage } from "../../../../web/src/domains/creator/live/studio-crdt-page-payload";
import { parseStudioProjectFile, serializeStudioProjectFile } from "../../../../web/src/domains/creator/studio-project-file";

import { hasValidStudioCrdtRootSchema } from "./studio-crdt-root-schema";

const LAYER = { layerId: "layer-1", visible: true, opacity: 0.75, blendMode: "multiply", groupId: "group-1" };
const COMP: StudioLayerComp = {
  ...captureLayerComp("저장된 콤프", [], "comp-1", 1),
  notes: "원본 메모",
  layerStates: { "layer-1": LAYER },
  groupStates: { "group-1": { groupId: "group-1", visible: true } },
};

const textFields: {
  name: string;
  maximum: number;
  minimum: number;
  withText: (text: string) => StudioLayerComp;
}[] = [
  { name: "comp id", maximum: 160, minimum: 1, withText: (id) => ({ ...COMP, id }) },
  { name: "comp name", maximum: 160, minimum: 1, withText: (name) => ({ ...COMP, name }) },
  { name: "notes", maximum: 8192, minimum: 0, withText: (notes) => ({ ...COMP, notes }) },
  { name: "blend mode", maximum: 80, minimum: 0, withText: (blendMode) => ({
    ...COMP, layerStates: { "layer-1": { ...LAYER, blendMode } },
  }) },
  { name: "layer state id and key", maximum: 160, minimum: 1, withText: (layerId) => ({
    ...COMP, layerStates: { [layerId]: { ...LAYER, layerId } },
  }) },
  { name: "layer group id", maximum: 160, minimum: 1, withText: (groupId) => ({
    ...COMP, layerStates: { "layer-1": { ...LAYER, groupId } },
  }) },
  { name: "group state id and key", maximum: 160, minimum: 1, withText: (groupId) => ({
    ...COMP, groupStates: { [groupId]: { groupId, visible: true } },
  }) },
];

function page(comp: StudioLayerComp) {
  return { id: "text-page", bg: "#fff", bgGrad: null, canvasH: 1080, elements: [], layerComps: [comp] };
}

function serverAccepts(comp: StudioLayerComp): boolean {
  const author = new StudioCrdtDocument();
  const server = new Y.Doc();
  try {
    author.upsertPage(studioPageToCrdtPage(page(COMP)));
    Y.applyUpdate(server, author.encodeStateAsUpdate());
    // Replace only the candidate wire field so the API is exercised independently of web admission.
    server.getMap<unknown>("studio-page:text-page").set("prop:layerComps", [comp]);
    return hasValidStudioCrdtRootSchema(server);
  } finally {
    author.destroy();
    server.destroy();
  }
}

describe("layer comp text has the same web and API admission", () => {
  it.each(textFields)("rejects embedded NUL in $name before accepting a project or page", ({ withText }) => {
    const comp = withText("정상\0숨은 값");
    expect(serverAccepts(comp)).toBe(false);
    expect(parseStudioLayerComps([comp])).toBeNull();
    expect(() => studioPageToCrdtPage(page(comp))).toThrow();
    const project = { version: 2, pagesList: [page(comp)] };
    expect(() => parseStudioProjectFile(project)).toThrow(/콤프/u);
    expect(() => serializeStudioProjectFile(project)).toThrow(/콤프/u);
  });

  it.each(textFields)("preserves Korean, newline and quote characters in $name", ({ withText }) => {
    const comp = withText("한글 \"이름\"\n다음 줄");
    expect(parseStudioLayerComps([comp])).toEqual([comp]);
    expect(studioPageToCrdtPage(page(comp)).payload.props.layerComps).toEqual([comp]);
    expect(serverAccepts(comp)).toBe(true);
    const project = { version: 2, pagesList: [page(comp)] };
    const restored = parseStudioProjectFile(JSON.parse(serializeStudioProjectFile(project)));
    expect(restored.pagesList[0].layerComps).toEqual([comp]);
  });

  it.each(textFields.filter(({ name }) => name !== "notes"))(
    "keeps the existing $maximum-character limit for $name",
    ({ maximum, withText }) => {
      const boundary = withText("x".repeat(maximum));
      expect(parseStudioLayerComps([boundary])).toEqual([boundary]);
      expect(studioPageToCrdtPage(page(boundary)).payload.props.layerComps).toEqual([boundary]);
      expect(serverAccepts(boundary)).toBe(true);
      const oversized = withText("x".repeat(maximum + 1));
      expect(parseStudioLayerComps([oversized])).toBeNull();
      expect(serverAccepts(oversized)).toBe(false);
    },
  );

  it("retains the notes limit while independently enforcing the smaller aggregate page envelope", () => {
    const comp = { ...COMP, notes: "x".repeat(8192) };
    expect(parseStudioLayerComps([comp])).toEqual([comp]);
    expect(parseStudioLayerComps([{ ...comp, notes: `${comp.notes}x` }])).toBeNull();
    expect(() => studioPageToCrdtPage(page(comp))).toThrow(/8KiB/u);
    expect(serverAccepts(comp)).toBe(false);
  });

  it.each(textFields)("keeps the existing empty-text policy for $name", ({ minimum, withText }) => {
    const comp = withText("");
    expect(parseStudioLayerComps([comp]) !== null).toBe(minimum === 0);
    expect(serverAccepts(comp)).toBe(minimum === 0);
  });
});
