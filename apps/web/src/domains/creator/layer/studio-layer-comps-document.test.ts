import { describe, expect, it, vi } from "vitest";

import { createStudioLiveResourceLeaseController } from "../live/createStudioLiveResourceLeaseController";
import type { StudioLiveRoom } from "../live/studio-live-collaboration-room";
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
    const options = { prepare, getPage: () => current, canMutate: vi.fn(() => true), commit, reportError: vi.fn() };
    return { options, pendingElement };
  }

  it.each([false, true])("captures a completed stroke from the post-flush page (update=%s)", (update) => {
    const { options, pendingElement } = fixture();
    expect(captureStudioLayerCompTransaction({ ...options, name: "즉시 캡처", ...(update ? { compId: comp.id } : {}) })).toBe(true);
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

  it.each(["rename", "delete"])("keeps a newly flushed stroke during a %s metadata commit", (operation) => {
    const { options, pendingElement } = fixture();
    const nextComps = operation === "rename" ? [{ ...comp, name: "새 이름" }] : [];
    expect(changeStudioLayerCompsTransaction({ ...options, nextComps })).toBe(true);
    expect(options.commit).toHaveBeenCalledWith([pendingElement], { layerComps: nextComps }, "p1");
  });

  it.each(["capture", "metadata"])("does not %s after a rejected retained-stroke flush", (operation) => {
    const { options } = fixture();
    options.prepare.mockReturnValue(false);
    const result = operation === "capture"
      ? captureStudioLayerCompTransaction({ ...options, name: "보류" })
      : changeStudioLayerCompsTransaction({ ...options, nextComps: [] });
    expect(result).toBe(false);
    expect(options.commit).not.toHaveBeenCalled();
  });

  it("rechecks the mutation gate after preparation and rejects invalid metadata", () => {
    const { options } = fixture();
    options.canMutate.mockReturnValueOnce(true).mockReturnValue(false);
    expect(captureStudioLayerCompTransaction({ ...options, name: "보류" })).toBe(false);
    expect(options.commit).not.toHaveBeenCalled();
    options.canMutate.mockReturnValue(true);
    expect(changeStudioLayerCompsTransaction({ ...options, nextComps: [comp, comp] })).toBe(false);
    expect(captureStudioLayerCompTransaction({ ...options, name: "x".repeat(161) })).toBe(false);
    expect(captureStudioLayerCompTransaction({ ...options, name: "삭제됨", compId: "removed" })).toBe(false);
    expect(options.commit).not.toHaveBeenCalled();
  });

  it("rejects capture at the document limit while allowing an existing comp to be updated", () => {
    const comps = Array.from({ length: STUDIO_LAYER_COMPS_MAX_COUNT }, (_, index) => ({
      ...comp, id: `comp-${index}`,
    }));
    const current: PageState = { ...page, layerComps: comps };
    const { options } = fixture();
    const context = { ...options, prepare: () => true, getPage: () => current };
    expect(captureStudioLayerCompTransaction({ ...context, name: "65번째 콤프" })).toBe(false);
    expect(options.commit).not.toHaveBeenCalled();
    expect(options.reportError).toHaveBeenCalledWith("페이지마다 콤프를 64개까지 저장할 수 있어요.");
    expect(current.layerComps).toBe(comps);
    expect(captureStudioLayerCompTransaction({ ...context, name: "갱신", compId: comps[0].id })).toBe(true);
    expect(options.commit).toHaveBeenCalledExactlyOnceWith([], {
      layerComps: [expect.objectContaining({ id: comps[0].id, layerStates: {}, groupStates: {} }), ...comps.slice(1)],
    }, "p1");
  });

  it.each(["empty", "legacy-layer"])("captures a %s page without guessing absent appearance metadata", (kind) => {
    const elements: PageState["elements"] = kind === "empty" ? [] : [{
      id: "legacy", type: "image", x: 0, y: 0, width: 20, height: 30, rotation: 0, src: "",
    }];
    const current: PageState = { ...page, elements };
    const { options } = fixture();
    expect(captureStudioLayerCompTransaction({
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
      ...page,
      elements: [{ id: "ink", type: "image", x: 0, y: 0, width: 10, height: 10, rotation: 0, src: "", opacity: 1 }],
    };
    const commit = vi.fn(() => true);
    const acquire = vi.fn(async (_ids: readonly string[] | null) => true);
    const release = vi.fn();
    const reportError = vi.fn();
    const canMutate = vi.fn(() => true);
    const options = { comp, getPage: () => current, canMutate, acquire, release, commit, reportError };
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
