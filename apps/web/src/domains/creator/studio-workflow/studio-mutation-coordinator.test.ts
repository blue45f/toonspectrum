import { describe, expect, it, vi } from "vitest";

import { createEmptyStudioVersionCoordinates } from "../studio-foundation/studio-version-coordinates";

import {
  StudioMutationConflictError,
  createStudioExistingReducerDomainPort,
  createStudioMutationCoordinator,
  validateStudioMutationEnvelope,
  type StudioDomainCommand,
  type StudioMutationDurabilityPort,
  type StudioMutationEnvelopeV2,
  type StudioMutationReceipt,
} from "./studio-mutation-coordinator";

const NOW = "2026-09-07T00:00:00.000Z";

function coordinates(sequence = 0) {
  const empty = createEmptyStudioVersionCoordinates();
  return {
    ...empty,
    local: { ...empty.local, sequence, documentDigest: "document-digest-1" },
  };
}

function command(
  commandId: string,
  domain: StudioDomainCommand["domain"],
  type: string,
): StudioDomainCommand {
  return {
    commandId,
    domain,
    type,
    payload: { amount: 1 },
    affectedSemanticIds: ["panel-1"],
  };
}

function envelope(
  commands: readonly StudioDomainCommand[],
): StudioMutationEnvelopeV2 {
  return {
    schemaVersion: 2,
    mutationId: "mutation-1",
    transactionId: "transaction-1",
    idempotencyKey: "idempotency-1",
    workScope: { kind: "work", workId: "work-1" },
    actor: {
      userId: "user-1",
      clientId: "client-1",
      sessionId: "session-1",
    },
    base: coordinates(),
    commands,
    affectedSemanticIds: ["scene-1"],
    createdAt: NOW,
  };
}

function durability(existing: StudioMutationReceipt | null = null) {
  const committedByKey = new Map<string, StudioMutationReceipt>();
  const syncEnvelopeByKey = new Map<string, StudioMutationEnvelopeV2 | null>();
  if (existing) committedByKey.set("idempotency-1", existing);
  const port: StudioMutationDurabilityPort & {
    readonly syncEnvelopeByKey: Map<string, StudioMutationEnvelopeV2 | null>;
  } = {
    syncEnvelopeByKey,
    findCommittedReceipt: vi.fn(async (key) => committedByKey.get(key) ?? null),
    begin: vi.fn(async () => undefined),
    appendPrepared: vi.fn(async () => undefined),
    commit: vi.fn(async (record, receipt, syncEnvelope) => {
      // The test double mirrors the production contract: receipt and outbox become visible together.
      committedByKey.set(record.idempotencyKey, receipt);
      syncEnvelopeByKey.set(record.idempotencyKey, syncEnvelope);
    }),
    abort: vi.fn(async () => undefined),
  };
  return port;
}

describe("Studio mutation coordinator", () => {
  it.each(["duplicate", "stale", "failed-first"] as const)(
    "serializes concurrent requests through durable completion: %s",
    async (scenario) => {
      let pageState = { count: 0 };
      let sequence = 0;
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const port = createStudioExistingReducerDomainPort({
        domain: "page-state",
        getSnapshot: () => pageState,
        reduce: (snapshot) => ({ state: { count: snapshot.count + 1 } }),
        replaceSnapshot: (snapshot) => { pageState = snapshot; },
      });
      const store = durability();
      const persist = store.commit;
      let commits = 0;
      const commit = vi.fn<StudioMutationDurabilityPort["commit"]>(async (...args) => {
        commits += 1;
        if (commits === 1) {
          entered.resolve();
          await release.promise;
          if (scenario === "failed-first") throw new Error("first write failed");
        }
        if (await store.findCommittedReceipt(args[0].idempotencyKey)) {
          throw new Error("duplicate durable receipt");
        }
        await persist(...args);
        sequence = args[1].localSequence;
      });
      const coordinator = createStudioMutationCoordinator({
        domains: [port],
        durability: { ...store, commit },
        getCurrentCoordinates: () => coordinates(sequence),
      });
      const first = envelope([command("command-page", "page-state", "page-state/add-frame")]);
      const second = scenario === "duplicate" ? first : {
        ...first,
        mutationId: "mutation-2",
        transactionId: "transaction-2",
        idempotencyKey: "idempotency-2",
      };
      const results = Promise.allSettled([
        coordinator.execute(first),
        coordinator.execute(second),
      ]);
      await entered.promise;
      release.resolve();
      const [a, b] = await results;

      expect(pageState.count).toBe(1);
      expect(sequence).toBe(1);
      if (scenario === "duplicate") {
        expect(a).toMatchObject({ status: "fulfilled", value: { status: "committed" } });
        expect(b).toMatchObject({ status: "fulfilled", value: { status: "idempotent-replay" } });
        expect(commit).toHaveBeenCalledOnce();
        expect(store.abort).not.toHaveBeenCalled();
      } else if (scenario === "stale") {
        expect(a.status).toBe("fulfilled");
        expect(b).toMatchObject({ status: "rejected", reason: expect.any(StudioMutationConflictError) });
        expect(commit).toHaveBeenCalledOnce();
      } else {
        expect(a).toMatchObject({ status: "rejected", reason: new Error("first write failed") });
        expect(b).toMatchObject({ status: "fulfilled", value: { status: "committed" } });
        expect(store.abort).toHaveBeenCalledOnce();
      }
    },
  );

  it("commits multiple domains as one local sequence and atomically records one server outbox", async () => {
    let pageState = { count: 0 };
    let identityState = { count: 0 };
    const pagePort = createStudioExistingReducerDomainPort({
      domain: "page-state",
      getSnapshot: () => pageState,
      reduce: (snapshot) => ({ state: { count: snapshot.count + 1 } }),
      replaceSnapshot: (snapshot) => { pageState = snapshot; },
    });
    const identityPort = createStudioExistingReducerDomainPort({
      domain: "identity-index",
      getSnapshot: () => identityState,
      reduce: (snapshot) => ({ state: { count: snapshot.count + 1 } }),
      replaceSnapshot: (snapshot) => { identityState = snapshot; },
    });
    const store = durability();
    const coordinator = createStudioMutationCoordinator({
      domains: [pagePort, identityPort],
      durability: store,
      getCurrentCoordinates: () => coordinates(),
      validateProjectedState: (projected) =>
        projected.size === 2 ? [] : ["두 도메인이 함께 준비되어야 합니다."],
    });
    const request = envelope([
      command("command-page", "page-state", "page-state/add-frame"),
      command("command-identity", "identity-index", "identity/link-panel"),
    ]);

    const receipt = await coordinator.execute(request);

    expect(receipt).toMatchObject({
      status: "committed",
      localSequence: 1,
      serverSyncState: "queued",
      committedDomains: ["page-state", "identity-index"],
    });
    expect(receipt.affectedSemanticIds).toEqual(["scene-1", "panel-1"]);
    expect(pageState.count).toBe(1);
    expect(identityState.count).toBe(1);
    expect(store.begin).toHaveBeenCalledTimes(1);
    expect(store.appendPrepared).toHaveBeenCalledTimes(1);
    expect(store.commit).toHaveBeenCalledTimes(1);
    expect(store.commit).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "idempotency-1" }),
      receipt,
      request,
    );
    expect(store.syncEnvelopeByKey.get("idempotency-1")).toBe(request);
  });

  it("returns an idempotent receipt without preparing or committing again", async () => {
    const existing: StudioMutationReceipt = {
      mutationId: "mutation-1",
      transactionId: "transaction-1",
      status: "committed",
      localSequence: 1,
      serverSyncState: "queued",
      affectedSemanticIds: ["panel-1"],
      committedDomains: ["page-state"],
    };
    const port = {
      domain: "page-state" as const,
      getSnapshot: vi.fn(() => ({ count: 0 })),
      prepare: vi.fn(),
      commit: vi.fn(),
      restore: vi.fn(),
    };
    const store = durability(existing);
    const coordinator = createStudioMutationCoordinator({
      domains: [port],
      durability: store,
      getCurrentCoordinates: () => coordinates(),
    });

    const receipt = await coordinator.execute(envelope([
      command("command-page", "page-state", "page-state/add-frame"),
    ]));

    expect(receipt.status).toBe("idempotent-replay");
    expect(port.prepare).not.toHaveBeenCalled();
    expect(store.begin).not.toHaveBeenCalled();
    expect(store.commit).not.toHaveBeenCalled();
  });

  it("rejects stale local bases before touching any domain", async () => {
    const port = {
      domain: "page-state" as const,
      getSnapshot: vi.fn(() => ({ count: 0 })),
      prepare: vi.fn(),
      commit: vi.fn(),
      restore: vi.fn(),
    };
    const store = durability();
    const coordinator = createStudioMutationCoordinator({
      domains: [port],
      durability: store,
      getCurrentCoordinates: () => coordinates(9),
    });

    await expect(coordinator.execute(envelope([
      command("command-page", "page-state", "page-state/add-frame"),
    ]))).rejects.toBeInstanceOf(StudioMutationConflictError);
    expect(port.prepare).not.toHaveBeenCalled();
    expect(store.begin).not.toHaveBeenCalled();
  });

  it("rejects duplicate command IDs and missing domain ports", () => {
    const commands = [
      command("command-1", "page-state", "page-state/add-frame"),
      command("command-1", "identity-index", "identity/link-panel"),
    ];
    const issues = validateStudioMutationEnvelope(
      envelope(commands),
      coordinates(),
      [],
    );

    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "duplicate-command-id",
      "missing-domain-port",
    ]));
  });

  it("does not commit when a cross-domain invariant fails", async () => {
    const state = { count: 0 };
    const replaceSnapshot = vi.fn();
    const port = createStudioExistingReducerDomainPort({
      domain: "page-state",
      getSnapshot: () => state,
      reduce: (snapshot) => ({ state: { count: snapshot.count + 1 } }),
      replaceSnapshot,
    });
    const store = durability();
    const coordinator = createStudioMutationCoordinator({
      domains: [port],
      durability: store,
      getCurrentCoordinates: () => coordinates(),
      validateProjectedState: () => ["Identity link is missing."],
    });

    await expect(coordinator.execute(envelope([
      command("command-page", "page-state", "page-state/add-frame"),
    ]))).rejects.toBeInstanceOf(StudioMutationConflictError);
    expect(replaceSnapshot).not.toHaveBeenCalled();
    expect(store.begin).not.toHaveBeenCalled();
  });

  it("rolls back earlier domain commits when a later commit fails", async () => {
    let pageState = { count: 0 };
    let identityState = { count: 0 };
    const pagePort = createStudioExistingReducerDomainPort({
      domain: "page-state",
      getSnapshot: () => pageState,
      reduce: (snapshot) => ({ state: { count: snapshot.count + 1 } }),
      replaceSnapshot: (snapshot) => { pageState = snapshot; },
    });
    const identityPort = createStudioExistingReducerDomainPort({
      domain: "identity-index",
      getSnapshot: () => identityState,
      reduce: (snapshot) => ({ state: { count: snapshot.count + 1 } }),
      replaceSnapshot: async (snapshot) => {
        if (snapshot.count === 1) throw new Error("identity commit failed");
        identityState = snapshot;
      },
    });
    const store = durability();
    const coordinator = createStudioMutationCoordinator({
      domains: [pagePort, identityPort],
      durability: store,
      getCurrentCoordinates: () => coordinates(),
    });

    await expect(coordinator.execute(envelope([
      command("command-page", "page-state", "page-state/add-frame"),
      command("command-identity", "identity-index", "identity/link-panel"),
    ]))).rejects.toThrow("identity commit failed");

    expect(pageState).toEqual({ count: 0 });
    expect(identityState).toEqual({ count: 0 });
    expect(store.abort).toHaveBeenCalledTimes(1);
    expect(store.commit).not.toHaveBeenCalled();
  });

  it("rolls back in-memory owners when the atomic durable commit fails", async () => {
    let pageState = { count: 0 };
    const port = createStudioExistingReducerDomainPort({
      domain: "page-state",
      getSnapshot: () => pageState,
      reduce: (snapshot) => ({ state: { count: snapshot.count + 1 } }),
      replaceSnapshot: (snapshot) => { pageState = snapshot; },
    });
    const store = durability();
    vi.mocked(store.commit).mockRejectedValueOnce(new Error("sqlite transaction failed"));
    const coordinator = createStudioMutationCoordinator({
      domains: [port],
      durability: store,
      getCurrentCoordinates: () => coordinates(),
    });

    await expect(coordinator.execute(envelope([
      command("command-page", "page-state", "page-state/add-frame"),
    ]))).rejects.toThrow("sqlite transaction failed");

    expect(pageState).toEqual({ count: 0 });
    expect(store.abort).toHaveBeenCalledTimes(1);
  });

  it("commits a null sync envelope for an unsaved draft", async () => {
    let pageState = { count: 0 };
    const port = createStudioExistingReducerDomainPort({
      domain: "page-state",
      getSnapshot: () => pageState,
      reduce: (snapshot) => ({ state: { count: snapshot.count + 1 } }),
      replaceSnapshot: (snapshot) => { pageState = snapshot; },
    });
    const store = durability();
    const draftEnvelope: StudioMutationEnvelopeV2 = {
      ...envelope([command("command-page", "page-state", "page-state/add-frame")]),
      workScope: { kind: "draft", draftId: "draft-1" },
    };
    const coordinator = createStudioMutationCoordinator({
      domains: [port],
      durability: store,
      getCurrentCoordinates: () => coordinates(),
    });

    const receipt = await coordinator.execute(draftEnvelope);
    expect(receipt.serverSyncState).toBe("none");
    expect(store.commit).toHaveBeenCalledWith(
      expect.any(Object),
      receipt,
      null,
    );
    expect(store.syncEnvelopeByKey.get("idempotency-1")).toBeNull();
  });
});
