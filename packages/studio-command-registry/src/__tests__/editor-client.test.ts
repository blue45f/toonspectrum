import { describe, expect, it, vi } from "vitest";

import {
  alwaysAvailable,
  CommandRegistry,
  createEditorClient,
  createEditorSnapshotStore,
  EDITOR_REQUEST_SERVICE_KEY,
} from "../index";

import type {
  CommandContext,
  CommandReceipt,
  CommandResult,
  EditorCommandRequest,
  EditorSnapshotStore,
  StudioCommand,
} from "../index";

interface TestState {
  brush: string;
}

function studioCommand(
  id: string,
  execute: (context: CommandContext) => Promise<CommandResult>,
  overrides: Partial<StudioCommand> = {},
): StudioCommand {
  return {
    id,
    labels: [{ locale: "ko", label: id }],
    aliases: [],
    availability: alwaysAvailable,
    execute,
    helpNodeId: `help/${id}`,
    ...overrides,
  };
}

function harness(
  build: (store: EditorSnapshotStore<TestState>) => readonly StudioCommand[],
) {
  const store = createEditorSnapshotStore<TestState>({ brush: "pencil" });
  const registry = new CommandRegistry();
  for (const command of build(store)) registry.register(command);
  const receipts: CommandReceipt[] = [];
  const client = createEditorClient({
    registry,
    store,
    context: (): CommandContext => ({ workspace: "comic", services: new Map() }),
    onReceipt: (receipt) => receipts.push(receipt),
  });
  return { registry, store, client, receipts };
}

describe("createEditorSnapshotStore", () => {
  it("notifies only when the snapshot reference actually changes", () => {
    const store = createEditorSnapshotStore<TestState>({ brush: "pencil" });
    const listener = vi.fn();
    store.subscribe(listener);

    store.set(store.getSnapshot());
    expect(listener).not.toHaveBeenCalled();

    store.set({ brush: "ink" });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toEqual({ brush: "ink" });

    store.update((previous) => previous);
    expect(listener).toHaveBeenCalledTimes(1);

    store.update((previous) => ({ ...previous, brush: "wash" }));
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot()).toEqual({ brush: "wash" });
  });

  it("stops notifying after unsubscribe", () => {
    const store = createEditorSnapshotStore<TestState>({ brush: "pencil" });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.set({ brush: "ink" });
    unsubscribe();
    store.set({ brush: "wash" });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("createEditorClient", () => {
  it("applies a command and carries the request id and source into the receipt", async () => {
    let seen: EditorCommandRequest | null = null;
    const { client, receipts } = harness((store) => [
      studioCommand("brush.choose", async (context) => {
        const request = context.services.get(
          EDITOR_REQUEST_SERVICE_KEY,
        ) as EditorCommandRequest;
        seen = request;
        store.set({ brush: String(request.payload) });
        return {
          status: "ok",
          payload: {
            dirtyRegions: [{ x: 0, y: 0, width: 8, height: 8 }],
            durableState: "opfs",
          },
        };
      }),
    ]);

    const receipt = await client.dispatch({
      id: "brush.choose",
      payload: "ink",
      source: "rail",
    });

    expect(receipt.status).toBe("applied");
    expect(receipt.commandId).toBe("brush.choose");
    expect(receipt.requestId).toMatch(/^req-1-/u);
    expect(receipt.acceptedRevision).toBe(1);
    expect(receipt.dirtyRegions).toEqual([{ x: 0, y: 0, width: 8, height: 8 }]);
    expect(receipt.durableState).toBe("opfs");
    expect(seen).toEqual({ id: "brush.choose", payload: "ink", source: "rail" });
    expect(client.getSnapshot()).toEqual({ brush: "ink" });
    expect(receipts).toEqual([receipt]);
  });

  it("treats a noop as applied without moving the revision", async () => {
    const { client } = harness(() => [
      studioCommand("brush.choose", async () => ({ status: "ok" })),
      studioCommand("brush.reselect", async () => ({
        status: "noop",
        message: "이미 선택된 브러시",
      })),
    ]);

    await client.dispatch({ id: "brush.choose", source: "menu" });
    const receipt = await client.dispatch({ id: "brush.reselect", source: "menu" });

    expect(receipt.status).toBe("applied");
    expect(receipt.message).toBe("이미 선택된 브러시");
    expect(receipt.acceptedRevision).toBe(1);
  });

  it("reports unavailable for disabled and unknown commands without executing", async () => {
    const execute = vi.fn(async () => ({ status: "ok" }) as CommandResult);
    const { client, receipts } = harness(() => [
      studioCommand("layer.merge", execute, {
        availability: () => ({ state: "disabled", reason: "선택된 레이어 없음" }),
      }),
    ]);

    const disabled = await client.dispatch({ id: "layer.merge", source: "menu" });
    expect(disabled.status).toBe("unavailable");
    expect(disabled.message).toBe("선택된 레이어 없음");
    expect(execute).not.toHaveBeenCalled();

    const unknown = await client.dispatch({ id: "layer.nope", source: "palette" });
    expect(unknown.status).toBe("unavailable");
    expect(unknown.message).toBe("unknown command: layer.nope");

    expect(receipts.map((entry) => entry.status)).toEqual([
      "unavailable",
      "unavailable",
    ]);
    expect(client.availability("layer.merge").state).toBe("disabled");
    expect(client.availability("layer.nope").state).toBe("hidden");
    expect(client.ids()).toEqual(["layer.merge"]);
  });

  it("turns a thrown error and an error result into a failed receipt", async () => {
    const { client, receipts } = harness(() => [
      studioCommand("export.png", async () => {
        throw new Error("인코더 실패");
      }),
      studioCommand("export.psd", async () => ({
        status: "error",
        message: "레이어 한도 초과",
      })),
    ]);

    const thrown = await client.dispatch({ id: "export.png", source: "menu" });
    expect(thrown.status).toBe("failed");
    expect(thrown.message).toBe("인코더 실패");

    const errored = await client.dispatch({ id: "export.psd", source: "menu" });
    expect(errored.status).toBe("failed");
    expect(errored.message).toBe("레이어 한도 초과");

    expect(receipts).toHaveLength(2);
  });

  it("maps a cancelled result to aborted", async () => {
    const { client } = harness(() => [
      studioCommand("file.open", async () => ({ status: "cancelled" })),
    ]);
    const receipt = await client.dispatch({ id: "file.open", source: "menu" });
    expect(receipt.status).toBe("aborted");
  });

  it("returns aborted without executing when the signal is already aborted", async () => {
    const execute = vi.fn(async () => ({ status: "ok" }) as CommandResult);
    const { client, receipts } = harness(() => [
      studioCommand("view.zoom-in", execute),
    ]);

    // 구조적 `DispatchAbortSignal` — 실제 DOM `AbortSignal` 도 그대로 할당된다.
    const receipt = await client.dispatch(
      { id: "view.zoom-in", source: "shortcut" },
      { signal: { aborted: true }, reason: "탭 전환" },
    );

    expect(receipt.status).toBe("aborted");
    expect(receipt.message).toBe("탭 전환");
    expect(execute).not.toHaveBeenCalled();
    expect(receipts).toHaveLength(1);
  });

  it("coalesces concurrent dispatches that share a key", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const execute = vi.fn(async () => {
      await gate;
      return { status: "ok" } as CommandResult;
    });
    const { client, receipts } = harness(() => [studioCommand("doc.save", execute)]);

    const first = client.dispatch(
      { id: "doc.save", source: "shortcut" },
      { coalesceKey: "doc.save" },
    );
    const second = client.dispatch(
      { id: "doc.save", source: "menu" },
      { coalesceKey: "doc.save" },
    );
    expect(second).toBe(first);

    release();
    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(b);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(receipts).toHaveLength(1);

    // 비행이 끝나면 같은 키로 다시 발사할 수 있다.
    const third = await client.dispatch(
      { id: "doc.save", source: "menu" },
      { coalesceKey: "doc.save" },
    );
    expect(third.requestId).not.toBe(a.requestId);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("subscribes UI listeners through the client and honours unsubscribe", () => {
    const { client, store } = harness(() => []);
    const listener = vi.fn();
    const unsubscribe = client.subscribe(listener);
    store.set({ brush: "ink" });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.set({ brush: "wash" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("uses an injected revision source and request id when given", async () => {
    const registry = new CommandRegistry();
    registry.register(studioCommand("doc.touch", async () => ({ status: "ok" })));
    const store = createEditorSnapshotStore<TestState>({ brush: "pencil" });
    let revision = 41;
    const client = createEditorClient({
      registry,
      store,
      context: (): CommandContext => ({ workspace: "comic", services: new Map() }),
      revision: () => (revision += 1),
      requestId: () => "fixed-id",
    });

    const receipt = await client.dispatch({ id: "doc.touch", source: "ai" });
    expect(receipt.requestId).toBe("fixed-id");
    expect(receipt.acceptedRevision).toBe(42);
  });
});
