import { describe, expect, it } from "vitest";

import { parseStudioProjectFile, serializeStudioProjectFile } from "./studio-project-file";
import { parseStudioAutosave, serializeStudioAutosave, serializeStudioAutosaveBackup, type StudioAutosavePayload } from "./studio-autosave";

const V4_PIPELINE = "causal-deposit-v4-taper-spacing";
const stroke = (pipeline: string) => ({
  id: "persisted-pencil", type: "draw", brush: "dry-media", points: [10, 20, 30, 40],
  brushDynamics: { version: 1, depositPipeline: pipeline, seed: 123, spacingRatio: 0.2048 },
});
const page = (elements: unknown[]) => ({ id: "page-1", elements, bg: "#fff", bgGrad: null, canvasH: 900 });
const project = (elements: unknown[]) => ({ version: 2, title: "Saved pencil", pagesList: [page(elements)] });

describe("project file reader version for tapered station spacing", () => {
  it("retains the new reader version in private autosave and rejects unknown future recovery data", () => {
    const element = stroke(V4_PIPELINE);
    const source: StudioAutosavePayload = { ...project([element]), version: 2, savedAt: "2026-09-08T00:00:00.000Z" };
    const saved = serializeStudioAutosave(source);
    expect(JSON.parse(saved).version).toBe(3);
    expect(JSON.parse(saved).pagesList).toBeUndefined();
    const recovered = parseStudioAutosave(saved);
    expect(recovered?.version).toBe(3);
    expect(recovered?.pagesList[0].elements).toEqual([element]);
    const backup = JSON.parse(serializeStudioAutosaveBackup(source));
    expect(backup.version).toBe(3);
    expect(parseStudioProjectFile(backup).pagesList[0].elements).toEqual([element]);
    expect(parseStudioAutosave(JSON.stringify({ ...source, version: 4 }))).toBeNull();
  });
  it("exports a new V4 stroke with its V3 file envelope without changing the stored stroke", () => {
    const element = stroke(V4_PIPELINE);
    const source = project([element]);
    const sourceBytes = JSON.stringify(source);
    const saved = JSON.parse(serializeStudioProjectFile(source));
    expect(saved.version).toBe(3);
    expect(saved.pagesList[0].elements[0]).toEqual(element);
    expect(JSON.stringify(source)).toBe(sourceBytes);
    expect(parseStudioProjectFile(saved).pagesList[0].elements[0]).toEqual(element);
  });

  it("checks every page and the document master when selecting the minimum reader", () => {
    const element = stroke(V4_PIPELINE);
    const laterPage = { ...page([element]), id: "page-2" };
    expect(JSON.parse(serializeStudioProjectFile({
      ...project([]), pagesList: [page([]), laterPage],
    })).version).toBe(3);
    const withMaster = { ...project([]), master: { elements: [element], enabled: true } };
    const saved = JSON.parse(serializeStudioProjectFile(withMaster));
    expect(saved.version).toBe(3);
    expect(saved.master).toEqual(withMaster.master);
  });

  it.each(["causal-deposit-v2", "causal-deposit-v3-segmented"])(
    "keeps the V2 file envelope and exact stored %s stroke on roundtrip",
    (pipeline) => {
      const element = stroke(pipeline);
      const saved = serializeStudioProjectFile(project([element]));
      const parsed = parseStudioProjectFile(JSON.parse(saved));
      expect(parsed.version).toBe(2);
      expect(JSON.stringify(parsed.pagesList[0].elements[0])).toBe(JSON.stringify(element));
      expect(serializeStudioProjectFile(parsed)).toBe(saved);
    },
  );

  it("does not upgrade an empty document, an ordinary shape or a snapshot-less historical stroke", () => {
    const historicalStroke = { id: "legacy", type: "draw", brush: "dry-media", points: [1, 2, 3, 4] };
    const shape = { id: "shape", type: "rect", note: V4_PIPELINE };
    expect(JSON.parse(serializeStudioProjectFile(project([]))).version).toBe(2);
    expect(JSON.parse(serializeStudioProjectFile(project([historicalStroke, shape]))).version).toBe(2);
  });

  it("retains an explicit supported V3 envelope and rejects unknown file versions", () => {
    expect(parseStudioProjectFile({ ...project([]), version: 3 }).version).toBe(3);
    expect(() => parseStudioProjectFile({ ...project([stroke(V4_PIPELINE)]), version: 4 })).toThrow(/프로젝트/);
  });
});
