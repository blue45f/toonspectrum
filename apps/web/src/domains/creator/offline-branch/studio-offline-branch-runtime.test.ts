import { beforeAll, describe, expect, it, vi } from "vitest";

import { StudioCrdtDocument } from "../live/studio-crdt-document";
import { reconcileStudioCrdtSceneGraphPages } from "../live/studio-crdt-page-bridge";
import { publishStudioCrdtSceneGraphDiff } from "../live/studio-crdt-scene-publisher";
import { createStudioCrdtTransitionPublisher } from "../studio-cuttoon-editor/runtime/createStudioCrdtTransitionPublisher";
import { createStudioDeferredStrokeCommitEngine, type StudioDeferredStrokeCommitEngineContext } from "../studio-cuttoon-editor/studio-deferred-stroke-commit";
import {
  StudioOfflineBranchAutomergeEngine,
  initializeStudioOfflineBranchAutomerge,
} from "./studio-offline-branch-automerge";
import { StudioOfflineBranchRuntime } from "./studio-offline-branch-runtime";

import type { DrawEl } from "../studio-element-model";
import type { StudioCrdtSceneGraphRuntime } from "../live/StudioLiveCollaborationProvider";
import type { PageState } from "../studio-page-state";
import type {
  CreateStudioOfflineBranchInput,
  StudioOfflineBranchImportResult,
} from "./studio-offline-branch-automerge";
import type {
  StudioOfflineBranchConflict,
  StudioOfflineBranchOperation,
  StudioOfflineBranchReceipt,
  StudioOfflineBranchSnapshot,
} from "./studio-offline-branch-contract";
import type { StudioOfflineBranchStorage } from "./studio-offline-branch-storage";
import type { StudioOfflineBranchWorkerPort } from "./studio-offline-branch-worker-client";

beforeAll(async () => {
  await initializeStudioOfflineBranchAutomerge();
});

function page(groupName = "선화", elements: DrawEl[] = []): PageState {
  return {
    id: "page-1",
    elements,
    bg: "#ffffff",
    bgGrad: null,
    canvasH: 1_200,
    groups: [{ id: "group-1", name: groupName, hidden: false, locked: false }],
  };
}

function stroke(id: string, y: number): DrawEl {
  return {
    id,
    type: "draw",
    kind: "freehand",
    mode: "pen",
    points: [10, y, 40, y + 2],
    stroke: "#111111",
    strokeWidth: 4,
    opacity: 1,
  };
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return `sha256:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")).join("")}`;
}

class MemoryStorage implements StudioOfflineBranchStorage {
  readonly status = {
    durability: "durable" as const,
    message: "test storage",
  };
  private readonly documents = new Map<string, Uint8Array>();
  private readonly payloads = new Map<string, Uint8Array>();

  private key(scope: string, workId: string): string {
    return `${scope}:${workId}`;
  }

  async loadDocument(scope: string, workId: string): Promise<Uint8Array | null> {
    const value = this.documents.get(this.key(scope, workId));
    return value ? Uint8Array.from(value) : null;
  }

  async saveDocument(
    scope: string,
    workId: string,
    bytes: Uint8Array,
  ): Promise<void> {
    this.documents.set(this.key(scope, workId), Uint8Array.from(bytes));
  }

  async putPayload(bytes: Uint8Array): Promise<{ hash: `sha256:${string}`; bytes: number }> {
    const hash = await sha256(bytes) as `sha256:${string}`;
    this.payloads.set(hash, Uint8Array.from(bytes));
    return { hash, bytes: bytes.byteLength };
  }

  async getPayload(hash: string): Promise<Uint8Array | null> {
    const value = this.payloads.get(hash);
    return value ? Uint8Array.from(value) : null;
  }

  async setPayloadRefs(): Promise<void> {}

  async deleteDocument(scope: string, workId: string): Promise<void> {
    this.documents.delete(this.key(scope, workId));
  }
}

class InlineWorker implements StudioOfflineBranchWorkerPort {
  private engine: StudioOfflineBranchAutomergeEngine | null = null;

  async open(
    input: CreateStudioOfflineBranchInput,
    bytes: Uint8Array | null,
  ): Promise<StudioOfflineBranchSnapshot> {
    this.engine = bytes
      ? StudioOfflineBranchAutomergeEngine.load(bytes, input)
      : StudioOfflineBranchAutomergeEngine.create(input);
    return this.engine.snapshot();
  }

  async append(
    operations: readonly StudioOfflineBranchOperation[],
    updatedAt: number,
  ): Promise<{ count: number; snapshot: StudioOfflineBranchSnapshot }> {
    const count = this.requireEngine().append(operations, updatedAt);
    return { count, snapshot: this.requireEngine().snapshot() };
  }

  async recordReceipts(
    receipts: readonly StudioOfflineBranchReceipt[],
    updatedAt: number,
  ): Promise<StudioOfflineBranchSnapshot> {
    this.requireEngine().recordReceipts(receipts, updatedAt);
    return this.requireEngine().snapshot();
  }

  async recordConflicts(
    conflicts: readonly StudioOfflineBranchConflict[],
    updatedAt: number,
  ): Promise<StudioOfflineBranchSnapshot> {
    this.requireEngine().recordConflicts(conflicts, updatedAt);
    return this.requireEngine().snapshot();
  }

  async snapshot(): Promise<StudioOfflineBranchSnapshot> {
    return this.requireEngine().snapshot();
  }

  async save(): Promise<Uint8Array> {
    return this.requireEngine().save();
  }

  async importPeerDocument(
    bytes: Uint8Array,
    updatedAt: number,
  ): Promise<StudioOfflineBranchImportResult & { snapshot: StudioOfflineBranchSnapshot }> {
    const imported = this.requireEngine().importDocument(bytes, updatedAt);
    return { ...imported, snapshot: this.requireEngine().snapshot() };
  }

  async close(): Promise<void> {
    this.engine?.close();
    this.engine = null;
  }

  private requireEngine(): StudioOfflineBranchAutomergeEngine {
    if (!this.engine) throw new Error("worker is not open");
    return this.engine;
  }
}

function runtimeOptions(storage: MemoryStorage, actorId = "user-1") {
  let time = 1_000;
  let id = 0;
  return {
    workId: "work-1",
    scope: "user-1",
    actorId,
    canonicalAuthority: false,
    storage,
    worker: new InlineWorker(),
    now: () => ++time,
    randomId: () => `id-${++id}`,
  };
}

function offlineCommitEditor(
  offlineBranch: StudioOfflineBranchRuntime,
  initialPage: PageState,
) {
  const document = new StudioCrdtDocument();
  publishStudioCrdtSceneGraphDiff(document, [], [initialPage]);
  // 렌더링과 래스터 포트는 이 페이지 커밋에 참여하지 않는다. 문서·발행·병합은 실제 구현을 쓴다.
  const runtime = {
    offlineBranch,
    publish: vi.fn(publishStudioCrdtSceneGraphDiff),
    reconcilePages: reconcileStudioCrdtSceneGraphPages,
  } as unknown as StudioCrdtSceneGraphRuntime;
  const reportError = vi.fn();
  const publisher = createStudioCrdtTransitionPublisher({
    actorId: "user-1",
    automaticRasterPublicationEnabled: false,
    getDocument: () => document,
    getRuntime: () => runtime,
    reportError,
    reportNotice: vi.fn(),
  });
  const state = {
    activePage: initialPage, pages: [initialPage], elements: initialPage.elements,
    editorMountedRef: { current: true }, documentSaveInFlightRef: { current: false },
    collaborationAccessRef: { current: { locked: false } },
    collaborationLockMessage: () => "locked", bg3dDccSourceRef: { current: null },
    masterEditMode: false, pageEditLocked: false, advancedFillApplyingRef: { current: false },
    invalidateAdvancedFillWork: vi.fn(() => true), coalesceKeyRef: { current: null },
    currentPageIdRef: { current: initialPage.id }, pagesHiRef: { current: 0 },
    pagesHistoryRef: { current: [[initialPage]] },
    studioCrdtDocumentRef: { current: document }, studioCrdtSceneRuntimeRef: { current: runtime },
    publishStudioCrdtSceneTransition: publisher.publishSceneTransition,
    onHistoryBranch: vi.fn(), recordStudioHistoryTransition: vi.fn(),
    recordStudioHistoryJournalPages: vi.fn(), noteStudioHistoryRetention: vi.fn(),
    setPagesHistory: vi.fn(), setPagesHi: vi.fn(), setError: reportError,
    setSharedDocumentNotice: vi.fn(), drawingRef: { current: null },
    drawingPointerTransportRef: { current: { getSession: () => null } },
    pendingStrokeCommitsRef: { current: null }, flushPendingStrokeCommitsRef: { current: () => true },
  };
  const engine = createStudioDeferredStrokeCommitEngine(
    state as unknown as StudioDeferredStrokeCommitEngineContext,
  );
  const currentPages = () => state.pagesHistoryRef.current[state.pagesHiRef.current];
  return { document, runtime, publisher, engine, state, currentPages, reportError };
}

describe("StudioOfflineBranchRuntime", () => {
  it("정본 병합 뒤에도 기기에 수락한 도형 교정을 히스토리에 보존하고 원격 획을 지우지 않는다", async () => {
    const original = { ...stroke("local-shape", 10), points: [10, 10, 20, 11, 30, 9, 40, 10] };
    const initial = page("선화", [original]);
    const remote = stroke("remote-stroke", 50);
    const document = new StudioCrdtDocument();
    const offlineBranch = await StudioOfflineBranchRuntime.create(runtimeOptions(new MemoryStorage()));
    publishStudioCrdtSceneGraphDiff(document, [], [initial]);
    offlineBranch.observeCanonicalPages([initial]);
    // 마지막 로컬 히스토리 이후 도착한 원격 획도 정본 병합에 포함되어야 한다.
    publishStudioCrdtSceneGraphDiff(document, [initial], [{ ...initial, elements: [original, remote] }]);
    const canonicalBefore = document.encodeStateAsUpdate();
    const canonicalRemote = reconcileStudioCrdtSceneGraphPages([initial], document.getStrokes({ includeDeleted: true }),
      document.getSceneElements({ includeDeleted: true }), document.getPages(true),
      document.getLayerGroups({ includeDeleted: true })).pages[0]!.elements.find(({ id }) => id === remote.id);
    expect(canonicalRemote).toMatchObject(remote);
    const runtime = { offlineBranch, reconcilePages: reconcileStudioCrdtSceneGraphPages } as unknown as StudioCrdtSceneGraphRuntime;
    const reportError = vi.fn();
    const publisher = createStudioCrdtTransitionPublisher({
      actorId: "user-1", automaticRasterPublicationEnabled: false,
      getDocument: () => document, getRuntime: () => runtime,
      reportError, reportNotice: vi.fn(),
    });
    const pagesHistoryRef = { current: [[initial]] };
    const pagesHiRef = { current: 0 };
    const context = {
      activePage: initial, pages: [initial], elements: initial.elements,
      editorMountedRef: { current: true }, documentSaveInFlightRef: { current: false },
      collaborationAccessRef: { current: { locked: false } }, collaborationLockMessage: () => "locked",
      bg3dDccSourceRef: { current: null }, masterEditMode: false, pageEditLocked: false,
      advancedFillApplyingRef: { current: false }, invalidateAdvancedFillWork: () => true,
      coalesceKeyRef: { current: null }, currentPageIdRef: { current: initial.id }, pagesHiRef, pagesHistoryRef,
      studioCrdtDocumentRef: { current: document }, studioCrdtSceneRuntimeRef: { current: runtime },
      publishStudioCrdtSceneTransition: publisher.publishSceneTransition,
      onHistoryBranch: vi.fn(), recordStudioHistoryTransition: vi.fn(), recordStudioHistoryJournalPages: vi.fn(),
      noteStudioHistoryRetention: vi.fn(), setPagesHistory: vi.fn(), setPagesHi: vi.fn(),
      setError: reportError, setSharedDocumentNotice: vi.fn(),
      drawingRef: { current: null }, drawingPointerTransportRef: { current: { getSession: () => null } },
      pendingStrokeCommitsRef: { current: null }, flushPendingStrokeCommitsRef: { current: () => true },
    } as unknown as StudioDeferredStrokeCommitEngineContext;
    const corrected: DrawEl = { ...original, points: [10, 10, 40, 10],
      smartShape: { version: 1, kind: "line", original } };
    try {
      expect(createStudioDeferredStrokeCommitEngine(context).commit([corrected])).toBe(true);
      const saved = pagesHistoryRef.current[pagesHiRef.current]![0]!;
      expect(saved.elements.find(({ id }) => id === corrected.id)).toEqual(corrected);
      expect(saved.elements.find(({ id }) => id === remote.id)).toEqual(canonicalRemote);
      expect(offlineBranch.status.pendingOperations).toBeGreaterThan(0);
      expect(document.encodeStateAsUpdate()).toEqual(canonicalBefore);
      expect(reportError).not.toHaveBeenCalled();
    } finally {
      await offlineBranch.close();
      document.destroy();
    }
  });
  it("네이버와 카카오 규격 변경을 각각 거절하고 오프라인 페이지와 대기 작업을 보존한다", async () => {
    const errors: string[] = [];
    const runtime = await StudioOfflineBranchRuntime.create({
      ...runtimeOptions(new MemoryStorage()), onError: (message) => errors.push(message),
    });
    const original = [page()];
    const editorErrors: string[] = [];
    const publisher = createStudioCrdtTransitionPublisher({
      actorId: "user-1", automaticRasterPublicationEnabled: false,
      getDocument: () => null,
      getRuntime: () => ({ offlineBranch: runtime }) as StudioCrdtSceneGraphRuntime,
      reportError: (message) => editorErrors.push(message), reportNotice: () => undefined,
    });
    try {
      runtime.observeCanonicalPages(original);
      for (const canvasH of [8348, 8000]) {
        expect(publisher.publishSceneTransition(original, [{ ...original[0], canvasH }])).toBe(false);
        expect(runtime.projectPages(original)).toEqual(original);
        expect(runtime.canonicalPagesSnapshot()).toEqual(original);
        expect(runtime.status.pendingOperations).toBe(0);
      }
      expect(errors).toEqual([
        "page-1: 페이지 배경·크기 변경은 온라인 정본 연결이 필요합니다.",
        "page-1: 페이지 배경·크기 변경은 온라인 정본 연결이 필요합니다.",
      ]);
      expect(editorErrors).toEqual(errors);
    } finally {
      await runtime.close();
    }
  });
  it.each(["elements", "pages"] as const)(
    "오프라인 %s 커밋에서 연속 그룹 편집과 실행 취소 제안을 보존한다",
    async (kind) => {
      const branchError = vi.fn();
      const offlineBranch = await StudioOfflineBranchRuntime.create({
        ...runtimeOptions(new MemoryStorage()), onError: branchError,
      });
      const initialPage = { ...page(), canvasH: 1080 };
      const editor = offlineCommitEditor(offlineBranch, initialPage);
      try {
        // 로컬 렌더 이후 도착한 원격 획도 같은 커밋에서 보존해야 한다.
        const remoteStroke = stroke("remote-ink", 20);
        publishStudioCrdtSceneGraphDiff(editor.document, [initialPage], [
          { ...initialPage, elements: [remoteStroke] },
        ]);
        const canonicalBefore = editor.document.encodeStateAsUpdate();
        const rename = (name: string) => {
          const groups = [{ id: "group-1", name, hidden: false, locked: false }];
          return kind === "elements"
            ? editor.engine.commit(editor.currentPages()[0].elements, { groups })
            : editor.engine.commitPages(editor.currentPages().map((entry) => ({ ...entry, groups })));
        };

        expect(rename("채색")).toBe(true);
        expect(editor.currentPages()[0].groups?.[0].name).toBe("채색");
        expect(editor.currentPages()[0].elements.map(({ id }) => id)).toEqual(["remote-ink"]);
        expect(rename("보정")).toBe(true);
        expect(editor.currentPages()[0].groups?.[0].name).toBe("보정");
        expect(editor.state.pagesHistoryRef.current.map((pages) => pages[0].groups?.[0].name))
          .toEqual(["선화", "채색", "보정"]);
        expect(editor.runtime.publish).not.toHaveBeenCalled();
        expect(editor.document.encodeStateAsUpdate()).toEqual(canonicalBefore);

        const undoTarget = editor.state.pagesHistoryRef.current[1];
        expect(editor.publisher.publishHistoryTransition(editor.currentPages(), undoTarget)).toBe(true);
        await offlineBranch.exportPeerDocument();
        const canonicalPages = editor.runtime.reconcilePages(
          [initialPage], editor.document.getStrokes({ includeDeleted: true }),
          editor.document.getSceneElements({ includeDeleted: true }), editor.document.getPages(true),
          editor.document.getLayerGroups({ includeDeleted: true }),
        ).pages;
        const undonePages = offlineBranch.projectPages(canonicalPages);
        expect(undonePages[0].groups?.[0].name).toBe("채색");
        expect(undonePages[0].elements.map(({ id }) => id)).toEqual(["remote-ink"]);
        expect(editor.document.encodeStateAsUpdate()).toEqual(canonicalBefore);
        expect(editor.reportError).not.toHaveBeenCalled();
        expect(branchError).not.toHaveBeenCalled();
      } finally {
        editor.document.destroy();
        await offlineBranch.close();
      }
    },
  );

  it("오프라인 연속 요소 커밋을 canonical 값으로 되돌리지 않는다", async () => {
    const offlineBranch = await StudioOfflineBranchRuntime.create(runtimeOptions(new MemoryStorage()));
    const ink = stroke("ink", 20);
    const editor = offlineCommitEditor(offlineBranch, page("선화", [ink]));
    try {
      editor.engine.commitCoalesced([{ ...ink, opacity: 0.4 }], "opacity");
      editor.engine.commitCoalesced([{ ...ink, opacity: 0.6 }], "opacity");
      expect(editor.currentPages()[0].elements[0].opacity).toBe(0.6);
      expect(editor.state.pagesHistoryRef.current).toHaveLength(2);
      expect(editor.document.getStrokes()[0].payload.opacity).toBe(1);
      expect(editor.runtime.publish).not.toHaveBeenCalled();
      expect(editor.reportError).not.toHaveBeenCalled();
    } finally {
      editor.document.destroy();
      await offlineBranch.close();
    }
  });

  it("온라인 권한이 있으면 기존 canonical 발행 경로로 캔버스를 변경한다", async () => {
    const offlineBranch = await StudioOfflineBranchRuntime.create({
      ...runtimeOptions(new MemoryStorage()), canonicalAuthority: true,
    });
    const editor = offlineCommitEditor(offlineBranch, { ...page(), canvasH: 1080 });
    try {
      expect(editor.engine.commit([], { canvasH: 8348 })).toBe(true);
      expect(editor.currentPages()[0].canvasH).toBe(8348);
      expect(editor.document.getPages()[0].payload.props.canvasH).toBe(8348);
      expect(editor.engine.commit([], { canvasH: 8000 })).toBe(true);
      expect(editor.currentPages()[0].canvasH).toBe(8000);
      const undoTarget = editor.state.pagesHistoryRef.current[1];
      expect(editor.publisher.publishHistoryTransition(editor.currentPages(), undoTarget)).toBe(true);
      expect(editor.document.getPages()[0].payload.props.canvasH).toBe(8348);
      expect(editor.runtime.publish).toHaveBeenCalledTimes(3);
      expect(offlineBranch.status.pendingOperations).toBe(0);
      expect(editor.reportError).not.toHaveBeenCalled();
    } finally {
      editor.document.destroy();
      await offlineBranch.close();
    }
  });

  it("오프라인 획 보정 커밋은 canonical 원시 표본 대신 최종 경로와 도형 정보를 보존한다", async () => {
    const offlineBranch = await StudioOfflineBranchRuntime.create(runtimeOptions(new MemoryStorage()));
    const raw = { ...stroke("smart-line", 20), points: Array.from({ length: 18 }, (_, index) => [index * 10, 20]).flat() };
    const corrected: DrawEl = {
      ...raw, points: [0, 20, 170, 20],
      smartShape: { version: 1, kind: "line", original: raw },
    };
    const editor = offlineCommitEditor(offlineBranch, page("선화", [raw]));
    try {
      expect(editor.engine.commit([corrected])).toBe(true);
      expect(editor.currentPages()[0].elements[0]).toMatchObject(corrected);
      expect(editor.document.getStrokes()[0].payload.points).toEqual(raw.points);
      expect(editor.runtime.publish).not.toHaveBeenCalled();
      expect(editor.reportError).not.toHaveBeenCalled();
    } finally {
      editor.document.destroy();
      await offlineBranch.close();
    }
  });

  it("정본 권한이 없는 캔버스 크기 변경은 기존 경계에서 원자적으로 거절한다", async () => {
    const branchError = vi.fn();
    const offlineBranch = await StudioOfflineBranchRuntime.create({
      ...runtimeOptions(new MemoryStorage()), onError: branchError,
    });
    const initialPage = { ...page(), canvasH: 1080 };
    const editor = offlineCommitEditor(offlineBranch, initialPage);
    try {
      const before = editor.document.encodeStateAsUpdate();
      expect(editor.engine.commit([], { canvasH: 8348 })).toBe(false);
      expect(editor.currentPages()).toEqual([initialPage]);
      expect(editor.state.pagesHistoryRef.current).toHaveLength(1);
      expect(editor.state.onHistoryBranch).not.toHaveBeenCalled();
      expect(editor.runtime.publish).not.toHaveBeenCalled();
      expect(editor.document.encodeStateAsUpdate()).toEqual(before);
      expect(offlineBranch.status.pendingOperations).toBe(0);
      expect(branchError).toHaveBeenCalledWith(expect.stringContaining("온라인 정본 연결"));
      expect(editor.reportError).toHaveBeenCalledWith(expect.stringContaining("온라인 정본 연결"));
    } finally {
      editor.document.destroy();
      await offlineBranch.close();
    }
  });

  it("reports a supported idempotent no-op without staging an operation", async () => {
    const runtime = await StudioOfflineBranchRuntime.create(runtimeOptions(new MemoryStorage()));
    const current = [page("line")];
    expect(runtime.stageSceneTransition(current, current)).toEqual({
      staged: false,
      operations: 0,
      unsupported: [],
    });
    await runtime.close();
  });
  it("mirrors only owned pending-stroke changes and induced order changes", async () => {
    const runtime = await StudioOfflineBranchRuntime.create(runtimeOptions(new MemoryStorage()));
    const before = [page("line", [
      stroke("remote-a", 10),
      stroke("local-pending", 20),
      stroke("remote-b", 30),
    ])];
    const after = [page("line", [stroke("remote-a", 10), stroke("remote-b", 30)])];
    expect(runtime.canMirrorPendingStrokeTransition(before, after, ["local-pending"])).toBe(true);
    const restored = [page("line", [
      stroke("remote-a", 10),
      stroke("local-pending", 20),
      stroke("remote-b", 30),
    ])];
    expect(runtime.canMirrorPendingStrokeTransition(after, restored, ["local-pending"])).toBe(true);
    const editedRemote = [page("line", [
      { ...stroke("remote-a", 10), strokeWidth: 12 },
      stroke("local-pending", 20),
      stroke("remote-b", 30),
    ])];
    expect(runtime.canMirrorPendingStrokeTransition(
      restored,
      editedRemote,
      ["local-pending"],
    )).toBe(false);
    await runtime.close();
  });

  it("projects immediately and reconstructs a clean canonical baseline after persistence", async () => {
    const storage = new MemoryStorage();
    const runtime = await StudioOfflineBranchRuntime.create(runtimeOptions(storage));
    const previous = [page("선화")];
    const next = [page("채색")];

    expect(runtime.stageSceneTransition(previous, next).staged).toBe(true);
    expect(runtime.projectPages(previous)[0]?.groups?.[0]?.name).toBe("채색");
    await runtime.exportPeerDocument();
    expect(runtime.status.pendingOperations).toBe(1);
    const projected = runtime.projectPages(previous);
    expect(runtime.reconstructCanonicalPages(projected)).toEqual(previous);
    await runtime.close();

    const reopened = await StudioOfflineBranchRuntime.create(runtimeOptions(storage));
    expect(reopened.projectPages(previous)[0]?.groups?.[0]?.name).toBe("채색");
    expect(reopened.reconstructCanonicalPages(next)).toEqual(previous);
    await reopened.close();
  });

  it("preserves a repeated semantic edit after an intervening revert", async () => {
    const storage = new MemoryStorage();
    const runtime = await StudioOfflineBranchRuntime.create(runtimeOptions(storage));
    const original = [page("선화")];
    const changed = [page("채색")];

    expect(runtime.stageSceneTransition(original, changed).staged).toBe(true);
    await runtime.exportPeerDocument();
    expect(runtime.stageSceneTransition(changed, original).staged).toBe(true);
    await runtime.exportPeerDocument();
    expect(runtime.stageSceneTransition(original, changed).staged).toBe(true);
    await runtime.exportPeerDocument();

    expect(runtime.snapshot.operations).toHaveLength(3);
    expect(new Set(runtime.snapshot.operations.map(({ dedupeKey }) => dedupeKey))).toHaveLength(3);
    expect(runtime.projectPages(original)[0]?.groups?.[0]?.name).toBe("채색");
    await runtime.close();
  });

  it("does not resurrect a fully undone stroke branch when a fresh stroke starts", async () => {
    const storage = new MemoryStorage();
    const runtime = await StudioOfflineBranchRuntime.create(runtimeOptions(storage));
    const canonical = [page()];
    let current = canonical;

    for (let index = 1; index <= 10; index += 1) {
      const next = [page("선화", [...current[0]!.elements as DrawEl[], stroke(`stroke-${index}`, index * 10)])];
      expect(runtime.stageSceneTransition(current, next).staged).toBe(true);
      await runtime.exportPeerDocument();
      current = next;
    }

    for (let index = 10; index >= 1; index -= 1) {
      const next = [page("선화", (current[0]!.elements as DrawEl[]).slice(0, -1))];
      expect(runtime.stageSceneTransition(current, next).staged).toBe(true);
      await runtime.exportPeerDocument();
      current = next;
    }

    expect(runtime.projectPages(canonical)[0]?.elements).toEqual([]);

    const fresh = [page("선화", [stroke("fresh", 200)])];
    expect(runtime.stageSceneTransition(current, fresh).staged).toBe(true);
    await runtime.exportPeerDocument();

    expect(runtime.projectPages(canonical)[0]?.elements.map(({ id }) => id)).toEqual(["fresh"]);
    await runtime.close();
  });

  it("promotes an admissible offline proposal into Yjs and records a server receipt", async () => {
    const storage = new MemoryStorage();
    const runtime = await StudioOfflineBranchRuntime.create(runtimeOptions(storage));
    const previous = [page("선화")];
    const next = [page("채색")];
    expect(runtime.stageSceneTransition(previous, next).staged).toBe(true);
    await runtime.exportPeerDocument();
    runtime.observeCanonicalPages(previous);
    runtime.setCanonicalAuthority(true);

    const document = new StudioCrdtDocument();
    document.addLayerGroup({
      id: "group-1",
      pageId: "page-1",
      payload: {
        version: 1,
        props: { name: "선화", hidden: false, locked: false },
      },
    });
    await runtime.promotePending(document, async () => ({
      protection: "server",
      serverSequence: "77",
      acknowledgedAt: 2_000,
      protectedUpdateIds: [],
    }));

    expect(document.getLayerGroup("page-1", "group-1")?.payload.props.name).toBe("채색");
    expect(runtime.status.pendingOperations).toBe(0);
    expect(runtime.snapshot.branch.state).toBe("merged");
    document.destroy();
    await runtime.close();
  });
});
