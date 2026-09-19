import { prepareStudioNativeBrushDocumentFromEditor } from "./studio-native-brush-editor-commit";
import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { exportPageToSvg } from "../export/studio-svg-export";
import { parseStudioProjectDocument, serializeStudioProjectDocument } from "../studio-project-document";

import { planStudioNativeBrushDocumentReplacement, prepareStudioNativeBrushDocumentCommit } from "./studio-native-brush-document-commit";
import { planStudioNativeBrushDocument, studioNativeBrushSourceRevision } from "./studio-native-brush-document-contract";
import { renderStudioNativeBrushDocument } from "./studio-native-brush-document-product";
import { validateNativeBrushDocumentOutput } from "./studio-native-brush-probe-contract";

import type { DrawEl, El } from "../studio-element-model";
import type { StudioNativeBrushDocumentState } from "./studio-native-brush-document-commit";
import type { StudioNativeBrushDocumentResult } from "./studio-native-brush-document-contract";
import type { StudioNativeBrushProbeClient } from "./studio-native-brush-probe-client";
import type { NativeBrushDocumentOutput } from "./studio-native-brush-probe-contract";

function stroke(patch: Partial<DrawEl> = {}): DrawEl {
  return { id: "ink", type: "draw", kind: "freehand", mode: "pen", brush: "gpen", name: "Original",
    points: [150.25, 180.5, 210.75, 210.5, 300.25, 170.75], stroke: "#123456", strokeWidth: 12,
    pressures: [0.2, 0.8, 0.35], tiltXs: [0, 30, -45], tiltYs: [0, -20, 20],
    sampleTimeOffsets: [0, 16, 32], opacity: 0.35, ...patch };
}
const options = { engine: "libmypaint" as const, style: "wash" as const, documentWidth: 720, documentHeight: 1000 };
function state(source = stroke()): StudioNativeBrushDocumentState {
  return { pageId: "p", masterEditMode: false, historyIdentity: {}, historyIndex: 0,
    elements: [source], groups: [], documentWidth: 720, documentHeight: 1000 };
}
function result(source = stroke()): StudioNativeBrushDocumentResult {
  const plan = planStudioNativeBrushDocument(source, options);
  return { sourceElementId: source.id, sourceRevision: plan.sourceRevision, engine: plan.engine,
    style: plan.config.style, seed: plan.config.seed, bounds: plan.bounds,
    src: "data:image/png;base64,iVBORw0KGgo=", pngHash: "a".repeat(64) };
}
/** Header-only fixture for transport validation, not evidence of image decoding. */
function pngReply(width: number, height: number): NativeBrushDocumentOutput {
  const png = new ArrayBuffer(33), bytes = new Uint8Array(png), view = new DataView(png);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]); view.setUint32(8, 13); view.setUint32(12, 0x49484452);
  view.setUint32(16, width); view.setUint32(20, height);
  return { type: "document", version: 1, id: 2, engine: "libmypaint", width, height, samples: 3, png,
    pngHash: createHash("sha256").update(bytes).digest("hex") };
}

describe("native document source plan", () => {
  it("keeps document-pixel scale, aligned pressure/tilt/time and an independent snapshot", () => {
    const source = stroke(), original = JSON.stringify(source), plan = planStudioNativeBrushDocument(source, options);
    expect(plan.samples[1]).toMatchObject({ x: 210.75 - plan.bounds.x, y: 210.5 - plan.bounds.y,
      pressure: 0.8, tiltX: 30 / 90, tiltY: -20 / 90, tMs: 16 });
    expect(plan.bounds.width).toBe(plan.surface.width);
    expect(plan.warnings).toEqual([]); expect(JSON.stringify(source)).toBe(original);
    source.points[0] = 900;
    expect(plan.sourceRevision).toBe(original); expect(plan.samples[0]!.x + plan.bounds.x).toBe(150.25);
  });
  it("declares explicit legacy pressure/time defaults instead of inventing recorded sensors", () => {
    const plan = planStudioNativeBrushDocument(stroke({ pressures: undefined, sampleTimeOffsets: undefined }), options);
    expect(plan.samples.map((sample) => sample.pressure)).toEqual([0.5, 0.5, 0.5]);
    expect(plan.samples.map((sample) => sample.tMs)).toEqual([0, 8, 16]); expect(plan.warnings).toHaveLength(2);
  });
  it.each([
    ["non-freehand", { kind: "rect" }], ["eraser", { mode: "eraser" }], ["locked", { locked: true }],
    ["hidden", { hidden: true }], ["mask", { maskSrc: "data:mask" }], ["clipped", { clipBelow: true }],
    ["blend", { blendMode: "multiply" }], ["missing pressure sample", { pressures: [0.5] }],
    ["invalid pressure", { pressures: [0, 2, 0] }], ["time regression", { sampleTimeOffsets: [0, 30, 20] }],
    ["outside document", { points: [-1, 0, 10, 20] }], ["nonfinite", { strokeWidth: NaN }],
    ["oversized brush", { strokeWidth: 129 }], ["invalid opacity", { opacity: 2 }],
  ])("rejects %s without modifying the source", (_name, patch) => {
    const source = stroke(patch as Partial<DrawEl>), before = JSON.stringify(source);
    expect(() => planStudioNativeBrushDocument(source, options)).toThrow();
    expect(JSON.stringify(source)).toBe(before);
  });
  it("rejects an oversized crop without downsampling", () => {
    expect(() => planStudioNativeBrushDocument(stroke({ points: [100, 20, 100, 4000], pressures: undefined,
      tiltXs: undefined, tiltYs: undefined, sampleTimeOffsets: undefined }), { ...options, documentHeight: 8000 })).toThrow(/2048/);
  });
  it("marks clipping as intentional only at the actual document boundary", () => {
    const plan = planStudioNativeBrushDocument(stroke({ points: [0, 10, 20, 30, 50, 45] }), options);
    expect(plan.bounds.x).toBe(0); expect(plan.bounds.y).toBe(0);
    expect(plan.clipEdges).toEqual([true, true, false, false]);
  });
});

describe("native document transaction", () => {
  it("keeps the source intact except visibility and inserts exactly one image with source opacity", () => {
    const source = stroke(), current = state(source), before = JSON.stringify(current.elements);
    const plan = planStudioNativeBrushDocumentReplacement(current, result(source), () => "baked")!;
    expect(plan.nextElements).toHaveLength(2);
    expect(plan.nextElements[0]).toEqual({ ...source, hidden: true });
    expect(plan.nextElements[1]).toMatchObject({ id: "baked", type: "image", opacity: 0.35, rotation: 0 });
    expect(JSON.stringify(current.elements)).toBe(before);
  });
  it("refuses stale geometry, tampered placement, invalid PNG and duplicate image IDs", () => {
    const source = stroke(), current = state(source), receipt = result(source);
    expect(planStudioNativeBrushDocumentReplacement(state(stroke({ strokeWidth: 20 })), receipt)).toBeNull();
    expect(planStudioNativeBrushDocumentReplacement(current, { ...receipt, bounds: { ...receipt.bounds, x: 999 } })).toBeNull();
    expect(planStudioNativeBrushDocumentReplacement(current, { ...receipt, src: "data:text/html,hello" as typeof receipt.src })).toBeNull();
    expect(planStudioNativeBrushDocumentReplacement(current, receipt, () => source.id)).toBeNull();
  });
  it("preserves group/role/color and checks inherited locks again at commit", () => {
    const source = stroke({ groupId: "g", noClip: true, layerColor: "red" });
    const current = state(source);
    expect(planStudioNativeBrushDocumentReplacement(current, result(source))!.nextElements[1])
      .toMatchObject({ groupId: "g", noClip: true, layerColor: "red" });
    expect(planStudioNativeBrushDocumentReplacement({ ...current,
      groups: [{ id: "g", name: "group", locked: true, hidden: false, collapsed: false }] }, result(source))).toBeNull();
  });
  it("commits once and only after the document authority accepts the transaction", () => {
    const source = stroke(), current = state(source), commit = vi.fn(() => true), onCommitted = vi.fn();
    const prepared = prepareStudioNativeBrushDocumentCommit({ pageId: "p", masterEditMode: false,
      sourceElementId: source.id, sourceRevision: studioNativeBrushSourceRevision(source) },
    { read: () => current, canMutate: () => true, commit, onCommitted })!;
    expect(prepared(result(source))).toBe(true); expect(prepared(result(source))).toBe(false);
    expect(commit).toHaveBeenCalledTimes(1); expect(onCommitted).toHaveBeenCalledTimes(1);
  });
  it.each(["page", "history", "undo", "master", "lock", "source"])('rejects a changed %s frontier', (change) => {
    const source = stroke(); let current = state(source), allowed = true;
    const commit = vi.fn(() => true);
    const prepared = prepareStudioNativeBrushDocumentCommit({ pageId: "p", masterEditMode: false,
      sourceElementId: source.id, sourceRevision: studioNativeBrushSourceRevision(source) },
    { read: () => current, canMutate: () => allowed, commit, onCommitted: vi.fn() })!;
    if (change === "page") current = { ...current, pageId: "other" };
    if (change === "history") current = { ...current, historyIdentity: {} };
    if (change === "undo") current = { ...current, historyIndex: 1 };
    if (change === "master") current = { ...current, masterEditMode: true };
    if (change === "lock") allowed = false;
    if (change === "source") current = { ...current, elements: [stroke({ opacity: 0.8 })] };
    expect(prepared(result(source))).toBe(false); expect(commit).not.toHaveBeenCalled();
  });
  it("does not announce a failed commit or lose the original", () => {
    const current = state(), onCommitted = vi.fn();
    const prepared = prepareStudioNativeBrushDocumentCommit({ pageId: "p", masterEditMode: false,
      sourceElementId: "ink", sourceRevision: studioNativeBrushSourceRevision(stroke()) },
    { read: () => current, canMutate: () => true, commit: () => false, onCommitted })!;
    expect(prepared(result())).toBe(false); expect(onCommitted).not.toHaveBeenCalled();
    expect(current.elements[0]?.hidden).toBeUndefined();
  });
  it("round-trips canonical project save/load and exports only the baked visible image", async () => {
    const elements = planStudioNativeBrushDocumentReplacement(state(), result(), () => "baked")!.nextElements;
    const serialized = serializeStudioProjectDocument({ version: 2, title: "Native brush", currentPageId: "p",
      pagesList: [{ id: "p", elements, bg: "#ffffff", bgGrad: null, canvasH: 1000 }] },
    { documentId: "native-document", revision: 1, createdAt: "2026-09-19T00:00:00.000Z", updatedAt: "2026-09-19T00:00:00.000Z" });
    const loaded = await parseStudioProjectDocument(serialized);
    const reopened = loaded.project.pagesList[0]!.elements as El[];
    expect(reopened[0]).toMatchObject({ id: "ink", hidden: true, type: "draw" });
    expect(reopened[1]).toMatchObject({ id: "baked", type: "image", src: result().src, opacity: 0.35 });
    const exported = exportPageToSvg({ width: 720, height: 1000, bg: "#ffffff", elements: reopened });
    expect(exported.svg).toContain(result().src);
    expect(exported.svg.match(/<image\b/gu)).toHaveLength(1);
  });
});

describe("native document PNG transport", () => {
  it("checks PNG signature, dimensions, byte budgets and digest shape", () => {
    const reply = pngReply(128, 96), surface = { width: 128, height: 96 };
    expect(validateNativeBrushDocumentOutput(reply, surface)).toBe(true);
    expect(validateNativeBrushDocumentOutput(reply, { width: 127, height: 96 })).toBe(false);
    expect(validateNativeBrushDocumentOutput({ ...reply, pngHash: "bad" }, surface)).toBe(false);
    new Uint8Array(reply.png)[0] = 0;
    expect(validateNativeBrushDocumentOutput(reply, surface)).toBe(false);
  });
  it("verifies the Worker digest before returning a durable image and always disposes", async () => {
    const plan = planStudioNativeBrushDocument(stroke(), options), reply = pngReply(plan.surface.width, plan.surface.height);
    const raw = { request: vi.fn().mockResolvedValueOnce({ type: "ready" }).mockResolvedValueOnce(reply), dispose: vi.fn() };
    const output = await renderStudioNativeBrushDocument(plan, new AbortController().signal, () => raw as unknown as StudioNativeBrushProbeClient);
    expect(output.pngHash).toBe(reply.pngHash); expect(output.src).toMatch(/^data:image\/png;base64,iVBORw0KGgo/u);
    expect(raw.dispose).toHaveBeenCalledTimes(1);
  });
  it("rejects a corrupted PNG rather than hiding the original", async () => {
    const plan = planStudioNativeBrushDocument(stroke(), options), reply = pngReply(plan.surface.width, plan.surface.height);
    const raw = { request: vi.fn().mockResolvedValueOnce({ type: "ready" }).mockResolvedValueOnce({ ...reply, pngHash: "a".repeat(64) }), dispose: vi.fn() };
    await expect(renderStudioNativeBrushDocument(plan, new AbortController().signal, () => raw as unknown as StudioNativeBrushProbeClient)).rejects.toThrow(/무결성/);
    expect(raw.dispose).toHaveBeenCalledTimes(1);
  });
  it("does not start a Worker for an already-cancelled conversion", async () => {
    const controller = new AbortController(); controller.abort(); const create = vi.fn();
    await expect(renderStudioNativeBrushDocument(planStudioNativeBrushDocument(stroke(), options), controller.signal, create)).rejects.toMatchObject({ name: "AbortError" });
    expect(create).not.toHaveBeenCalled();
  });
});


describe("native brush editor reference adapter", () => {
  function ports() {
    const current = state();
    return { canApply: vi.fn(() => true), commit: vi.fn(() => true),
      history: { current: [[{ id: "p", elements: [...current.elements], groups: current.groups, canvasH: 1000, bg: "#fff", bgGrad: null }]] },
      index: { current: 0 }, pageId: { current: "p" }, masterEditMode: { current: false },
      mounted: { current: true }, saving: { current: false }, collaboration: { current: { locked: false } },
      surfaceLocked: { current: false }, drawing: { current: null as unknown }, pending: { current: null as unknown },
      documentWidth: 720, select: vi.fn(), announce: vi.fn() };
  }
  const target = () => ({ pageId: "p", masterEditMode: false, sourceElementId: "ink", sourceRevision: studioNativeBrushSourceRevision(stroke()) });
  it("preserves the ticket and commits once through the ordinary history owner", () => {
    const runtime = ports(); const ticket = {}; const prepared = prepareStudioNativeBrushDocumentFromEditor(target(), ticket, runtime)!;
    expect(prepared(result())).toBe(true); expect(prepared(result())).toBe(false);
    expect(runtime.canApply).toHaveBeenCalledWith(ticket); expect(runtime.commit).toHaveBeenCalledOnce();
    expect(runtime.select).toHaveBeenCalledOnce();
  });
  it.each(["saving", "surfaceLocked", "drawing", "pending"] as const)("rejects late %s changes", (key) => {
    const runtime = ports(); const prepared = prepareStudioNativeBrushDocumentFromEditor(target(), {}, runtime)!;
    runtime[key].current = true; expect(prepared(result())).toBe(false); expect(runtime.commit).not.toHaveBeenCalled();
  });
  it("rejects a page/history frontier changed during processing", () => {
    const runtime = ports(); const prepared = prepareStudioNativeBrushDocumentFromEditor(target(), {}, runtime)!;
    runtime.history.current = [...runtime.history.current];
    expect(prepared(result())).toBe(false); expect(runtime.commit).not.toHaveBeenCalled();
  });
});
