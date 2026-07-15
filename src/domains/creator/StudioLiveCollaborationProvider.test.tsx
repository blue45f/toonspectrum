import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioLiveCollaborationProvider } from "./StudioLiveCollaborationProvider";

import type { StudioLiveCollaborationContextValue } from "./studio-live-collaboration-context";
import type { StudioLiveParticipant } from "./studio-live-collaboration-protocol";
import type { StudioLiveRoomEvent } from "./studio-live-collaboration-room";
import type { StudioLiveTransportFactory } from "./studio-live-collaboration-transport";
import type { ReactNode } from "react";

type EffectCleanup = (() => void) | undefined;

type HookSlot =
  | { kind: "state"; value: unknown }
  | { kind: "ref"; value: { current: unknown } }
  | {
      kind: "effect";
      dependencies: readonly unknown[] | undefined;
      cleanup: EffectCleanup;
    };

interface PendingEffect {
  index: number;
  effect: () => void | (() => void);
}

interface RoomRecord {
  options: {
    workId: string;
    participant: StudioLiveParticipant;
    dependencies?: { transportFactory?: StudioLiveTransportFactory };
  };
  ready: boolean;
  closeCount: number;
  startCount: number;
  unsubscribeCount: number;
  clearCursorCount: number;
  presenceUpdates: Array<Record<string, unknown>>;
  emit: (event: StudioLiveRoomEvent) => void;
}

/**
 * The repository intentionally runs Vitest in Node without jsdom. This tiny deterministic hook
 * driver exercises this provider's effect lifecycle directly; it is not a general React renderer.
 */
const hooks = vi.hoisted(() => {
  const slots: HookSlot[] = [];
  let cursor = 0;
  let dirty = false;
  let pending: PendingEffect[] = [];

  function equalDependencies(
    previous: readonly unknown[] | undefined,
    next: readonly unknown[] | undefined
  ): boolean {
    if (previous === undefined || next === undefined || previous.length !== next.length) {
      return false;
    }
    return previous.every((value, index) => Object.is(value, next[index]));
  }

  function useState<T>(initialValue: T | (() => T)) {
    const index = cursor++;
    const existing = slots[index];
    const slot = existing ?? {
      kind: "state" as const,
      value: typeof initialValue === "function"
        ? (initialValue as () => T)()
        : initialValue,
    };
    if (slot.kind !== "state") throw new Error(`Hook ${index} changed kind.`);
    slots[index] = slot;

    const setValue = (nextValue: T | ((previousValue: T) => T)) => {
      const previousValue = slot.value as T;
      const resolvedValue = typeof nextValue === "function"
        ? (nextValue as (previousValue: T) => T)(previousValue)
        : nextValue;
      if (Object.is(previousValue, resolvedValue)) return;
      slot.value = resolvedValue;
      dirty = true;
    };
    return [slot.value as T, setValue] as const;
  }

  function useRef<T>(initialValue: T) {
    const index = cursor++;
    const existing = slots[index];
    const slot = existing ?? { kind: "ref" as const, value: { current: initialValue } };
    if (slot.kind !== "ref") throw new Error(`Hook ${index} changed kind.`);
    slots[index] = slot;
    return slot.value as { current: T };
  }

  function useEffect(
    effect: () => void | (() => void),
    dependencies?: readonly unknown[]
  ): void {
    const index = cursor++;
    const existing = slots[index];
    if (existing && existing.kind !== "effect") {
      throw new Error(`Hook ${index} changed kind.`);
    }
    if (existing && equalDependencies(existing.dependencies, dependencies)) return;
    slots[index] = {
      kind: "effect",
      dependencies,
      cleanup: existing?.cleanup,
    };
    pending.push({ index, effect });
  }

  function flushEffects(): void {
    const effects = pending;
    pending = [];
    for (const { index, effect } of effects) {
      const slot = slots[index];
      if (!slot || slot.kind !== "effect") throw new Error(`Missing effect hook ${index}.`);
      slot.cleanup?.();
      const cleanup = effect();
      slot.cleanup = typeof cleanup === "function" ? cleanup : undefined;
    }
  }

  function render(renderComponent: () => ReactNode): ReactNode {
    for (let pass = 1; pass <= 20; pass += 1) {
      dirty = false;
      cursor = 0;
      const output = renderComponent();
      flushEffects();
      if (!dirty && pending.length === 0) return output;
    }
    throw new Error("Provider did not reach a stable hook state.");
  }

  function unmount(): void {
    for (let index = slots.length - 1; index >= 0; index -= 1) {
      const slot = slots[index];
      if (slot?.kind === "effect") slot.cleanup?.();
    }
    slots.length = 0;
    pending = [];
    cursor = 0;
    dirty = false;
  }

  function reset(): void {
    unmount();
  }

  return { render, reset, unmount, useEffect, useRef, useState };
});

const rooms = vi.hoisted(() => ({ instances: [] as RoomRecord[] }));
const lifecycle = vi.hoisted(() => ({
  roomStart: "pending" as "pending" | "resolve" | "reject",
  bindingStart: "resolve" as "pending" | "resolve" | "reject",
  bindingStartResolvers: [] as Array<() => void>,
  bindingStatusOnStart: null as null | {
    state: "ready" | "error";
    message: string;
    durabilityAtRisk?: boolean;
  },
  documents: [] as Array<{ destroyCount: number }>,
  bindings: [] as Array<{
    closeCount: number;
    closeGracefullyCount: number;
    document: { destroyCount: number };
    onStatus?: (status: {
      state: "ready" | "error";
      message: string;
      durabilityAtRisk?: boolean;
    }) => void;
  }>,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: hooks.useEffect,
    useRef: hooks.useRef,
    useState: hooks.useState,
  };
});

vi.mock("./studio-live-collaboration-room", () => {
  class StudioLiveRoom {
    readonly mode = "server";
    readonly record: RoomRecord;

    get ready(): boolean {
      return this.record.ready;
    }

    constructor(options: RoomRecord["options"]) {
      this.record = {
        options,
        ready: false,
        closeCount: 0,
        startCount: 0,
        unsubscribeCount: 0,
        clearCursorCount: 0,
        presenceUpdates: [],
        emit: () => undefined,
      };
      rooms.instances.push(this.record);
    }

    subscribe(listener: (event: StudioLiveRoomEvent) => void): () => void {
      this.record.emit = listener;
      return () => {
        this.record.unsubscribeCount += 1;
        this.record.emit = () => undefined;
      };
    }

    start(): Promise<void> {
      this.record.startCount += 1;
      if (lifecycle.roomStart === "reject") {
        return Promise.reject(new Error("room start failed"));
      }
      if (lifecycle.roomStart === "resolve") {
        this.record.ready = true;
        return Promise.resolve();
      }
      return new Promise(() => undefined);
    }

    getPeers(): [] {
      return [];
    }

    getLocks(): [] {
      return [];
    }

    updatePresence(patch: Record<string, unknown>): void {
      this.record.presenceUpdates.push(patch);
    }

    clearCursor(): boolean {
      this.record.clearCursorCount += 1;
      return true;
    }

    close(): void {
      this.record.closeCount += 1;
    }
  }

  return { StudioLiveRoom };
});

vi.mock("./studio-crdt-document", () => ({
  StudioCrdtDocument: class StudioCrdtDocument {
    readonly record = { destroyCount: 0 };

    constructor() {
      lifecycle.documents.push(this.record);
    }

    destroy(): void {
      this.record.destroyCount += 1;
    }
  },
}));

vi.mock("./studio-crdt-room-binding", () => ({
  StudioCrdtRoomBinding: class StudioCrdtRoomBinding {
    readonly record: (typeof lifecycle.bindings)[number];

    constructor(options: {
      document: { record: { destroyCount: number } };
      onStatus?: (status: {
        state: "ready" | "error";
        message: string;
        durabilityAtRisk?: boolean;
      }) => void;
    }) {
      this.record = {
        closeCount: 0,
        closeGracefullyCount: 0,
        document: options.document.record,
        onStatus: options.onStatus,
      };
      lifecycle.bindings.push(this.record);
    }

    start(): Promise<void> {
      if (lifecycle.bindingStatusOnStart) this.record.onStatus?.(lifecycle.bindingStatusOnStart);
      if (lifecycle.bindingStart === "reject") {
        return Promise.reject(new Error("binding start failed"));
      }
      if (lifecycle.bindingStart === "resolve") return Promise.resolve();
      return new Promise<void>((resolve) => {
        lifecycle.bindingStartResolvers.push(resolve);
      });
    }

    close(): void {
      this.record.closeCount += 1;
    }

    async closeGracefully(): Promise<void> {
      this.record.closeGracefullyCount += 1;
    }
  },
}));

vi.mock("./studio-crdt-scene-publisher", () => ({
  publishStudioCrdtSceneGraphDiff: () => ({
    sceneElementMutations: 0,
    pageMutations: 0,
    elementMoves: 0,
    pageMoves: 0,
  }),
}));

vi.mock("./studio-crdt-history", () => ({
  reconcileStudioCrdtSceneGraphHistory: () => ({ history: [], changed: false }),
}));

vi.mock("./studio-crdt-page-bridge", () => ({
  reconcileStudioCrdtSceneGraphPages: () => ({ pages: [], changed: false }),
}));

const participant: Omit<StudioLiveParticipant, "sessionId"> = {
  displayName: "민지",
  role: "editor",
};

const transportFactory: StudioLiveTransportFactory = () => {
  throw new Error("The mocked room must not open a real transport.");
};

interface RenderProviderOptions {
  children?: ReactNode;
  workId?: string | null;
  participant?: Omit<StudioLiveParticipant, "sessionId"> | null;
  currentPageId?: string | null;
  currentTool?: string | null;
  transportFactory?: StudioLiveTransportFactory | null;
  serverRequired?: boolean;
  onRoomChange?: (room: unknown) => void;
  onCrdtDocumentChange?: (document: unknown, runtime: unknown | null) => void;
}

function renderProvider(options: RenderProviderOptions = {}): StudioLiveCollaborationContextValue {
  const output = hooks.render(() => StudioLiveCollaborationProvider({
    children: options.children ?? null,
    workId: options.workId === undefined ? "work-a" : options.workId,
    participant: options.participant === undefined ? participant : options.participant,
    currentPageId: options.currentPageId === undefined ? "page-a" : options.currentPageId,
    currentTool: options.currentTool === undefined ? "pen" : options.currentTool,
    transportFactory:
      options.transportFactory === null
        ? undefined
        : (options.transportFactory ?? transportFactory),
    serverRequired: options.serverRequired,
    onRoomChange: options.onRoomChange,
    onCrdtDocumentChange: options.onCrdtDocumentChange,
  }));
  return (output as { props: { value: StudioLiveCollaborationContextValue } }).props.value;
}

describe("StudioLiveCollaborationProvider lifecycle", () => {
  beforeEach(() => {
    rooms.instances.length = 0;
    lifecycle.roomStart = "pending";
    lifecycle.bindingStart = "resolve";
    lifecycle.bindingStartResolvers.length = 0;
    lifecycle.bindingStatusOnStart = null;
    lifecycle.documents.length = 0;
    lifecycle.bindings.length = 0;
  });

  afterEach(() => {
    hooks.reset();
  });

  it("keeps the room alive when presentation children such as the team panel change", () => {
    const onRoomChange = vi.fn();
    renderProvider({ children: "team-panel-open", onRoomChange });
    const room = rooms.instances[0];

    renderProvider({ children: "team-panel-closed", onRoomChange });

    expect(rooms.instances).toHaveLength(1);
    expect(room.closeCount).toBe(0);
    expect(room.startCount).toBe(1);
    expect(onRoomChange).toHaveBeenCalledTimes(1);
  });

  it("closes the previous room when the work or authorized participant changes", () => {
    const onRoomChange = vi.fn();
    renderProvider({ onRoomChange });
    const first = rooms.instances[0];

    renderProvider({ workId: "work-b", onRoomChange });
    const second = rooms.instances[1];
    expect(first.closeCount).toBe(1);
    expect(first.unsubscribeCount).toBe(1);
    expect(second.options.workId).toBe("work-b");

    renderProvider({ workId: "work-b", participant: null, onRoomChange });
    expect(second.closeCount).toBe(1);
    expect(rooms.instances).toHaveLength(2);

    renderProvider({
      workId: "work-b",
      participant: { displayName: "서윤", role: "commenter" },
      onRoomChange,
    });
    const third = rooms.instances[2];
    expect(third.options.participant).toMatchObject({
      displayName: "서윤 · 이 탭",
      role: "commenter",
    });

    renderProvider({
      workId: "work-b",
      participant: { displayName: "민호", role: "owner" },
      onRoomChange,
    });
    expect(third.closeCount).toBe(1);
    expect(third.unsubscribeCount).toBe(1);
    expect(rooms.instances[3].options.participant).toMatchObject({
      displayName: "민호 · 이 탭",
      role: "owner",
    });
  });

  it("updates page and tool presence without recreating the room", () => {
    const onRoomChange = vi.fn();
    renderProvider({ onRoomChange });
    const room = rooms.instances[0];

    expect(room.presenceUpdates).toEqual([{ pageId: "page-a", tool: "pen" }]);

    renderProvider({ currentPageId: "page-b", currentTool: "eraser", onRoomChange });

    expect(rooms.instances).toHaveLength(1);
    expect(room.closeCount).toBe(0);
    expect(room.presenceUpdates).toEqual([
      { pageId: "page-a", tool: "pen" },
      { pageId: "page-b", tool: "eraser" },
    ]);
    expect(room.clearCursorCount).toBe(1);
  });

  it("fails closed when an authenticated work loses its server transport", () => {
    const live = renderProvider({ transportFactory: null, serverRequired: true });

    expect(rooms.instances).toHaveLength(0);
    expect(live.availability).toBe("error");
    expect(live.mode).toBe("server");
    expect(live.usingLocalFallback).toBe(false);
    expect(live.error).toContain("자동 전환하지 않았습니다");
  });

  it("does not allow a terminal authorization failure to switch into local mode", () => {
    const options = { serverRequired: true };
    renderProvider(options);
    const room = rooms.instances[0];
    room.emit({
      type: "transport-status",
      status: {
        state: "revoked",
        recoverable: false,
        message: "작품 접근 권한이 회수되었습니다.",
      },
    });

    const revoked = renderProvider(options);
    expect(revoked.localFallbackAllowed).toBe(false);
    revoked.useLocalFallback();
    const afterAttempt = renderProvider(options);

    expect(rooms.instances).toHaveLength(1);
    expect(afterAttempt.usingLocalFallback).toBe(false);
    expect(room.closeCount).toBe(0);
  });

  it("unsubscribes, closes, and clears the exposed room on unmount", () => {
    const onRoomChange = vi.fn();
    renderProvider({ onRoomChange });
    const room = rooms.instances[0];

    hooks.unmount();

    expect(room.unsubscribeCount).toBe(1);
    expect(room.closeCount).toBe(1);
    expect(onRoomChange).toHaveBeenLastCalledWith(null);
  });

  it("exposes the CRDT document only after binding sync and destroys it on unmount", async () => {
    lifecycle.roomStart = "resolve";
    const onRoomChange = vi.fn();
    const onCrdtDocumentChange = vi.fn();
    renderProvider({ onRoomChange, onCrdtDocumentChange });

    await vi.waitFor(() => {
      expect(lifecycle.bindings).toHaveLength(1);
      expect(onCrdtDocumentChange).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          publish: expect.any(Function),
          reconcileHistory: expect.any(Function),
          reconcilePages: expect.any(Function),
        })
      );
    });
    const room = rooms.instances[0];
    const binding = lifecycle.bindings[0];
    const document = lifecycle.documents[0];

    hooks.unmount();
    await vi.waitFor(() => {
      expect(binding?.closeGracefullyCount).toBe(1);
      expect(document?.destroyCount).toBe(1);
      expect(room?.closeCount).toBe(1);
    });

    expect(onCrdtDocumentChange).toHaveBeenLastCalledWith(null, null);
    expect(onRoomChange).toHaveBeenLastCalledWith(null);
  });

  it("keeps operation sync fail-closed while the lazy runtime and initial binding are pending", async () => {
    lifecycle.roomStart = "resolve";
    lifecycle.bindingStart = "pending";
    const onRoomChange = vi.fn();
    const onCrdtDocumentChange = vi.fn();
    const options = { onRoomChange, onCrdtDocumentChange };

    const connecting = renderProvider(options);

    expect(onRoomChange).toHaveBeenCalledWith(expect.anything());
    expect(onCrdtDocumentChange).toHaveBeenLastCalledWith(null, null);
    expect(connecting.availability).toBe("connecting");
    await vi.waitFor(() => {
      expect(lifecycle.bindings).toHaveLength(1);
      expect(lifecycle.bindingStartResolvers).toHaveLength(1);
    });
    expect(
      onCrdtDocumentChange.mock.calls.filter(([document]) => document !== null)
    ).toHaveLength(0);

    lifecycle.bindingStartResolvers[0]?.();

    await vi.waitFor(() => {
      expect(onCrdtDocumentChange).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          publish: expect.any(Function),
          reconcileHistory: expect.any(Function),
          reconcilePages: expect.any(Function),
        })
      );
    });
  });

  it("does not overwrite a degraded local durability warning with ready after initial sync", async () => {
    lifecycle.roomStart = "resolve";
    lifecycle.bindingStatusOnStart = {
      state: "error",
      message: "실시간 서버 동기화는 유지되지만 IndexedDB 복구 저장소가 저하되었습니다.",
      durabilityAtRisk: true,
    };
    const onCrdtDocumentChange = vi.fn();
    const options = { onCrdtDocumentChange };
    renderProvider(options);

    await vi.waitFor(() => {
      expect(onCrdtDocumentChange).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          publish: expect.any(Function),
          reconcileHistory: expect.any(Function),
          reconcilePages: expect.any(Function),
        })
      );
    });
    const live = renderProvider(options);

    expect(live.availability).toBe("error");
    expect(live.error).toContain("IndexedDB 복구 저장소가 저하");
  });

  it("fails closed and releases every resource when initial CRDT sync rejects", async () => {
    lifecycle.roomStart = "resolve";
    lifecycle.bindingStart = "reject";
    const onRoomChange = vi.fn();
    const onCrdtDocumentChange = vi.fn();
    const options = { onRoomChange, onCrdtDocumentChange };
    renderProvider(options);

    await vi.waitFor(() => {
      expect(lifecycle.bindings).toHaveLength(1);
      expect(lifecycle.bindings[0]?.closeCount).toBe(1);
      expect(lifecycle.documents[0]?.destroyCount).toBe(1);
      expect(rooms.instances[0]?.closeCount).toBe(1);
    });
    const failed = renderProvider(options);

    expect(failed.availability).toBe("error");
    expect(failed.error).toContain("binding start failed");
    expect(onCrdtDocumentChange).toHaveBeenLastCalledWith(null, null);
    expect(onRoomChange).toHaveBeenLastCalledWith(null);

    hooks.unmount();
    expect(rooms.instances[0]?.closeCount).toBe(1);
    expect(lifecycle.documents[0]?.destroyCount).toBe(1);
  });
});
