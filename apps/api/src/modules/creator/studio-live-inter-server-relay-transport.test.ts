import { afterEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_LIVE_RELAY_RPC_TIMEOUT_MS,
  StudioLiveInterServerRelayTransport,
} from "./studio-live-inter-server-relay-transport";
import { STUDIO_LIVE_INTER_SERVER_RELAY_EVENT } from "./studio-live.protocol";

import type {
  StudioLiveInterServerRelayRequest,
  StudioLiveInterServerRelayResponse,
  StudioLiveNamespace,
} from "./studio-live.protocol";

type RelayListener = (
  request: StudioLiveInterServerRelayRequest,
  ack: (response: StudioLiveInterServerRelayResponse) => void
) => void;

function request(): StudioLiveInterServerRelayRequest {
  return {
    workId: "work-1",
    targetConnectionId: "target-1",
    deadlineAt: Date.now() + STUDIO_LIVE_RELAY_RPC_TIMEOUT_MS,
    sender: {
      connectionId: "sender-1",
      clientInstanceId: "client-sender-1",
      name: "어시스턴트",
      role: "editor",
      capabilities: {
        view: true,
        comment: true,
        edit: true,
        manageMembers: false,
      },
      state: "active",
      pageId: null,
      tool: null,
      sharingScreen: false,
      joinedAt: "2026-07-19T00:00:00.000Z",
      updatedAt: "2026-07-19T00:00:00.000Z",
    },
    relay: {
      type: "screen-request",
      shareId: "share-1",
    },
  };
}

function createNamespace(
  send: (request: StudioLiveInterServerRelayRequest) => Promise<unknown[]> =
    async () => []
) {
  const listeners = new Set<RelayListener>();
  const namespace = {
    on: vi.fn((event: string, listener: RelayListener) => {
      if (event === STUDIO_LIVE_INTER_SERVER_RELAY_EVENT) listeners.add(listener);
      return namespace;
    }),
    off: vi.fn((event: string, listener: RelayListener) => {
      if (event === STUDIO_LIVE_INTER_SERVER_RELAY_EVENT) listeners.delete(listener);
      return namespace;
    }),
    serverSideEmitWithAck: vi.fn(
      async (event: string, value: StudioLiveInterServerRelayRequest) =>
        event === STUDIO_LIVE_INTER_SERVER_RELAY_EVENT ? send(value) : []
    ),
  };
  return {
    namespace: namespace as unknown as StudioLiveNamespace,
    listeners,
    on: namespace.on,
    off: namespace.off,
    serverSideEmitWithAck: namespace.serverSideEmitWithAck,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("StudioLiveInterServerRelayTransport", () => {
  it("rebinds one listener and converts receiver outcomes into one ACK", async () => {
    const transport = new StudioLiveInterServerRelayTransport();
    const first = createNamespace();
    const second = createNamespace();
    const receive = vi.fn(async () => true);
    transport.bind(first.namespace, receive);
    const firstListener = [...first.listeners][0];
    if (!firstListener) throw new Error("missing first listener");
    const successAck = vi.fn();

    firstListener(request(), successAck);
    await vi.waitFor(() => expect(successAck).toHaveBeenCalledWith({ delivered: true }));
    expect(successAck).toHaveBeenCalledOnce();

    transport.bind(second.namespace, async () => {
      throw new Error("receiver failed");
    });
    expect(first.off).toHaveBeenCalledWith(
      STUDIO_LIVE_INTER_SERVER_RELAY_EVENT,
      firstListener
    );
    expect(first.listeners.size).toBe(0);
    const secondListener = [...second.listeners][0];
    if (!secondListener) throw new Error("missing second listener");
    const failureAck = vi.fn();
    secondListener(request(), failureAck);
    await vi.waitFor(() => expect(failureAck).toHaveBeenCalledWith({ delivered: false }));
    expect(failureAck).toHaveBeenCalledOnce();

    transport.onModuleDestroy();
    expect(second.off).toHaveBeenCalledWith(
      STUDIO_LIVE_INTER_SERVER_RELAY_EVENT,
      secondListener
    );
    expect(second.listeners.size).toBe(0);
    await expect(transport.send(request())).resolves.toBe(false);
  });

  it("accepts only one valid delivered response without retrying", async () => {
    const responses: unknown[][] = [
      [{ delivered: true }, { delivered: false }],
      [{ delivered: true }, { delivered: true }],
      [{ delivered: false }],
      [{ delivered: "yes" }],
    ];
    const namespace = createNamespace(async () => responses.shift() ?? []);
    const transport = new StudioLiveInterServerRelayTransport();
    transport.bind(namespace.namespace, async () => false);
    const value = request();

    await expect(transport.send(value)).resolves.toBe(true);
    await expect(transport.send(value)).resolves.toBe(false);
    await expect(transport.send(value)).resolves.toBe(false);
    await expect(transport.send(value)).resolves.toBe(false);

    expect(namespace.serverSideEmitWithAck).toHaveBeenCalledTimes(4);
    for (const call of namespace.serverSideEmitWithAck.mock.calls) {
      expect(call).toEqual([STUDIO_LIVE_INTER_SERVER_RELAY_EVENT, value]);
    }
    transport.onModuleDestroy();
  });

  it("fails closed without a namespace or when the adapter rejects", async () => {
    const transport = new StudioLiveInterServerRelayTransport();
    await expect(transport.send(request())).resolves.toBe(false);

    const namespace = createNamespace(async () => {
      throw new Error("adapter unavailable");
    });
    transport.bind(namespace.namespace, async () => false);
    await expect(transport.send(request())).resolves.toBe(false);
    expect(namespace.serverSideEmitWithAck).toHaveBeenCalledOnce();
    transport.onModuleDestroy();
  });

  it("bounds a stalled adapter call at two seconds and clears its sole timer", async () => {
    vi.useFakeTimers();
    const namespace = createNamespace(async () => new Promise<never>(() => undefined));
    const transport = new StudioLiveInterServerRelayTransport();
    transport.bind(namespace.namespace, async () => false);
    const pending = transport.send(request());

    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(STUDIO_LIVE_RELAY_RPC_TIMEOUT_MS - 1);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBe(false);
    expect(namespace.serverSideEmitWithAck).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    transport.onModuleDestroy();
  });

  it("clears the timeout after an early adapter response", async () => {
    vi.useFakeTimers();
    const namespace = createNamespace(async () => [{ delivered: true }]);
    const transport = new StudioLiveInterServerRelayTransport();
    transport.bind(namespace.namespace, async () => false);

    await expect(transport.send(request())).resolves.toBe(true);

    expect(vi.getTimerCount()).toBe(0);
    transport.onModuleDestroy();
  });
});
