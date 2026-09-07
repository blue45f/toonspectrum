// @vitest-environment jsdom

import { BroadcastChannel } from "node:worker_threads";

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioCrdtDocument } from "./studio-crdt-document";
import { StudioCrdtRoomBinding, type StudioCrdtBindingStatus } from "./studio-crdt-room-binding";
import { StudioLiveRoom } from "./studio-live-collaboration-room";
import { useStudioLiveTransportAuth } from "./use-studio-live-transport-auth";

import type { StudioLiveAuthTicketResponse } from "../../../shared/lib/studio-live-auth-ticket";

const socketModule = vi.hoisted(() => ({ imports: 0 }));
vi.mock("./studio-live-socket-transport", () => {
  socketModule.imports += 1;
  throw new Error("A local-only session must not fetch the Socket.IO implementation.");
});

function renderLocalFactory(userId: string | null = null) {
  const requestTicket = vi.fn().mockRejectedValue(new Error("Admission unavailable"));
  const createGuestCredential = vi.fn(() => "guest:v1:local-transport-test");
  const hook = renderHook(() => useStudioLiveTransportAuth(
    { authReady: true, userId },
    { requestTicket, createGuestCredential },
  ));
  return { hook, requestTicket, createGuestCredential };
}

function addStroke(document: StudioCrdtDocument, id: string) {
  document.addStroke({
    id,
    pageId: "page-local",
    layerId: "page-root",
    payload: {
      version: 1,
      type: "draw",
      kind: "freehand",
      mode: "pen",
      points: [10, 20, 30, 40],
      stroke: "#123456",
      strokeWidth: 6,
    },
  });
}

describe("local-only Studio transport admission", () => {
  beforeEach(() => {
    socketModule.imports = 0;
    vi.stubEnv("VITE_STUDIO_LIVE_ORIGIN", "");
    vi.stubEnv("VITE_STUDIO_REALTIME_ORIGIN", "");
    vi.stubEnv("VITE_STUDIO_LIVE_DEV_PROXY_ENABLED", "false");
    vi.stubGlobal("BroadcastChannel", BroadcastChannel);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("keeps one guest identity and factory without importing Socket.IO", async () => {
    const { hook, requestTicket, createGuestCredential } = renderLocalFactory();
    await waitFor(() => expect(hook.result.current).toBeTypeOf("function"));
    const factory = hook.result.current;
    hook.rerender();
    expect(hook.result.current).toBe(factory);
    expect(createGuestCredential).toHaveBeenCalledOnce();
    expect(requestTicket).not.toHaveBeenCalled();
    expect(socketModule.imports).toBe(0);
  });

  it("delivers and repairs real Yjs state through local rooms while preserving the server ACK fence", async () => {
    const { hook } = renderLocalFactory();
    await waitFor(() => expect(hook.result.current).toBeTypeOf("function"));
    const workId = `local-startup-${crypto.randomUUID()}`;
    const rooms = ["alice", "bob"].map((sessionId) => new StudioLiveRoom({
      workId,
      participant: { sessionId, displayName: sessionId, role: "editor" },
      dependencies: { transportFactory: hook.result.current },
    }));
    const documents = rooms.map(() => new StudioCrdtDocument());
    const statuses: StudioCrdtBindingStatus[] = [];
    const bindings = rooms.map((room, index) => new StudioCrdtRoomBinding({
      document: documents[index]!, room, onStatus: (status) => statuses.push(status),
    }));
    try {
      addStroke(documents[0]!, "before-peer-joined");
      await Promise.all(rooms.map((room) => room.start()));
      await Promise.all(bindings.map((binding) => binding.start()));
      await waitFor(() => expect(documents[1]!.getStroke("before-peer-joined")).not.toBeNull());
      addStroke(documents[1]!, "peer-stroke");
      await bindings[1]!.flushAndWaitForDelivery();
      await waitFor(() => expect(documents[0]!.getStroke("peer-stroke")).not.toBeNull());
      documents[0]!.deleteStroke("before-peer-joined");
      await bindings[0]!.flushAndWaitForDelivery();
      await waitFor(() => expect(documents[1]!.getStroke("before-peer-joined")).toBeNull());
      expect(rooms.every((room) => room.mode === "local")).toBe(true);
      expect(statuses.at(-1)?.pendingCount).toBe(0);
      expect(statuses.every((status) => status.lastAckServerSequence === null)).toBe(true);
      await expect(bindings[0]!.flushAndWaitForAuthoritativeAck()).rejects.toThrow();
      expect(documents[0]!.getStroke("peer-stroke")).not.toBeNull();
      bindings[1]!.close();
      rooms[1]!.close();
      await expect(rooms[1]!.start()).rejects.toThrow();
      expect(socketModule.imports).toBe(0);
    } finally {
      bindings.forEach((binding) => binding.close());
      rooms.forEach((room) => room.close());
      documents.forEach((document) => document.destroy());
    }
  });

  it("surfaces a blocked BroadcastChannel instead of falling back to a server", async () => {
    const { hook } = renderLocalFactory();
    await waitFor(() => expect(hook.result.current).toBeTypeOf("function"));
    vi.stubGlobal("BroadcastChannel", class {
      constructor() { throw new DOMException("Partition blocked", "SecurityError"); }
    });
    const room = new StudioLiveRoom({
      workId: "local-blocked",
      participant: { sessionId: "alice", displayName: "Alice", role: "editor" },
      dependencies: { transportFactory: hook.result.current },
    });
    try {
      await expect(room.start()).rejects.toThrow("로컬 탭 공동작업 채널");
      expect(room.ready).toBe(false);
      expect(socketModule.imports).toBe(0);
    } finally {
      room.close();
    }
  });

  it("does not turn failed authenticated admission into a guest local factory", async () => {
    const { hook, requestTicket, createGuestCredential } = renderLocalFactory("signed-in-user");
    await waitFor(() => expect(requestTicket).toHaveBeenCalledOnce());
    expect(hook.result.current).toBeUndefined();
    expect(createGuestCredential).not.toHaveBeenCalled();
    expect(socketModule.imports).toBe(0);
  });
  it("retains ticket admission before exposing an authenticated local transport", async () => {
    let admit!: (value: StudioLiveAuthTicketResponse) => void;
    const requestTicket = vi.fn(() => new Promise<StudioLiveAuthTicketResponse>((resolve) => { admit = resolve; }));
    const createGuestCredential = vi.fn();
    const hook = renderHook(() => useStudioLiveTransportAuth(
      { authReady: true, userId: "signed-in-user" },
      { requestTicket, createGuestCredential },
    ));
    expect(hook.result.current).toBeUndefined();
    await act(async () => { admit({ version: 1, ticket: "admitted-session", issuedAt: "2026-09-08T00:00:00.000Z", expiresAt: "2026-09-08T00:01:00.000Z" }); });
    await waitFor(() => expect(hook.result.current).toBeTypeOf("function"));
    const transport = hook.result.current!({
      workId: "admitted-local",
      roomName: "admitted-local",
      participant: { sessionId: "alice", displayName: "Alice", role: "editor" },
    });
    try {
      await transport.connect();
      expect(transport.mode).toBe("local");
      expect(transport.ready).toBe(true);
      expect(createGuestCredential).not.toHaveBeenCalled();
      expect(socketModule.imports).toBe(0);
    } finally {
      transport.close();
    }
  });

});
