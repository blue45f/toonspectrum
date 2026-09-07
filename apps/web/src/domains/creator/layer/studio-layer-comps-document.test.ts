import { describe, expect, it, vi } from "vitest";

import { createStudioLiveResourceLeaseController } from "../live/createStudioLiveResourceLeaseController";
import { studioPageToCrdtPage } from "../live/studio-crdt-page-bridge";
import { STUDIO_CRDT_PAGE_MAX_BYTES } from "../live/studio-crdt-scene-schema";
import type { StudioLiveRoom } from "../live/studio-live-collaboration-room";
import { createDefaultStudioDrawingAssistDocument } from "../brush/studio-drawing-assist-document";
import { isEffectivelyHidden } from "../studio-layers";
import type { PageState } from "../studio-page-state";
import { duplicateMirroredPage, duplicatePageState } from "../studio-pages";
import { parseStudioProjectFile, serializeStudioProjectFile } from "../studio-project-file";
import { captureLayerComp, STUDIO_LAYER_COMPS_MAX_COUNT } from "./studio-layer-comps";
import {
  applyStudioElementLayerComp,
  applyStudioLayerCompTransaction,
  captureStudioLayerCompTransaction,
  changeStudioLayerCompsTransaction,
  parseStudioLayerComps,
  planStudioLayerCompApplication,
  remapStudioLayerComps,
} from "./studio-layer-comps-document";

const comp = captureLayerComp("선화", [
  { id: "ink", visible: true, opacity: 0.7 },
  { id: "color", visible: false, opacity: 0.4 },
], "comp-1", 1000);
const page = { id: "p1", elements: [], bg: "#fff", bgGrad: null, canvasH: 1080 };

describe("layer comp capture at the retained stroke boundary", () => {
  function fixture() {
    const pendingElement: PageState["elements"][number] = {
      id: "just-finished", type: "image", x: 0, y: 0, width: 10, height: 10,
      rotation: 0, src: "", opacity: 0.8, blendMode: "multiply", groupId: "folder",
    };
    let current: PageState = { ...page, layerComps: [comp] };
    const prepare = vi.fn(() => {
      current = { ...current, elements: [pendingElement], groups: [{ id: "folder", name: "선화", hidden: true }] };
      return true;
    });
    const commit = vi.fn(() => true);
    const options = { prepare, getPage: () => current, canMutate: vi.fn(() => true),
      validatePage: studioPageToCrdtPage, acquire: vi.fn(async () => true), synchronize: vi.fn<() => Promise<void>>(async () => undefined), release: vi.fn(), commit, reportError: vi.fn() };
    return { options, pendingElement };
  }

  it.each([false, true])("captures a completed stroke from the post-flush page (update=%s)", async (update) => {
    const { options, pendingElement } = fixture();
    expect(await captureStudioLayerCompTransaction({ ...options, name: "즉시 캡처", ...(update ? { compId: comp.id } : {}) })).toBe(true);
    expect(options.prepare).toHaveBeenCalledTimes(1);
    expect(options.commit).toHaveBeenCalledTimes(1);
    const [elements, patch, pageId] = options.commit.mock.calls[0] as unknown as [PageState["elements"], { layerComps: typeof comp[] }, string];
    const captured = update ? patch.layerComps[0] : patch.layerComps[1];
    expect(elements).toEqual([pendingElement]);
    expect(pageId).toBe("p1");
    expect(captured.layerStates["just-finished"]).toMatchObject({ opacity: 0.8, blendMode: "multiply", groupId: "folder", visible: true });
    expect(captured.groupStates).toEqual({ folder: { groupId: "folder", visible: false } });
    if (update) expect(captured.name).toBe(comp.name);
  });

  it.each(["rename", "delete"])("keeps a newly flushed stroke during a %s metadata commit", async (operation) => {
    const { options, pendingElement } = fixture();
    const nextComps = operation === "rename" ? [{ ...comp, name: "새 이름" }] : [];
    expect(await changeStudioLayerCompsTransaction({ ...options, nextComps })).toBe(true);
    expect(options.commit).toHaveBeenCalledWith([pendingElement], { layerComps: nextComps }, "p1");
  });

  it.each(["capture", "metadata"])("does not %s after a rejected retained-stroke flush", async (operation) => {
    const { options } = fixture();
    options.prepare.mockReturnValue(false);
    const result = operation === "capture"
      ? await captureStudioLayerCompTransaction({ ...options, name: "보류" })
      : await changeStudioLayerCompsTransaction({ ...options, nextComps: [] });
    expect(result).toBe(false);
    expect(options.commit).not.toHaveBeenCalled();
  });

  it("rechecks the mutation gate after preparation and rejects invalid metadata", async () => {
    const { options } = fixture();
    options.canMutate.mockReturnValueOnce(true).mockReturnValue(false);
    expect(await captureStudioLayerCompTransaction({ ...options, name: "보류" })).toBe(false);
    expect(options.commit).not.toHaveBeenCalled();
    options.canMutate.mockReturnValue(true);
    expect(await changeStudioLayerCompsTransaction({ ...options, nextComps: [comp, comp] })).toBe(false);
    expect(await captureStudioLayerCompTransaction({ ...options, name: "x".repeat(161) })).toBe(false);
    expect(await captureStudioLayerCompTransaction({ ...options, name: "삭제됨", compId: "removed" })).toBe(false);
    expect(options.commit).not.toHaveBeenCalled();
  });

  it("rejects capture at the document limit while allowing an existing comp to be updated", async () => {
    const comps = Array.from({ length: STUDIO_LAYER_COMPS_MAX_COUNT }, (_, index) => ({
      ...comp, id: `comp-${index}`, layerStates: {},
    }));
    const current: PageState = { ...page, layerComps: comps };
    const { options } = fixture();
    const context = { ...options, prepare: () => true, getPage: () => current };
    expect(await captureStudioLayerCompTransaction({ ...context, name: "65번째 콤프" })).toBe(false);
    expect(options.commit).not.toHaveBeenCalled();
    expect(options.reportError).toHaveBeenCalledWith("페이지마다 콤프를 64개까지 저장할 수 있어요.");
    expect(current.layerComps).toBe(comps);
    expect(await captureStudioLayerCompTransaction({ ...context, name: "갱신", compId: comps[0].id })).toBe(true);
    expect(options.commit).toHaveBeenCalledExactlyOnceWith([], {
      layerComps: [expect.objectContaining({ id: comps[0].id, layerStates: {}, groupStates: {} }), ...comps.slice(1)],
    }, "p1");
  });

  it.each(["empty", "legacy-layer"])("captures a %s page without guessing absent appearance metadata", async (kind) => {
    const elements: PageState["elements"] = kind === "empty" ? [] : [{
      id: "legacy", type: "image", x: 0, y: 0, width: 20, height: 30, rotation: 0, src: "",
    }];
    const current: PageState = { ...page, elements };
    const { options } = fixture();
    expect(await captureStudioLayerCompTransaction({
      ...options, prepare: () => true, getPage: () => current, name: "기본 표시 상태",
    })).toBe(true);
    expect(options.commit).toHaveBeenCalledExactlyOnceWith(elements, {
      layerComps: [expect.objectContaining({
        name: "기본 표시 상태",
        layerStates: kind === "empty" ? {} : {
          legacy: { layerId: "legacy", visible: true, opacity: 1, blendMode: "source-over" },
        },
        groupStates: {},
      })],
    }, "p1");
    expect(current).not.toHaveProperty("layerComps");
    if (kind === "legacy-layer") {
      expect(current.elements[0]).not.toHaveProperty("opacity");
      expect(current.elements[0]).not.toHaveProperty("blendMode");
    }
  });
});

describe("layer comp transactions respect the aggregate page wire budget", () => {
  const emptyComp = captureLayerComp("x", [], "empty-comp", 1);

  function fixture(current: PageState) {
    return {
      prepare: vi.fn(() => true), getPage: () => current, canMutate: () => true,
      acquire: vi.fn(async () => true), synchronize: vi.fn<() => Promise<void>>(async () => undefined), release: vi.fn(), validatePage: vi.fn(studioPageToCrdtPage), commit: vi.fn(() => true), reportError: vi.fn(),
    };
  }

  function pageAtWireLimit(): PageState {
    const current: PageState = {
      ...page, layerComps: [emptyComp], name: "한글 페이지", note: "메모\\\"\n",
      bgGrad: ["#fff", "#111"], hideMaster: true, shotType: "와이드", cameraAngle: "로우",
      paperSurface: { kind: "washi", seed: 1 }, paperGrainVisible: true,
      drawingAssist: createDefaultStudioDrawingAssistDocument({ canvasWidth: 800, canvasHeight: 1080 }),
    };
    const bytes = new TextEncoder().encode(JSON.stringify(studioPageToCrdtPage(current).payload)).byteLength;
    current.note += "x".repeat(STUDIO_CRDT_PAGE_MAX_BYTES - bytes);
    expect(new TextEncoder().encode(JSON.stringify(studioPageToCrdtPage(current).payload)).byteLength)
      .toBe(STUDIO_CRDT_PAGE_MAX_BYTES);
    return current;
  }

  it.each(["capture", "update"] as const)("rejects a valid 96-layer %s before committing an unsynchronizable comp", async (operation) => {
    const current: PageState = {
      ...page, layerComps: [emptyComp],
      elements: Array.from({ length: 96 }, (_, index) => ({
        id: `layer-${index}-${"x".repeat(24)}`, type: "image", x: 0, y: 0,
        width: 10, height: 10, rotation: 0, src: "", opacity: 0.75, blendMode: "multiply",
      })),
    };
    const oversized = captureLayerComp("형식상 유효", current.elements.map((element) => ({
      id: element.id, visible: true, opacity: 0.75, blendMode: "multiply",
    })), "oversized", 1);
    expect(parseStudioLayerComps([oversized])).not.toBeNull();
    expect(() => studioPageToCrdtPage({ ...current, layerComps: [oversized] })).toThrow(/8KiB/u);
    const before = structuredClone(current);
    const options = fixture(current);

    expect(await captureStudioLayerCompTransaction({
      ...options, name: "추가", ...(operation === "update" ? { compId: emptyComp.id } : {}),
    })).toBe(false);
    expect(options.prepare).toHaveBeenCalledOnce();
    expect(options.validatePage).toHaveBeenCalledOnce();
    expect(options.commit).not.toHaveBeenCalled();
    expect(options.reportError).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("콤프 저장 용량"));
    expect(current).toEqual(before);
  });

  it("measures every comp together with existing page metadata, not each preset separately", async () => {
    const first = { ...emptyComp, notes: "x".repeat(3_000) };
    const second = { ...first, id: "second" };
    const current: PageState = { ...page, note: "메".repeat(700), layerComps: [first] };
    expect(() => studioPageToCrdtPage(current)).not.toThrow();
    expect(() => studioPageToCrdtPage({ ...current, layerComps: [second] })).not.toThrow();
    expect(parseStudioLayerComps([first, second])).not.toBeNull();
    expect(() => studioPageToCrdtPage({ ...current, layerComps: [first, second] })).toThrow(/8KiB/u);
    const options = fixture(current);
    expect(await changeStudioLayerCompsTransaction({ ...options, nextComps: [first, second] })).toBe(false);
    expect(options.commit).not.toHaveBeenCalled();
    expect(current.layerComps).toEqual([first]);
  });

  it("accepts exactly 8192 UTF-8 bytes with normalized guides, paper, escaped text and every page property", async () => {
    const current = pageAtWireLimit();
    const nextComps = [{ ...emptyComp, name: "y" }];
    const options = fixture(current);
    expect(await changeStudioLayerCompsTransaction({ ...options, nextComps })).toBe(true);
    expect(options.validatePage).toHaveBeenCalledExactlyOnceWith({ ...current, layerComps: nextComps });
    expect(options.commit).toHaveBeenCalledExactlyOnceWith(current.elements, { layerComps: nextComps }, current.id);
    expect(options.reportError).not.toHaveBeenCalled();
  });

  it.each(["xy", "한"])("rejects an aggregate overflow caused only by renaming to %s", async (name) => {
    const current = pageAtWireLimit();
    const options = fixture(current);
    const nextComps = [{ ...emptyComp, name }];
    expect(parseStudioLayerComps(nextComps)).not.toBeNull();
    expect(() => studioPageToCrdtPage({ ...current, layerComps: nextComps })).toThrow(/8KiB/u);
    expect(await changeStudioLayerCompsTransaction({ ...options, nextComps })).toBe(false);
    expect(options.commit).not.toHaveBeenCalled();
    expect(current.layerComps?.[0].name).toBe("x");
  });

  it("checks the post-flush metadata instead of allowing an edit against the stale page budget", async () => {
    const before = pageAtWireLimit();
    const latest = { ...before, note: `${before.note}x` };
    let current = before;
    const options = {
      ...fixture(before), getPage: () => current,
      prepare: vi.fn(() => { current = latest; return true; }),
    };
    expect(await changeStudioLayerCompsTransaction({ ...options, nextComps: [emptyComp] })).toBe(false);
    expect(options.validatePage).toHaveBeenCalledExactlyOnceWith(latest);
    expect(options.commit).not.toHaveBeenCalled();
  });

  it("allows deletion to bring an oversized legacy page back inside the existing wire limit", async () => {
    const first = { ...emptyComp, notes: "x".repeat(4_000) };
    const second = { ...first, id: "second" };
    const current: PageState = { ...page, layerComps: [first, second] };
    expect(() => studioPageToCrdtPage(current)).toThrow(/8KiB/u);
    const options = fixture(current);
    expect(await changeStudioLayerCompsTransaction({ ...options, nextComps: [first] })).toBe(true);
    expect(options.commit).toHaveBeenCalledExactlyOnceWith(current.elements, { layerComps: [first] }, current.id);
  });
});

describe("page-owned layer comp document", () => {
  it("restores hidden flags and opacity for every captured element in one document result", () => {
    const elements = [
      { id: "ink", hidden: true, opacity: 1 },
      { id: "color", hidden: false, opacity: 1 },
      { id: "new", hidden: false, opacity: 0.2 },
    ];
    const next = applyStudioElementLayerComp(elements, comp);
    expect(next).toEqual([
      { id: "ink", hidden: false, opacity: 0.7 },
      { id: "color", hidden: true, opacity: 0.4 },
      elements[2],
    ]);
    expect(next[2]).toBe(elements[2]);
    expect(elements[0].hidden).toBe(true);
    expect(next[0]).not.toHaveProperty("visible");
  });

  it("survives a real project serialization round trip without adding metadata to legacy pages", () => {
    const payload = { version: 2, pagesList: [{ ...page, layerComps: [comp] }] };
    expect(parseStudioProjectFile(JSON.parse(serializeStudioProjectFile(payload))).pagesList[0].layerComps).toEqual([comp]);
    expect(parseStudioProjectFile({ version: 2, pagesList: [page] }).pagesList[0]).not.toHaveProperty("layerComps");
  });

  it.each([
    null,
    [comp, comp],
    [{ ...comp, name: "" }],
    [{ ...comp, createdAt: -1 }],
    [{ ...comp, layerStates: { ink: { layerId: "other", visible: true, opacity: 1 } } }],
    [{ ...comp, layerStates: { ink: { layerId: "ink", visible: "false", opacity: 1 } } }],
    [{ ...comp, layerStates: { ink: { layerId: "ink", visible: false, opacity: 2 } } }],
    ...[Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY].map((opacity) => [
      { ...comp, layerStates: { ink: { layerId: "ink", visible: false, opacity } } },
    ]),
    [{ ...comp, groupStates: { folder: { groupId: "other", visible: true } } }],
    [{ ...comp, groupStates: { folder: { groupId: "folder", visible: "false" } } }],
    Array.from({ length: STUDIO_LAYER_COMPS_MAX_COUNT + 1 }, (_, index) => ({ ...comp, id: `comp-${index}` })),
  ].map((value) => ({ value })))("rejects malformed or over-budget comp metadata %#", ({ value }) => {
    expect(parseStudioLayerComps(value)).toBeNull();
    expect(() => parseStudioProjectFile({ version: 2, pagesList: [{ ...page, layerComps: value }] })).toThrow(/레이어 콤프/u);
  });

  it.each(["duplicate", "mirror"])("remaps saved state to the %s page's own layer IDs", (kind) => {
    const source = { ...page, elements: [{ id: "ink", type: "image", x: 10, y: 20, width: 30 }], layerComps: [comp] };
    let sequence = 0;
    const makeId = () => `copy-${++sequence}`;
    const copied = kind === "duplicate"
      ? duplicatePageState(source, makeId)
      : duplicateMirroredPage(source, makeId, 1440);
    const targetId = copied.elements[0].id;
    expect(copied.layerComps[0].layerStates).toEqual({
      [targetId]: { layerId: targetId, visible: true, opacity: 0.7 },
    });
    expect(Object.keys(source.layerComps[0].layerStates)).toEqual(["ink", "color"]);
    expect(remapStudioLayerComps("invalid", new Map())).toBeNull();
  });

  it.each(["duplicate", "mirror"].flatMap((kind) => [
    null,
    [{ ...comp, layerStates: { ink: { layerId: "different-layer", visible: true, opacity: 1 } } }],
    [comp, comp],
  ].map((value) => ({ kind, value }))))(
    "omits malformed comp metadata from a $kind while preserving the source and its artwork %#",
    ({ kind, value }) => {
      const source = {
        ...page,
        elements: [{ id: "ink", type: "image", x: 10, y: 20, width: 30, height: 40,
          rotation: 0, opacity: 0.8, src: "data:image/png;base64,AA==" }],
        layerComps: value,
      };
      const original = structuredClone(source);
      let sequence = 0;
      const makeId = () => `copy-${++sequence}`;
      const copied = kind === "duplicate"
        ? duplicatePageState(source, makeId)
        : duplicateMirroredPage(source, makeId, 1440);
      expect(copied).not.toHaveProperty("layerComps");
      expect(copied.id).not.toBe(source.id);
      expect(copied.elements[0].id).not.toBe("ink");
      expect(copied.elements[0]).toMatchObject({ opacity: 0.8, src: source.elements[0].src });
      expect(source).toEqual(original);
      const restored = parseStudioProjectFile(JSON.parse(serializeStudioProjectFile({
        version: 2, pagesList: [copied],
      })));
      expect(restored.pagesList[0]).not.toHaveProperty("layerComps");
      expect(restored.pagesList[0].elements[0]).toMatchObject({ opacity: 0.8, src: source.elements[0].src });
    },
  );

  it("restores folder visibility and both custom and default element blend modes", () => {
    const saved = captureLayerComp("그룹 숨김", [
      { id: "ink", visible: true, opacity: 0.7, blendMode: "multiply" },
      { id: "color", visible: true, opacity: 1, blendMode: "source-over" },
    ], "folder-comp", 1000, [{ id: "folder", hidden: true }]);
    const elements = [
      { id: "ink", groupId: "folder", hidden: false, opacity: 1, blendMode: "screen" },
      { id: "color", hidden: false, opacity: 1, blendMode: "multiply" },
    ];
    const groups = [{ id: "folder", name: "선화", hidden: false }];
    const plan = planStudioLayerCompApplication(elements, groups, saved);
    expect(plan.ok).toBe(true);
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.elements.map((element) => element.blendMode)).toEqual(["multiply", "source-over"]);
    expect(plan.elements[0].hidden).toBe(false);
    expect(isEffectivelyHidden(plan.elements[0], plan.groups)).toBe(true);
    expect(groups[0].hidden).toBe(false);
    expect(parseStudioProjectFile(JSON.parse(serializeStudioProjectFile({
      version: 2, pagesList: [{ ...page, elements, groups, layerComps: [saved] }],
    }))).pagesList[0].layerComps).toEqual([saved]);
  });

  it("keeps legacy comps compatible without guessing missing group or blend state", () => {
    const elements = [{ id: "ink", groupId: "folder", hidden: true, opacity: 1, blendMode: "screen" }];
    const groups = [{ id: "folder", name: "선화", hidden: true }];
    const plan = planStudioLayerCompApplication(elements, groups, comp);
    expect(plan.ok).toBe(true);
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.elements[0].blendMode).toBe("screen");
    expect(plan.groups).toBe(groups);
  });

  it("does not interpret inherited object properties as saved layer or folder IDs", () => {
    const elements = [{ id: "constructor", groupId: "toString", hidden: false, opacity: 1 }];
    const groups = [{ id: "toString", name: "가져온 그룹", hidden: false }];
    const plan = planStudioLayerCompApplication(elements, groups, { ...comp, groupStates: {} });
    expect(plan).toMatchObject({ ok: true, changedElementIds: [], groupsChanged: false });
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.elements).toBe(elements);
    expect(plan.groups).toBe(groups);
  });

  it.each(["element", "group", "hidden-group-with-locked-child", "empty-locked-group"])(
    "rejects the entire appearance change when it would alter a locked %s",
    (kind) => {
      const hideGroup = kind.includes("group-with") || kind === "empty-locked-group";
      const saved = captureLayerComp("잠금 보존", [
        { id: "ink", visible: true, opacity: hideGroup ? 1 : 0.7 },
      ], "locked-comp", 1000, [{ id: "folder", hidden: hideGroup }]);
      const elements = kind === "empty-locked-group" ? [] : [{
        id: "ink", opacity: 1, groupId: "folder", locked: kind !== "group",
      }];
      const groups = [{ id: "folder", name: "선화", locked: kind === "group" || kind === "empty-locked-group" }];
      expect(planStudioLayerCompApplication(elements, groups, saved)).toMatchObject({ ok: false });
      expect(elements[0]?.opacity).toBe(kind === "empty-locked-group" ? undefined : 1);
    },
  );

  it("preserves unchanged locked layers and remaps folder comps with a copied page", () => {
    const saved = captureLayerComp("그룹", [{ id: "ink", visible: true, opacity: 1 }], "comp", 1000,
      [{ id: "folder", hidden: true }]);
    const source = { ...page, elements: [{ id: "ink", opacity: 1, groupId: "folder", locked: true }],
      groups: [{ id: "folder", name: "선화", hidden: true }], layerComps: [saved] };
    const plan = planStudioLayerCompApplication(source.elements, source.groups, saved);
    expect(plan).toMatchObject({ ok: true, changedElementIds: [], groupsChanged: false });
    const copied = duplicatePageState(source, (() => { let id = 0; return () => `copy-${++id}`; })());
    expect(copied.layerComps[0].groupStates).toEqual(saved.groupStates);
    expect(copied.layerComps[0].layerStates[copied.elements[0].id]).toBeDefined();
  });
});

describe("layer comp lease and atomic document transaction", () => {
  function fixture() {
    let current: PageState | null = {
      ...page, layerComps: [comp],
      elements: [{ id: "ink", type: "image", x: 0, y: 0, width: 10, height: 10, rotation: 0, src: "", opacity: 1 }],
    };
    const commit = vi.fn(() => true);
    const acquire = vi.fn(async (_ids: readonly string[] | null) => true);
    const release = vi.fn();
    const reportError = vi.fn();
    const canMutate = vi.fn(() => true);
    const options = { comp, getPage: () => current, canMutate, acquire, synchronize: vi.fn<() => Promise<void>>(async () => undefined), release, commit, reportError };
    return { options, setPage: (next: PageState | null) => { current = next; } };
  }

  it("commits all captured properties once after acquiring page ownership, then releases", async () => {
    const { options } = fixture();
    expect(await applyStudioLayerCompTransaction(options)).toBe(true);
    expect(options.acquire).toHaveBeenCalledWith(null);
    expect(options.commit).toHaveBeenCalledTimes(1);
    expect(options.commit).toHaveBeenCalledWith([expect.objectContaining({ id: "ink", opacity: 0.7 })], {}, "p1");
    expect(options.release).toHaveBeenCalledTimes(1);
  });

  it("commits folder visibility and element appearance together in a single page transition", async () => {
    const { options, setPage } = fixture();
    setPage({ ...options.getPage()!, groups: [{ id: "folder", name: "선화", hidden: false }] });
    options.comp = { ...comp, groupStates: { folder: { groupId: "folder", visible: false } } };
    setPage({ ...options.getPage()!, layerComps: [options.comp] });
    expect(await applyStudioLayerCompTransaction(options)).toBe(true);
    expect(options.commit).toHaveBeenCalledTimes(1);
    expect(options.commit).toHaveBeenCalledWith(
      [expect.objectContaining({ id: "ink", opacity: 0.7 })],
      { groups: [{ id: "folder", name: "선화", hidden: true }] },
      "p1",
    );
  });

  it.each(["page-switch", "layer-change", "lock-change", "read-only", "unmount"])(
    "does not apply a stale comp after %s while a server lease is pending", async (change) => {
      const { options, setPage } = fixture();
      let finish!: (acquired: boolean) => void;
      options.acquire.mockImplementation(() => new Promise<boolean>((resolve) => { finish = resolve; }));
      const applying = applyStudioLayerCompTransaction(options);
      const before = options.getPage()!;
      if (change === "page-switch") setPage({ ...before, id: "p2" });
      if (change === "layer-change") setPage({ ...before, elements: before.elements.map((element) => ({ ...element, opacity: 0.2 })) });
      if (change === "lock-change") setPage({ ...before, groups: [{ id: "folder", name: "선화", locked: true }] });
      if (change === "read-only") options.canMutate.mockReturnValue(false);
      if (change === "unmount") setPage(null);
      finish(true);
      expect(await applying).toBe(false);
      expect(options.commit).not.toHaveBeenCalled();
      expect(options.release).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["page:p1", "element:p1:ink", "layer:p1:folder"].flatMap((resource) =>
    [false, true].map((folder) => ({ resource, folder }))))("respects peer $resource for folder=$folder", async ({ resource, folder }) => {
    const { options, setPage } = fixture();
    if (folder) {
      setPage({ ...options.getPage()!, groups: [{ id: "folder", name: "선화", hidden: false }] });
      options.comp = { ...comp, groupStates: { folder: { groupId: "folder", visible: false } } };
      setPage({ ...options.getPage()!, layerComps: [options.comp] });
    }
    const room = {
      mode: "server", participant: { sessionId: "self" },
      getLocks: () => [{ resource, claimId: "peer-lock", owner: { sessionId: "peer", displayName: "동료" }, leaseUntil: Date.now() + 60_000 }],
    } as unknown as StudioLiveRoom;
    const controller = createStudioLiveResourceLeaseController({
      pageId: "p1", roomRef: { current: room }, heldResourcesRef: { current: [] },
      mutationGenerationRef: { current: 0 }, pendingMutationRef: { current: null }, reportError: options.reportError,
    });
    options.acquire.mockImplementation((ids) => controller.beginAsync(ids));
    expect(await applyStudioLayerCompTransaction(options)).toBe(false);
    expect(options.acquire).toHaveBeenCalledWith(null);
    expect(options.commit).not.toHaveBeenCalled();
    expect(options.release).not.toHaveBeenCalled();
    expect(options.reportError).toHaveBeenCalled();
  });

  it("does not acquire or commit when locked or already matching, and releases on a commit failure", async () => {
    const { options, setPage } = fixture();
    const before = options.getPage()!;
    setPage({ ...before, elements: before.elements.map((element) => ({ ...element, locked: true })) });
    expect(await applyStudioLayerCompTransaction(options)).toBe(false);
    expect(options.acquire).not.toHaveBeenCalled();
    setPage({ ...before, elements: before.elements.map((element) => ({ ...element, opacity: 0.7 })) });
    expect(await applyStudioLayerCompTransaction(options)).toBe(true);
    expect(options.acquire).not.toHaveBeenCalled();
    setPage(before);
    options.commit.mockImplementation(() => { throw new Error("publish failed"); });
    expect(await applyStudioLayerCompTransaction(options)).toBe(false);
    expect(options.release).toHaveBeenCalledTimes(1);
  });
});


describe("layer comp peer metadata races", () => {
  function fixture() {
    let current: PageState = {
      ...page, layerComps: [comp],
      elements: [{ id: "ink", type: "image", x: 0, y: 0, width: 10, height: 10, rotation: 0, src: "", opacity: 1 }],
    };
    let resolveLease!: (allowed: boolean) => void;
    const options = {
      prepare: vi.fn(() => true), getPage: () => current, canMutate: vi.fn(() => true),
      acquire: vi.fn(() => new Promise<boolean>((resolve) => { resolveLease = resolve; })),
      synchronize: vi.fn<() => Promise<void>>(async () => undefined), release: vi.fn(), commit: vi.fn(() => true), reportError: vi.fn(), validatePage: studioPageToCrdtPage,
    };
    return { options, setPage: (next: PageState) => { current = next; },
      finish: (allowed: boolean) => resolveLease(allowed) };
  }

  it.each(["capture", "update"] as const)("acquires page ownership before %s and preserves a comp received while waiting", async (operation) => {
    const { options, setPage, finish } = fixture();
    const pending = captureStudioLayerCompTransaction({ ...options, name: "내 캡처", compId: operation === "update" ? comp.id : undefined });
    expect(options.acquire).toHaveBeenCalledExactlyOnceWith(null);
    expect(options.commit).not.toHaveBeenCalled();
    const remote = { ...comp, id: "peer-comp", name: "동료의 캡처" };
    setPage({ ...options.getPage(), layerComps: [comp, remote] });
    finish(true);
    expect(await pending).toBe(true);
    expect(options.commit).toHaveBeenCalledWith(options.getPage().elements, {
      layerComps: operation === "capture"
        ? [comp, remote, expect.objectContaining({ name: "내 캡처" })]
        : [expect.objectContaining({ id: comp.id, layerStates: { ink: expect.objectContaining({ opacity: 1 }) } }), remote],
    }, page.id);
    expect(options.release).toHaveBeenCalledTimes(1);
  });

  it.each(["rename", "delete"] as const)("rejects a stale %s snapshot instead of replacing a peer's newly accepted comp", async (operation) => {
    const { options, setPage, finish } = fixture();
    const pending = changeStudioLayerCompsTransaction({ ...options,
      nextComps: operation === "rename" ? [{ ...comp, name: "내 이름" }] : [],
    });
    expect(options.acquire).toHaveBeenCalledExactlyOnceWith(null);
    expect(options.commit).not.toHaveBeenCalled();
    const remote = { ...comp, id: "peer-comp", name: "동료의 캡처" };
    setPage({ ...options.getPage(), layerComps: [comp, remote] });
    finish(true);
    expect(await pending).toBe(false);
    expect(options.commit).not.toHaveBeenCalled();
    expect(options.getPage().layerComps).toEqual([comp, remote]);
    expect(options.release).toHaveBeenCalledTimes(1);
  });

  it.each(["update", "delete"] as const)("does not apply an obsolete appearance after a peer %s changes the selected comp during lease acquisition", async (operation) => {
    const { options, setPage, finish } = fixture();
    const before = options.getPage();
    const pending = applyStudioLayerCompTransaction({ ...options, comp });
    expect(options.acquire).toHaveBeenCalledExactlyOnceWith(null);
    setPage({ ...before, layerComps: operation === "delete" ? [] : [{
      ...comp, layerStates: { ...comp.layerStates, ink: { ...comp.layerStates.ink, opacity: 0.2 } },
    }] });
    expect(options.getPage().elements).toBe(before.elements);
    expect(options.getPage().groups).toBe(before.groups);
    finish(true);
    expect(await pending).toBe(false);
    expect(options.commit).not.toHaveBeenCalled();
    expect(options.release).toHaveBeenCalledTimes(1);
  });

  it("rejects an already stale rendered list even when no further peer change happens while acquiring", async () => {
    const { options, setPage, finish } = fixture();
    const rendered = options.getPage().layerComps!;
    const peerComp = { ...comp, id: "peer-comp", name: "동료의 캡처" };
    setPage({ ...options.getPage(), layerComps: [comp, peerComp] });
    const pending = changeStudioLayerCompsTransaction({ ...options, expectedComps: rendered, nextComps: [] });
    finish(true);
    expect(await pending).toBe(false);
    expect(options.commit).not.toHaveBeenCalled();
    expect(options.getPage().layerComps).toEqual([comp, peerComp]);
    expect(options.release).toHaveBeenCalledOnce();
  });

  it.each(["capture", "update", "rename", "delete"] as const)("preserves accepted state when a %s page lease is denied", async (operation) => {
    const { options, finish } = fixture();
    const before = options.getPage();
    const pending = operation === "capture" || operation === "update"
      ? captureStudioLayerCompTransaction({ ...options, name: "내 캡처", compId: operation === "update" ? comp.id : undefined })
      : changeStudioLayerCompsTransaction({ ...options, nextComps: operation === "rename" ? [{ ...comp, name: "내 이름" }] : [] });
    finish(false);
    expect(await pending).toBe(false);
    expect(options.getPage()).toBe(before);
    expect(options.commit).not.toHaveBeenCalled();
    expect(options.release).not.toHaveBeenCalled();
  });

  it.each(["capture", "rename"] as const)("reports a failed %s lease without committing or releasing unowned resources", async (operation) => {
    const { options } = fixture();
    options.acquire.mockRejectedValue(new Error("lease unavailable"));
    const result = operation === "capture"
      ? await captureStudioLayerCompTransaction({ ...options, name: "내 캡처" })
      : await changeStudioLayerCompsTransaction({ ...options, nextComps: [{ ...comp, name: "내 이름" }] });
    expect(result).toBe(false);
    expect(options.commit).not.toHaveBeenCalled();
    expect(options.release).not.toHaveBeenCalled();
    expect(options.reportError).toHaveBeenCalledOnce();
  });

  it.each(["page:p1", "element:p1:ink", "layer:p1:folder"].flatMap((resource) =>
    ["capture", "update", "rename", "delete"].map((operation) => ({ resource, operation }))))(
    "respects peer $resource before accepting a $operation metadata replacement", async ({ resource, operation }) => {
      const { options } = fixture();
      const peerRoom = {
        mode: "server", participant: { sessionId: "self" },
        getLocks: () => [{ resource, claimId: "peer-lock", owner: { sessionId: "peer", displayName: "동료" }, leaseUntil: Date.now() + 60_000 }],
      } as unknown as StudioLiveRoom;
      const controller = createStudioLiveResourceLeaseController({
        pageId: "p1", roomRef: { current: peerRoom }, heldResourcesRef: { current: [] },
        mutationGenerationRef: { current: 0 }, pendingMutationRef: { current: null }, reportError: options.reportError,
      });
      options.acquire.mockImplementation(() => controller.beginAsync(null));
      const result = operation === "capture" || operation === "update"
        ? await captureStudioLayerCompTransaction({ ...options, name: "내 캡처", compId: operation === "update" ? comp.id : undefined })
        : await changeStudioLayerCompsTransaction({ ...options, nextComps: operation === "rename" ? [{ ...comp, name: "내 이름" }] : [] });
      expect(result).toBe(false);
      expect(options.commit).not.toHaveBeenCalled();
      expect(options.release).not.toHaveBeenCalled();
      expect(options.reportError).toHaveBeenCalledOnce();
    },
  );

  it.each(["page-switch", "read-only", "deleted-target", "limit-reached", "commit-rejected"] as const)(
    "revalidates a prepared capture when $0 happens during its lease", async (change) => {
      const { options, setPage, finish } = fixture();
      const pending = captureStudioLayerCompTransaction({ ...options, name: "내 캡처", compId: change === "deleted-target" ? comp.id : undefined });
      if (change === "page-switch") setPage({ ...options.getPage(), id: "p2" });
      if (change === "read-only") options.canMutate.mockReturnValue(false);
      if (change === "deleted-target") setPage({ ...options.getPage(), layerComps: [] });
      if (change === "limit-reached") setPage({ ...options.getPage(), layerComps: Array.from({ length: 64 }, (_, index) => ({ ...comp, id: `peer-${index}`, layerStates: {} })) });
      if (change === "commit-rejected") options.commit.mockReturnValue(false);
      const authoritative = options.getPage();
      finish(true);
      expect(await pending).toBe(false);
      expect(options.getPage()).toBe(authoritative);
      expect(options.commit).toHaveBeenCalledTimes(change === "commit-rejected" ? 1 : 0);
      expect(options.release).toHaveBeenCalledOnce();
    },
  );

  it.each(["deleted", "changed"] as const)("rejects an already %s comp before acquiring ownership", async (change) => {
    const { options, setPage } = fixture();
    setPage({ ...options.getPage(), layerComps: change === "deleted" ? [] : [{ ...comp, name: "동료가 바꾼 이름" }] });
    expect(await applyStudioLayerCompTransaction({ ...options, comp })).toBe(false);
    expect(options.acquire).not.toHaveBeenCalled();
    expect(options.commit).not.toHaveBeenCalled();
  });

  it("allows an unchanged selected comp after another comp arrives and does not overwrite that metadata", async () => {
    const { options, setPage, finish } = fixture();
    const pending = applyStudioLayerCompTransaction({ ...options, comp });
    const peerComp = { ...comp, id: "peer-comp" };
    setPage({ ...options.getPage(), layerComps: [structuredClone(comp), peerComp] });
    finish(true);
    expect(await pending).toBe(true);
    expect(options.commit).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({ id: "ink", opacity: 0.7 }),
    ], {}, page.id);
    expect(options.getPage().layerComps).toEqual([comp, peerComp]);
    expect(options.release).toHaveBeenCalledOnce();
  });


  it.each(["capture", "apply"] as const)("keeps the lease until %s synchronization finishes and distinguishes acceptance from delivery failure", async (operation) => {
    const { options, finish } = fixture();
    options.synchronize.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("delivery interrupted"));
    const pending = operation === "capture"
      ? captureStudioLayerCompTransaction({ ...options, name: "로컬에 수락된 캡처" })
      : applyStudioLayerCompTransaction({ ...options, comp });
    finish(true);
    expect(await pending).toBe(true);
    expect(options.commit).toHaveBeenCalledOnce();
    expect(options.synchronize).toHaveBeenCalledTimes(2);
    expect(options.release).toHaveBeenCalledOnce();
    expect(options.reportError).toHaveBeenCalledWith(expect.stringContaining("이 기기에 반영됐지만"));
  });

  it.each(["capture", "apply"] as const)("rejects %s before changing history when the lease-time fresh sync fails", async (operation) => {
    const { options, finish } = fixture();
    options.synchronize.mockRejectedValueOnce(new Error("sync unavailable"));
    const pending = operation === "capture"
      ? captureStudioLayerCompTransaction({ ...options, name: "미수락 캡처" })
      : applyStudioLayerCompTransaction({ ...options, comp });
    finish(true);
    expect(await pending).toBe(false);
    expect(options.commit).not.toHaveBeenCalled();
    expect(options.synchronize).toHaveBeenCalledOnce();
    expect(options.release).toHaveBeenCalledOnce();
  });

  it("revalidates the selected comp after the fresh-sync wait as well as the acquisition wait", async () => {
    const { options, setPage, finish } = fixture();
    options.synchronize.mockImplementation(async () => {
      setPage({ ...options.getPage(), layerComps: [] });
    });
    const pending = applyStudioLayerCompTransaction({ ...options, comp });
    finish(true);
    expect(await pending).toBe(false);
    expect(options.commit).not.toHaveBeenCalled();
    expect(options.synchronize).toHaveBeenCalledOnce();
    expect(options.release).toHaveBeenCalledOnce();
  });

});
