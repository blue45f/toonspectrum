import type { StudioCrdtJsonValue } from "./live/studio-crdt-scene-schema";
import { STUDIO_ADJUSTMENT_ENGINE_IDS, studioAdjustmentDefaultParams } from "./studio-adjustment-stack";
import { describe, expect, it } from "vitest";
import { StudioLiveAdjustmentMetadataSchema } from "./contracts/studio-live-adjustment-contract";
import { validateStudioCrdtSceneElementPayload } from "./live/studio-crdt-scene-schema";
import { buildStudioProjectArchive, importStudioProjectArchive } from "./studio-project-archive";
import { parseStudioProjectFile, serializeStudioProjectFile } from "./studio-project-file";
import { createStudioWorkAssetInitialImageDescriptor } from "./studio-work-asset-admission";
import { buildStudioLiveAdjustmentRenderTree, createStudioLiveAdjustment, createStudioLiveAdjustmentPlan } from "./studio-live-adjustment";
import { createStudioAdjustmentLayerRuntimeRecipe, executeStudioAdjustmentLayerRuntime, executeStudioAdjustmentLayerRuntimeSync } from "./studio-adjustment-layer-runtime";
import { studioDocumentAllowsKonvaHide } from "./render/studio-document-scene-lower";
import type { El } from "./studio-element-model";

const image = (id: string): El => ({ ...createStudioLiveAdjustment(id, 800, 1080), adjustmentLayer: undefined });
const invert = () => ({ ...createStudioLiveAdjustment("adjust", 800, 1080), smartFilters: { version: 1 as const, entries: [{ id: "invert", engine: "invert" as const, enabled: true, params: {} }] } });
const project = (elements: unknown[]) => ({ version: 2, title: "live adjustment", description: "", tagsText: "", pagesList: [{ id: "page", elements, bg: "#ffffff", bgGrad: null, canvasH: 1080 }], currentPageId: "page", webtoonTheme: "classic", panelGutter: 24 });

describe("live adjustment document consumers", () => {
  it("folds the real painter order and keeps the original elements immutable", () => {
    const elements = [image("a"), image("b"), invert(), image("c")];
    const before = structuredClone(elements);
    const tree = buildStudioLiveAdjustmentRenderTree(elements, () => true);
    expect(tree.map((node) => node.id)).toEqual(["adjust", "c"]);
    expect(tree[0]).toMatchObject({ kind: "adjustment", children: [{ id: "a" }, { id: "b" }] });
    expect(elements).toEqual(before);
    expect(tree[0]?.kind === "adjustment" && tree[0].element).toBe(elements[2]);
  });
  it("clips the prior composite without reapplying earlier adjustments to all sources", () => {
    const first = invert(); const second = { ...invert(), id: "second", adjustmentLayer: { version: 1 as const, scope: "clip-previous" as const } };
    const tree = buildStudioLiveAdjustmentRenderTree([image("a"), first, image("b"), second], () => true);
    expect(tree.map((node) => node.id)).toEqual(["adjust", "second"]);
    expect(tree[1]).toMatchObject({ children: [{ kind: "content", id: "b" }] });
    const stacked = buildStudioLiveAdjustmentRenderTree([image("a"), first, second], () => true);
    expect(stacked[0]).toMatchObject({ children: [{ kind: "adjustment", id: "adjust", children: [{ id: "a" }] }] });
  });
  it("retains the clipped source blend/eraser operation outside the isolated filter composite", () => {
    const correction = { ...invert(), adjustmentLayer: { version: 1 as const, scope: "clip-previous" as const } };
    const multiply = buildStudioLiveAdjustmentRenderTree([image("a"), { ...image("b"), blendMode: "multiply" }, correction], () => true);
    expect(multiply[1]).toMatchObject({ composite: "multiply", isolatedSource: true });
    const eraser: El = { id: "erase", type: "draw", kind: "freehand", mode: "eraser", brush: "pen", points: [1, 2, 3, 4], stroke: "#fff", strokeWidth: 2 };
    expect(buildStudioLiveAdjustmentRenderTree([image("a"), eraser, correction], () => true)[1]).toMatchObject({ composite: "destination-out" });
    // The existing Layer > Clipping command remains authoritative when it toggles clipBelow.
    expect(buildStudioLiveAdjustmentRenderTree([image("a"), image("b"), { ...invert(), clipBelow: true }], () => true)[1]).toMatchObject({ children: [{ id: "b" }] });
  });
  it.each([{ version: 2, entries: [] }, { version: 1, entries: [{ id: "bad", engine: "missing-engine", enabled: true, params: {} }] }])("rejects a malformed graph program instead of silently displaying an empty stack: %j", (smartFilters) => {
    expect(() => parseStudioProjectFile(project([{ ...invert(), smartFilters }]))).toThrow();
  });
  it("limits grouped adjustments to their folder while root adjustments include preceding folders", () => {
    const tree = buildStudioLiveAdjustmentRenderTree([image("a"), { ...image("b"), groupId: "folder" }, { ...invert(), groupId: "folder" }, { ...invert(), id: "root" }], () => true);
    expect(tree[0]).toMatchObject({ id: "root", children: [{ id: "a" }, { id: "folder", children: [{ id: "adjust", children: [{ id: "b" }] }] }] });
  });
  it("visibility and reorder change actual input scope instead of a stale cached graph", () => {
    const adjustment = invert();
    const visible = (element: El) => !element.hidden;
    expect(buildStudioLiveAdjustmentRenderTree([image("a"), { ...adjustment, hidden: true }], visible).map((node) => node.id)).toEqual(["a"]);
    expect(buildStudioLiveAdjustmentRenderTree([adjustment, image("a")], visible)[0]).toMatchObject({ kind: "adjustment", children: [] });
    expect(buildStudioLiveAdjustmentRenderTree([{ ...image("a"), hidden: true }, adjustment], visible)[0]).toMatchObject({ children: [] });
  });
  it.each([{ version: 2, scope: "composite-below" }, { version: 1, scope: "all" }, { version: 1, scope: "clip-previous", pixels: [1] }, null])("rejects unsupported metadata at project/CRDT/asset admission: %j", (metadata) => {
    expect(StudioLiveAdjustmentMetadataSchema.safeParse(metadata).success).toBe(false);
    const element = { ...invert(), adjustmentLayer: metadata };
    expect(() => parseStudioProjectFile(project([element]))).toThrow(/보정 레이어/);
    expect(() => createStudioWorkAssetInitialImageDescriptor(element)).toThrow();
    expect(() => validateStudioCrdtSceneElementPayload({ version: 1, type: "reference", props: { elementType: "image", x: 0, y: 0, width: 800, height: 1080, rotation: 0, adjustmentLayer: metadata as StudioCrdtJsonValue } })).toThrow();
  });
  it("roundtrips the graph and ordered filters through actual JSON, archive and strict CRDT admission", async () => {
    const element = invert();
    element.smartFilters.entries.push({ id: "second", engine: "invert", enabled: true, params: {} });
    const document = parseStudioProjectFile(project([image("source"), element]));
    const reopened = parseStudioProjectFile(JSON.parse(serializeStudioProjectFile(document)));
    expect(reopened.pagesList[0]!.elements[1]).toEqual(element);
    const archived = await buildStudioProjectArchive({ project: document }, { crc32ExecutionMode: "direct-headless" });
    const imported = await importStudioProjectArchive(archived.blob);
    expect(imported.project.pagesList[0]!.elements[1]).toMatchObject({ adjustmentLayer: element.adjustmentLayer, smartFilters: element.smartFilters });
    const descriptor = createStudioWorkAssetInitialImageDescriptor(element);
    expect(descriptor.element.adjustmentLayer).toEqual(element.adjustmentLayer);
    const payload = validateStudioCrdtSceneElementPayload({ version: 1, type: "reference", props: { elementType: "image", x: 0, y: 0, width: 800, height: 1080, rotation: 0, smartFilters: descriptor.element.smartFilters!, adjustmentLayer: descriptor.element.adjustmentLayer! } });
    expect(payload.props.adjustmentLayer).toEqual(element.adjustmentLayer);
  });
  it.each(STUDIO_ADJUSTMENT_ENGINE_IDS)("preserves the actual %s manager engine through immutable descriptor and CRDT", (engine) => {
    const element = { ...invert(), smartFilters: { version: 1 as const, entries: [{ id: "effect", engine, enabled: true, opacity: 0.25, params: studioAdjustmentDefaultParams(engine) }] } };
    const descriptor = createStudioWorkAssetInitialImageDescriptor(element);
    expect(descriptor.element.smartFilters).toEqual(element.smartFilters);
    const payload = validateStudioCrdtSceneElementPayload({ version: 1, type: "reference", props: { elementType: "image", x: 0, y: 0, width: 800, height: 1080, rotation: 0, smartFilters: element.smartFilters, adjustmentLayer: element.adjustmentLayer } });
    expect(payload.props.smartFilters).toEqual(element.smartFilters);
  });
  it("does not hand a live adjustment document to a renderer that only knows raster/vector elements", () => {
    expect(studioDocumentAllowsKonvaHide([invert()], ["adjust"])).toBe(false);
  });
});

describe("actual cache compositor pixels", () => {
  it.each([0, 0.5, 1])("matches asynchronous CPU output with mask and layer opacity %s", async (opacity) => {
    const element = { ...invert(), opacity };
    const source = { revision: "source-1", width: 2, height: 1, renderKinds: ["group" as const], imageData: { width: 2, height: 1, data: new Uint8ClampedArray([10, 40, 90, 128, 128, 20, 80, 255]) } };
    const original = source.imageData.data.slice();
    const mask = { id: "adjust:mask", revision: "mask-1", width: 2, height: 1, data: new Uint8ClampedArray([255, 0]) };
    const recipe = createStudioAdjustmentLayerRuntimeRecipe({ plan: createStudioLiveAdjustmentPlan(element, ["source"], true), source, masks: [mask] });
    const sync = executeStudioAdjustmentLayerRuntimeSync(recipe, source, { masks: [mask] });
    const async = await executeStudioAdjustmentLayerRuntime(recipe, source, { masks: [mask] });
    expect(sync).toEqual(async);
    expect([...sync.imageData.data.slice(4)]).toEqual([128, 20, 80, 255]);
    expect(sync.imageData.data[3]).toBe(128);
    expect(sync.imageData.data[0]).toBe(Math.round(10 + 235 * opacity));
    expect(source.imageData.data).toEqual(original);
  });
  it("rejects cancelled, stale and over-budget synchronous captures without touching original pixels", () => {
    const source = { revision: 1, width: 1, height: 1, renderKinds: ["group" as const], imageData: { width: 1, height: 1, data: new Uint8ClampedArray([10, 20, 30, 0]) } };
    const recipe = createStudioAdjustmentLayerRuntimeRecipe({ plan: createStudioLiveAdjustmentPlan(invert(), ["source"], false), source });
    const controller = new AbortController(); controller.abort();
    expect(() => executeStudioAdjustmentLayerRuntimeSync(recipe, source, { signal: controller.signal })).toThrow(/aborted/);
    expect(() => executeStudioAdjustmentLayerRuntimeSync(recipe, { ...source, revision: 2 })).toThrow(/stale/);
    expect(() => executeStudioAdjustmentLayerRuntimeSync(recipe, source, { limits: { maxWorkingBytes: 1 } })).toThrow(/budget/);
    expect([...source.imageData.data]).toEqual([10, 20, 30, 0]);
  });
});
