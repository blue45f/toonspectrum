import { beforeAll, describe, expect, it } from "vitest";

import { StudioCrdtDocument } from "../live/studio-crdt-document";
import {
  StudioOfflineBranchAutomergeEngine,
  initializeStudioOfflineBranchAutomerge,
} from "./studio-offline-branch-automerge";
import { StudioOfflineBranchRuntime } from "./studio-offline-branch-runtime";

import type { DrawEl } from "../studio-element-model";
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

describe("StudioOfflineBranchRuntime", () => {
  it("projects immediately and reconstructs a clean canonical baseline after persistence", async () => {
    const storage = new MemoryStorage();
    const runtime = await StudioOfflineBranchRuntime.create(runtimeOptions(storage));
    const previous = [page("선화")];
    const next = [page("채색")];

    expect(runtime.stageSceneTransition(previous, next)).toBe(true);
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

    expect(runtime.stageSceneTransition(original, changed)).toBe(true);
    await runtime.exportPeerDocument();
    expect(runtime.stageSceneTransition(changed, original)).toBe(true);
    await runtime.exportPeerDocument();
    expect(runtime.stageSceneTransition(original, changed)).toBe(true);
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
      expect(runtime.stageSceneTransition(current, next)).toBe(true);
      await runtime.exportPeerDocument();
      current = next;
    }

    for (let index = 10; index >= 1; index -= 1) {
      const next = [page("선화", (current[0]!.elements as DrawEl[]).slice(0, -1))];
      expect(runtime.stageSceneTransition(current, next)).toBe(true);
      await runtime.exportPeerDocument();
      current = next;
    }

    expect(runtime.projectPages(canonical)[0]?.elements).toEqual([]);

    const fresh = [page("선화", [stroke("fresh", 200)])];
    expect(runtime.stageSceneTransition(current, fresh)).toBe(true);
    await runtime.exportPeerDocument();

    expect(runtime.projectPages(canonical)[0]?.elements.map(({ id }) => id)).toEqual(["fresh"]);
    await runtime.close();
  });

  it("promotes an admissible offline proposal into Yjs and records a server receipt", async () => {
    const storage = new MemoryStorage();
    const runtime = await StudioOfflineBranchRuntime.create(runtimeOptions(storage));
    const previous = [page("선화")];
    const next = [page("채색")];
    expect(runtime.stageSceneTransition(previous, next)).toBe(true);
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
