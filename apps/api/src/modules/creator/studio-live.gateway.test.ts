import { fromUint8Array } from "js-base64";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import {
  StudioLiveCrdtSyncSchema,
  StudioLiveCrdtUpdateSchema,
  StudioLiveCursorSchema,
  StudioLiveGateway,
  StudioLiveJoinSchema,
  StudioLiveLockReleaseSchema,
  StudioLiveLockRequestSchema,
  StudioLiveScreenAccessSchema,
  StudioLiveScreenAnnounceSchema,
  StudioLiveScreenRequestSchema,
  StudioLiveScreenStopSchema,
  StudioLiveSignalSchema,
  isStudioLiveOriginAllowed,
  studioLiveAllowRequest,
} from "./studio-live.gateway";

import type { CreatorService } from "./creator.service";
import type { StudioCrdtService } from "./studio-crdt.service";
import type {
  StudioLiveAuthPrincipal,
  StudioLiveSessionAuthenticator,
  StudioLiveSessionRevalidator,
} from "./studio-live.gateway";
import type { Namespace } from "socket.io";

interface Emission {
  target: string;
  event: string;
  payload: unknown;
}

interface FakeSocket {
  id: string;
  data: { authUserId?: string; authPrincipal?: StudioLiveAuthPrincipal };
  handshake: { auth: Record<string, unknown> };
  joined: Set<string>;
  left: Set<string>;
  disconnected: boolean;
  emit: (event: string, payload: unknown) => void;
  disconnect: (close?: boolean) => void;
  join: (room: string) => Promise<void>;
  leave: (room: string) => Promise<void>;
  to: (room: string) => { emit: (event: string, payload: unknown) => void };
}

type FakeNamespaceMiddleware = (
  socket: FakeSocket,
  next: (error?: Error) => void
) => void;

function teamSnapshot(
  userId: string,
  workId: string,
  options: { edit?: boolean; view?: boolean; role?: "owner" | "admin" | "editor" | "commenter" | "viewer" } = {}
) {
  const role = options.role ?? (userId === "owner" ? "owner" : "editor");
  const edit = options.edit ?? (role === "owner" || role === "admin" || role === "editor");
  const view = options.view ?? true;
  return {
    workId,
    viewer: {
      userId,
      role,
      status: "active" as const,
      capabilities: {
        view,
        comment: role !== "viewer",
        edit,
        manageMembers: role === "owner" || role === "admin",
        respondInvite: false,
      },
    },
    members: [
      {
        userId,
        name: userId === "owner" ? "작가" : "어시스턴트",
        role,
        status: "active" as const,
        isOwner: role === "owner",
      },
    ],
  };
}

function createHarness(
  getWorkTeam: (userId: string, workId: string) => Promise<ReturnType<typeof teamSnapshot>> = async (
    userId,
    workId
  ) => teamSnapshot(userId, workId),
  authenticateSession: StudioLiveSessionAuthenticator = async (token) =>
    token.startsWith("valid:")
      ? {
          userId: token.slice(6),
          sessionVersion: 1,
          expiresAt: Date.now() + 60_000,
        }
      : null,
  revalidateSession: StudioLiveSessionRevalidator = async (principal) =>
    principal.expiresAt > Date.now()
) {
  const emissions: Emission[] = [];
  const sockets = new Map<string, FakeSocket>();
  const middlewares: FakeNamespaceMiddleware[] = [];
  const namespace = {
    sockets,
    use(middleware: FakeNamespaceMiddleware) {
      middlewares.push(middleware);
      return namespace;
    },
    to(target: string) {
      return {
        emit(event: string, payload: unknown) {
          emissions.push({ target, event, payload });
        },
      };
    },
  };
  const service = { getWorkTeam: vi.fn(getWorkTeam) };
  const crdtService = {
    sync: vi.fn(async () => ({
      chunks: ["AA=="],
      chunkCount: 1,
      totalBytes: 1,
      serverStateVector: "AA==",
      serverSequence: "0",
    })),
    applyUpdate: vi.fn(async (input: { updateId: string; data: string }) => ({
      duplicate: false,
      updateId: input.updateId,
      update: input.data,
      serverStateVector: "AA==",
      serverSequence: "1",
    })),
  };
  const authenticate = vi.fn(authenticateSession);
  const revalidate = vi.fn(revalidateSession);
  const gateway = new StudioLiveGateway(
    service as unknown as CreatorService,
    authenticate,
    revalidate,
    crdtService as unknown as StudioCrdtService
  );
  gateway.server = namespace as unknown as Namespace;

  function socket(id: string, token = `valid:${id}`): FakeSocket {
    const current: FakeSocket = {
      id,
      data: {},
      handshake: { auth: { sessionToken: token } },
      joined: new Set(),
      left: new Set(),
      disconnected: false,
      emit(event, payload) {
        emissions.push({ target: id, event, payload });
      },
      disconnect() {
        current.disconnected = true;
      },
      async join(room) {
        current.joined.add(room);
      },
      async leave(room) {
        current.joined.delete(room);
        current.left.add(room);
      },
      to(target) {
        return {
          emit(event, payload) {
            emissions.push({ target: `from:${id}:${target}`, event, payload });
          },
        };
      },
    };
    sockets.set(id, current);
    return current;
  }

  return {
    gateway,
    service,
    crdtService,
    authenticate,
    revalidate,
    emissions,
    sockets,
    middlewares,
    namespace,
    socket,
  };
}

async function connectAndJoin(
  harness: ReturnType<typeof createHarness>,
  socket: FakeSocket,
  workId = "work-1"
) {
  await harness.gateway.handleConnection(socket as never);
  return harness.gateway.join(
    socket as never,
    { workId, clientInstanceId: `client-${socket.id}` },
    undefined
  );
}

function crdtStateVector(): string {
  const doc = new Y.Doc();
  const stateVector = fromUint8Array(Y.encodeStateVector(doc));
  doc.destroy();
  return stateVector;
}

function crdtUpdate(key = "stroke", value = "1"): string {
  const doc = new Y.Doc();
  doc.getMap<string>("canvas").set(key, value);
  const update = fromUint8Array(Y.encodeStateAsUpdate(doc));
  doc.destroy();
  return update;
}

function crdtUpdateRequest(sequence = 1) {
  return {
    protocolVersion: 1 as const,
    workId: "work-1",
    updateId: `00000000-0000-4000-8000-${sequence.toString().padStart(12, "0")}`,
    clientSequence: sequence,
    update: crdtUpdate(`stroke-${sequence}`, String(sequence)),
  };
}

function createTeamReadGate() {
  let held = false;
  const pending: Array<() => void> = [];
  return {
    lookup: async (userId: string, workId: string) => {
      if (!held) return teamSnapshot(userId, workId);
      return new Promise<ReturnType<typeof teamSnapshot>>((resolve) => {
        pending.push(() => resolve(teamSnapshot(userId, workId)));
      });
    },
    hold() {
      held = true;
    },
    pendingCount() {
      return pending.length;
    },
    releasePending() {
      const current = pending.splice(0);
      for (const release of current) release();
    },
  };
}

describe("studio live protocol", () => {
  it("rejects unknown keys, control characters, out-of-range cursors, and oversized SDP", () => {
    expect(
      StudioLiveJoinSchema.safeParse({ workId: "work-1", clientInstanceId: "client-1", extra: true }).success
    ).toBe(false);
    expect(StudioLiveJoinSchema.safeParse({ workId: "work\n1", clientInstanceId: "client-1" }).success).toBe(false);
    expect(StudioLiveCursorSchema.safeParse({ workId: "work-1", pageId: null, x: 1.01, y: 0 }).success).toBe(false);
    expect(
      StudioLiveSignalSchema.safeParse({
        workId: "work-1",
        targetConnectionId: "peer",
        shareId: "share-1",
        kind: "description",
        description: { type: "offer", sdp: "s".repeat(48 * 1_024 + 1) },
      }).success
    ).toBe(false);
  });

  it("enforces the exact CRDT v1 request shape and incremental byte boundary", () => {
    const sync = {
      protocolVersion: 1,
      workId: "work-1",
      requestId: "request-1",
      stateVector: crdtStateVector(),
    };
    expect(StudioLiveCrdtSyncSchema.safeParse(sync).success).toBe(true);
    expect(StudioLiveCrdtSyncSchema.safeParse({ ...sync, protocolVersion: 2 }).success).toBe(
      false
    );
    expect(StudioLiveCrdtSyncSchema.safeParse({ ...sync, extra: true }).success).toBe(false);

    const update = crdtUpdateRequest();
    expect(StudioLiveCrdtUpdateSchema.safeParse(update).success).toBe(true);
    expect(StudioLiveCrdtUpdateSchema.safeParse({ ...update, clientSequence: 0 }).success).toBe(
      false
    );
    expect(
      StudioLiveCrdtUpdateSchema.safeParse({
        ...update,
        update: fromUint8Array(new Uint8Array(48 * 1_024)),
      }).success
    ).toBe(true);
    expect(
      StudioLiveCrdtUpdateSchema.safeParse({
        ...update,
        update: fromUint8Array(new Uint8Array(48 * 1_024 + 1)),
      }).success
    ).toBe(false);
  });

  it("enforces the canonical 200-character resource identifier boundary", () => {
    expect(
      StudioLiveLockRequestSchema.safeParse({
        workId: "work-1",
        resourceId: "r".repeat(200),
        leaseMs: 15_000,
      }).success
    ).toBe(true);
    expect(
      StudioLiveLockRequestSchema.safeParse({
        workId: "work-1",
        resourceId: "r".repeat(201),
        leaseMs: 15_000,
      }).success
    ).toBe(false);
    expect(
      StudioLiveLockReleaseSchema.safeParse({
        workId: "work-1",
        resourceId: "r".repeat(200),
        leaseId: "lease-1",
      }).success
    ).toBe(true);
    expect(
      StudioLiveLockReleaseSchema.safeParse({
        workId: "work-1",
        resourceId: "r".repeat(201),
        leaseId: "lease-1",
      }).success
    ).toBe(false);
  });

  it("matches the canonical SDP and ICE boundaries and control-character policy", () => {
    const descriptionSignal = (sdp: string) => ({
      workId: "work-1",
      targetConnectionId: "peer",
      shareId: "share-1",
      kind: "description",
      description: { type: "offer", sdp },
    });
    const candidateSignal = (candidate: Record<string, unknown>) => ({
      workId: "work-1",
      targetConnectionId: "peer",
      shareId: "share-1",
      kind: "candidate",
      candidate,
    });
    const maximumSdp = "s".repeat(48 * 1_024);
    const maximumMultibyteSdp = "가".repeat((48 * 1_024) / 3);
    const maximumEscapedSdp = "\r\n\\\"".repeat((48 * 1_024) / 8);

    expect(StudioLiveSignalSchema.safeParse(descriptionSignal(maximumSdp)).success).toBe(true);
    expect(StudioLiveSignalSchema.safeParse(descriptionSignal(`${maximumSdp}s`)).success).toBe(false);
    expect(
      StudioLiveSignalSchema.safeParse(descriptionSignal(maximumMultibyteSdp)).success
    ).toBe(true);
    expect(
      StudioLiveSignalSchema.safeParse(descriptionSignal(`${maximumMultibyteSdp}가`)).success
    ).toBe(false);
    expect(
      StudioLiveSignalSchema.safeParse(descriptionSignal(maximumEscapedSdp)).success
    ).toBe(true);
    expect(
      StudioLiveSignalSchema.safeParse(descriptionSignal(`${maximumEscapedSdp}"`)).success
    ).toBe(false);
    expect(
      StudioLiveSignalSchema.safeParse(descriptionSignal("v=0\r\ns=studio\r\n")).success
    ).toBe(true);
    expect(StudioLiveSignalSchema.safeParse(descriptionSignal("v=0\ts=studio")).success).toBe(false);
    expect(StudioLiveSignalSchema.safeParse(descriptionSignal("v=0\u0085s=studio")).success).toBe(false);
    expect(StudioLiveSignalSchema.safeParse(descriptionSignal(" \r\n ")).success).toBe(false);

    expect(
      StudioLiveSignalSchema.safeParse(
        candidateSignal({ candidate: "c".repeat(8 * 1_024) })
      ).success
    ).toBe(true);
    expect(
      StudioLiveSignalSchema.safeParse(
        candidateSignal({ candidate: "c".repeat(8 * 1_024 + 1) })
      ).success
    ).toBe(false);
    const maximumMultibyteCandidate = `${"가".repeat(2_730)}ab`;
    const maximumEscapedCandidate = "\\\"".repeat((8 * 1_024) / 4);
    expect(
      StudioLiveSignalSchema.safeParse(
        candidateSignal({ candidate: maximumMultibyteCandidate })
      ).success
    ).toBe(true);
    expect(
      StudioLiveSignalSchema.safeParse(
        candidateSignal({ candidate: `${maximumMultibyteCandidate}c` })
      ).success
    ).toBe(false);
    expect(
      StudioLiveSignalSchema.safeParse(
        candidateSignal({ candidate: maximumEscapedCandidate })
      ).success
    ).toBe(true);
    expect(
      StudioLiveSignalSchema.safeParse(
        candidateSignal({ candidate: `${maximumEscapedCandidate}"` })
      ).success
    ).toBe(false);
    expect(
      StudioLiveSignalSchema.safeParse(candidateSignal({ candidate: "candidate\n1" })).success
    ).toBe(false);
    expect(
      StudioLiveSignalSchema.safeParse(candidateSignal({ candidate: "   " })).success
    ).toBe(false);
    expect(
      StudioLiveSignalSchema.safeParse(candidateSignal({ candidate: "candidate\u00801" })).success
    ).toBe(false);
    expect(
      StudioLiveSignalSchema.safeParse(
        candidateSignal({
          candidate: "candidate:1",
          sdpMid: "m".repeat(128),
          usernameFragment: "u".repeat(256),
        })
      ).success
    ).toBe(true);
    expect(
      StudioLiveSignalSchema.safeParse(
        candidateSignal({ candidate: "candidate:1", sdpMid: "m".repeat(129) })
      ).success
    ).toBe(false);
    expect(
      StudioLiveSignalSchema.safeParse(
        candidateSignal({ candidate: "candidate:1", usernameFragment: "u".repeat(257) })
      ).success
    ).toBe(false);
    expect(
      StudioLiveSignalSchema.safeParse(
        candidateSignal({ candidate: "candidate:1", sdpMid: "", usernameFragment: "" })
      ).success
    ).toBe(true);
    expect(
      StudioLiveSignalSchema.safeParse(
        candidateSignal({ candidate: "candidate:1", sdpMid: null, usernameFragment: null })
      ).success
    ).toBe(true);
    expect(
      StudioLiveSignalSchema.safeParse(
        candidateSignal({ candidate: "candidate:1", sdpMid: "audio\n" })
      ).success
    ).toBe(false);
    expect(
      StudioLiveSignalSchema.safeParse(
        candidateSignal({ candidate: "candidate:1", usernameFragment: "user\u007f" })
      ).success
    ).toBe(false);
    expect(
      StudioLiveSignalSchema.safeParse(
        candidateSignal({ candidate: "candidate:1", extra: true })
      ).success
    ).toBe(false);
  });

  it("requires a strict bounded share id on every WebRTC signaling variant", () => {
    expect(
      StudioLiveSignalSchema.safeParse({
        workId: "work-1",
        targetConnectionId: "peer",
        shareId: "share-1",
        kind: "description",
        description: { type: "offer", sdp: "v=0\r\n" },
      }).success
    ).toBe(true);
    expect(
      StudioLiveSignalSchema.safeParse({
        workId: "work-1",
        targetConnectionId: "peer",
        kind: "description",
        description: { type: "offer", sdp: "v=0\r\n" },
      }).success
    ).toBe(false);
    expect(
      StudioLiveSignalSchema.safeParse({
        workId: "work-1",
        targetConnectionId: "peer",
        shareId: "s".repeat(161),
        kind: "candidate",
        candidate: { candidate: "candidate:1" },
      }).success
    ).toBe(false);
    expect(
      StudioLiveSignalSchema.safeParse({
        workId: "work-1",
        targetConnectionId: "peer",
        shareId: "share-1",
        kind: "candidate",
        candidate: { candidate: "candidate:1" },
      }).success
    ).toBe(true);
    expect(
      StudioLiveSignalSchema.safeParse({
        workId: "work-1",
        targetConnectionId: "peer",
        shareId: "share-1",
        kind: "bye",
        extra: true,
      }).success
    ).toBe(false);
  });

  it("strictly validates bounded screen-share metadata and the frontend decision vocabulary", () => {
    expect(
      StudioLiveScreenAnnounceSchema.safeParse({
        workId: "work-1",
        shareId: "share-1",
        label: "작가 화면",
      }).success
    ).toBe(true);
    expect(
      StudioLiveScreenAnnounceSchema.safeParse({
        workId: "work-1",
        shareId: "share\n1",
        label: "작가 화면",
      }).success
    ).toBe(false);
    expect(
      StudioLiveScreenAnnounceSchema.safeParse({
        workId: "work-1",
        shareId: "share-1",
        label: "가".repeat(81),
      }).success
    ).toBe(false);
    expect(
      StudioLiveScreenRequestSchema.safeParse({
        workId: "work-1",
        targetConnectionId: "target",
        shareId: "s".repeat(161),
      }).success
    ).toBe(false);
    expect(
      StudioLiveScreenAccessSchema.safeParse({
        workId: "work-1",
        targetConnectionId: "target",
        shareId: "share-1",
        decision: "rejected",
      }).success
    ).toBe(true);
    expect(
      StudioLiveScreenAccessSchema.safeParse({
        workId: "work-1",
        targetConnectionId: "target",
        shareId: "share-1",
        decision: "denied",
      }).success
    ).toBe(false);
    expect(
      StudioLiveScreenStopSchema.safeParse({
        workId: "work-1",
        shareId: "share-1",
        extra: true,
      }).success
    ).toBe(false);
  });

  it("rejects a disallowed WebSocket upgrade origin instead of relying on CORS headers", () => {
    expect(isStudioLiveOriginAllowed(undefined)).toBe(true);
    expect(isStudioLiveOriginAllowed("https://evil.example")).toBe(false);
    let allowed: boolean | null = null;
    studioLiveAllowRequest(
      { headers: { origin: "https://evil.example" } },
      (_error, accepted) => {
        allowed = accepted;
      }
    );
    expect(allowed).toBe(false);
  });
});

describe("StudioLiveGateway", () => {
  it("completes namespace authentication before admitting the socket", async () => {
    let resolveAuthentication: ((principal: StudioLiveAuthPrincipal | null) => void) | null = null;
    const authentication = new Promise<StudioLiveAuthPrincipal | null>((resolve) => {
      resolveAuthentication = resolve;
    });
    const harness = createHarness(undefined, async () => authentication);
    harness.gateway.afterInit(harness.namespace as unknown as Namespace);
    const socket = harness.socket("owner");
    const next = vi.fn();

    harness.middlewares[0]?.(socket, next);
    expect(next).not.toHaveBeenCalled();

    resolveAuthentication?.({
      userId: "owner",
      sessionVersion: 1,
      expiresAt: Date.now() + 60_000,
    });
    await vi.waitFor(() => expect(next).toHaveBeenCalledWith());
    expect(socket.data.authUserId).toBe("owner");
    expect(socket.data.authPrincipal?.userId).toBe("owner");
    expect(socket.handshake.auth).not.toHaveProperty("sessionToken");
    harness.gateway.onModuleDestroy();
  });

  it("disconnects sockets without a verified session", async () => {
    const harness = createHarness();
    const socket = harness.socket("guest", "invalid");

    await harness.gateway.handleConnection(socket as never);

    expect(socket.disconnected).toBe(true);
    expect(socket.data.authUserId).toBeUndefined();
    expect(harness.emissions).toContainEqual({
      target: "guest",
      event: "studio:error",
      payload: {
        ok: false,
        code: "unauthenticated",
        message: "로그인 세션을 확인할 수 없습니다.",
      },
    });
  });

  it("joins only an active work ACL and never exposes the database user id", async () => {
    const harness = createHarness();
    const socket = harness.socket("owner");

    const response = await connectAndJoin(harness, socket);

    expect(response.ok).toBe(true);
    if (!response.ok) throw new Error("join failed");
    expect(response.data.self).toMatchObject({
      connectionId: "owner",
      clientInstanceId: "client-owner",
      name: "작가",
      role: "owner",
      state: "active",
    });
    expect(response.data.self).not.toHaveProperty("userId");
    expect(response.data.self).not.toHaveProperty("workId");
    expect(socket.joined).toContain("studio-live:work-1");
    expect(harness.service.getWorkTeam).toHaveBeenCalledWith("owner", "work-1");
  });

  it("fails closed when the work ACL lookup rejects", async () => {
    const harness = createHarness(async () => {
      throw new Error("forbidden");
    });
    const socket = harness.socket("editor");

    const response = await connectAndJoin(harness, socket);

    expect(response).toEqual({
      ok: false,
      code: "forbidden",
      message: "이 작품의 실시간 작업실에 참여할 수 없습니다.",
    });
    expect(socket.joined.size).toBe(0);
  });

  it("does not retain a ghost participant when the Socket.IO room join rejects", async () => {
    const harness = createHarness();
    const socket = harness.socket("editor");
    await harness.gateway.handleConnection(socket as never);
    socket.join = async () => {
      throw new Error("adapter unavailable");
    };

    const response = await harness.gateway.join(
      socket as never,
      { workId: "work-1", clientInstanceId: "client-editor" },
      undefined
    );
    expect(response).toMatchObject({ ok: false, code: "forbidden" });

    const cursor = await harness.gateway.updateCursor(
      socket as never,
      { workId: "work-1", pageId: null, x: 0.5, y: 0.5 },
      undefined
    );
    expect(cursor).toMatchObject({ ok: false, code: "not_joined" });
  });

  it("disconnects without committing a participant when the session expires during the work ACL lookup", async () => {
    let resolveTeam:
      | ((snapshot: ReturnType<typeof teamSnapshot>) => void)
      | null = null;
    const pendingTeam = new Promise<ReturnType<typeof teamSnapshot>>((resolve) => {
      resolveTeam = resolve;
    });
    const harness = createHarness(async () => pendingTeam);
    const socket = harness.socket("editor");
    await harness.gateway.handleConnection(socket as never);

    const joining = harness.gateway.join(
      socket as never,
      { workId: "work-1", clientInstanceId: "client-editor" },
      undefined
    );
    await vi.waitFor(() => expect(harness.service.getWorkTeam).toHaveBeenCalledTimes(1));
    if (!socket.data.authPrincipal) throw new Error("expected authenticated principal");
    socket.data.authPrincipal.expiresAt = Date.now() - 1;
    resolveTeam?.(teamSnapshot("editor", "work-1"));

    await expect(joining).resolves.toMatchObject({ ok: false, code: "unauthenticated" });
    const internals = harness.gateway as unknown as {
      participantsBySocket: Map<string, unknown>;
      socketIdsByWork: Map<string, Set<string>>;
    };
    expect(socket.disconnected).toBe(true);
    expect(socket.joined.size).toBe(0);
    expect(socket.data.authUserId).toBeUndefined();
    expect(socket.data.authPrincipal).toBeUndefined();
    expect(internals.participantsBySocket.has(socket.id)).toBe(false);
    expect(internals.socketIdsByWork.has("work-1")).toBe(false);
  });

  it("rolls back a speculative adapter room when the session expires while joining it", async () => {
    let releaseAdapterJoin: (() => void) | null = null;
    const adapterJoin = new Promise<void>((resolve) => {
      releaseAdapterJoin = resolve;
    });
    const harness = createHarness();
    const socket = harness.socket("editor");
    await harness.gateway.handleConnection(socket as never);
    socket.join = vi.fn(async (room: string) => {
      await adapterJoin;
      socket.joined.add(room);
    });

    const joining = harness.gateway.join(
      socket as never,
      { workId: "work-1", clientInstanceId: "client-editor" },
      undefined
    );
    await vi.waitFor(() => expect(socket.join).toHaveBeenCalledWith("studio-live:work-1"));
    if (!socket.data.authPrincipal) throw new Error("expected authenticated principal");
    socket.data.authPrincipal.expiresAt = Date.now() - 1;
    releaseAdapterJoin?.();

    await expect(joining).resolves.toMatchObject({ ok: false, code: "unauthenticated" });
    const internals = harness.gateway as unknown as {
      participantsBySocket: Map<string, unknown>;
      socketIdsByWork: Map<string, Set<string>>;
    };
    expect(socket.disconnected).toBe(true);
    expect(socket.joined.size).toBe(0);
    expect(socket.left).toContain("studio-live:work-1");
    expect(internals.participantsBySocket.has(socket.id)).toBe(false);
    expect(internals.socketIdsByWork.has("work-1")).toBe(false);
  });

  it("disconnects an expired speculative join without waiting for a pending adapter leave", async () => {
    let releaseAdapterJoin: (() => void) | null = null;
    const adapterJoin = new Promise<void>((resolve) => {
      releaseAdapterJoin = resolve;
    });
    const pendingLeave = new Promise<void>(() => undefined);
    const harness = createHarness();
    const socket = harness.socket("editor");
    await harness.gateway.handleConnection(socket as never);
    socket.join = vi.fn(async (room: string) => {
      await adapterJoin;
      socket.joined.add(room);
    });
    socket.leave = vi.fn(() => pendingLeave);

    const joining = harness.gateway.join(
      socket as never,
      { workId: "work-1", clientInstanceId: "client-editor" },
      undefined
    );
    await vi.waitFor(() => expect(socket.join).toHaveBeenCalledWith("studio-live:work-1"));
    if (!socket.data.authPrincipal) throw new Error("expected authenticated principal");
    socket.data.authPrincipal.expiresAt = Date.now() - 1;
    releaseAdapterJoin?.();

    await expect(joining).resolves.toMatchObject({ ok: false, code: "unauthenticated" });
    const internals = harness.gateway as unknown as {
      participantsBySocket: Map<string, unknown>;
      socketIdsByWork: Map<string, Set<string>>;
    };
    expect(socket.disconnected).toBe(true);
    expect(socket.leave).toHaveBeenCalledWith("studio-live:work-1");
    expect(socket.data.authUserId).toBeUndefined();
    expect(socket.data.authPrincipal).toBeUndefined();
    expect(internals.participantsBySocket.has(socket.id)).toBe(false);
    expect(internals.socketIdsByWork.has("work-1")).toBe(false);
  });

  it("rate limits a valid join before running session or work authorization I/O", async () => {
    const harness = createHarness();
    const socket = harness.socket("editor");
    await harness.gateway.handleConnection(socket as never);
    const internals = harness.gateway as unknown as {
      rateLimits: Map<string, Map<string, { count: number; resetsAt: number }>>;
    };
    internals.rateLimits.set(
      socket.id,
      new Map([["join", { count: 12, resetsAt: Date.now() + 60_000 }]])
    );

    const response = await harness.gateway.join(
      socket as never,
      { workId: "work-1", clientInstanceId: "client-editor" },
      undefined
    );

    expect(response).toMatchObject({ ok: false, code: "rate_limited" });
    expect(harness.revalidate).not.toHaveBeenCalled();
    expect(harness.service.getWorkTeam).not.toHaveBeenCalled();
  });

  it("serializes concurrent joins so only the latest work owns the socket and room index", async () => {
    const harness = createHarness();
    const socket = harness.socket("editor");
    await harness.gateway.handleConnection(socket as never);

    const [superseded, latest] = await Promise.all([
      harness.gateway.join(
        socket as never,
        { workId: "work-a", clientInstanceId: "client-editor-a" },
        undefined
      ),
      harness.gateway.join(
        socket as never,
        { workId: "work-b", clientInstanceId: "client-editor-b" },
        undefined
      ),
    ]);

    expect(superseded).toMatchObject({ ok: false, code: "not_joined" });
    expect(latest.ok).toBe(true);
    expect([...socket.joined]).toEqual(["studio-live:work-b"]);
    const internals = harness.gateway as unknown as {
      participantsBySocket: Map<string, { workId: string }>;
      socketIdsByWork: Map<string, Set<string>>;
    };
    expect(internals.participantsBySocket.get("editor")?.workId).toBe("work-b");
    expect([...internals.socketIdsByWork.keys()]).toEqual(["work-b"]);

    await expect(
      harness.gateway.updateCursor(
        socket as never,
        { workId: "work-a", pageId: null, x: 0.5, y: 0.5 },
        undefined
      )
    ).resolves.toMatchObject({ ok: false, code: "not_joined" });
    await expect(
      harness.gateway.updateCursor(
        socket as never,
        { workId: "work-b", pageId: null, x: 0.5, y: 0.5 },
        undefined
      )
    ).resolves.toEqual({ ok: true, data: { accepted: true } });
  });

  it("relays normalized cursor positions only to the joined work room", async () => {
    const harness = createHarness();
    const socket = harness.socket("editor");
    await connectAndJoin(harness, socket);

    const response = await harness.gateway.updateCursor(
      socket as never,
      { workId: "work-1", pageId: "page-1", x: 0.25, y: 0.75 },
      undefined
    );

    expect(response).toEqual({ ok: true, data: { accepted: true } });
    expect(harness.emissions).toContainEqual({
      target: "from:editor:studio-live:work-1",
      event: "studio:cursor",
      payload: expect.objectContaining({
        connectionId: "editor",
        pageId: "page-1",
        x: 0.25,
        y: 0.75,
      }),
    });
  });

  it("grants renewable edit leases and rejects a competing editor", async () => {
    const harness = createHarness();
    const first = harness.socket("editor-a");
    const second = harness.socket("editor-b");
    await connectAndJoin(harness, first);
    await connectAndJoin(harness, second);

    const acquired = await harness.gateway.requestLock(
      first as never,
      { workId: "work-1", resourceId: "element:panel-1", leaseMs: 15_000 },
      undefined
    );
    expect(acquired.ok).toBe(true);
    if (!acquired.ok) throw new Error("lock failed");

    const renewed = await harness.gateway.requestLock(
      first as never,
      { workId: "work-1", resourceId: "element:panel-1", leaseMs: 20_000 },
      undefined
    );
    expect(renewed.ok && renewed.data.lock.leaseId).toBe(acquired.data.lock.leaseId);

    const conflict = await harness.gateway.requestLock(
      second as never,
      { workId: "work-1", resourceId: "element:panel-1", leaseMs: 15_000 },
      undefined
    );
    expect(conflict).toMatchObject({ ok: false, code: "lock_conflict" });

    const staleRelease = await harness.gateway.releaseLock(
      first as never,
      { workId: "work-1", resourceId: "element:panel-1", leaseId: "stale" },
      undefined
    );
    expect(staleRelease).toEqual({ ok: true, data: { released: false } });

    const released = await harness.gateway.releaseLock(
      first as never,
      {
        workId: "work-1",
        resourceId: "element:panel-1",
        leaseId: acquired.data.lock.leaseId,
      },
      undefined
    );
    expect(released).toEqual({ ok: true, data: { released: true } });
  });

  it("rechecks edit ACL before a new lock and fails closed after revocation", async () => {
    let canEdit = true;
    const harness = createHarness(async (userId, workId) =>
      teamSnapshot(userId, workId, { edit: canEdit, role: canEdit ? "editor" : "commenter" })
    );
    const socket = harness.socket("editor");
    await connectAndJoin(harness, socket);
    canEdit = false;

    const response = await harness.gateway.requestLock(
      socket as never,
      { workId: "work-1", resourceId: "page:page-1", leaseMs: 15_000 },
      undefined
    );

    expect(response).toEqual({
      ok: false,
      code: "forbidden",
      message: "이 원고를 편집할 권한이 없습니다.",
    });
  });

  it("releases existing leases when same-work rejoin removes edit permission", async () => {
    let canEdit = true;
    const harness = createHarness(async (userId, workId) =>
      teamSnapshot(userId, workId, {
        edit: canEdit,
        role: canEdit ? "editor" : "commenter",
      })
    );
    const socket = harness.socket("editor");
    await connectAndJoin(harness, socket);
    const acquired = await harness.gateway.requestLock(
      socket as never,
      { workId: "work-1", resourceId: "page:role", leaseMs: 15_000 },
      undefined
    );
    expect(acquired.ok).toBe(true);

    canEdit = false;
    const rejoined = await harness.gateway.join(
      socket as never,
      { workId: "work-1", clientInstanceId: "client-editor-rejoin" },
      undefined
    );
    expect(rejoined.ok).toBe(true);
    if (!rejoined.ok) throw new Error("rejoin failed");
    expect(rejoined.data.self.capabilities.edit).toBe(false);
    expect(harness.emissions).toContainEqual({
      target: "studio-live:work-1",
      event: "studio:lock:update",
      payload: expect.objectContaining({
        action: "released",
        resourceId: "page:role",
      }),
    });
  });

  it("does not authorize an old-work lock with a newer work participant", async () => {
    let workACalls = 0;
    let resolveWorkARecheck:
      | ((snapshot: ReturnType<typeof teamSnapshot>) => void)
      | null = null;
    const workARecheck = new Promise<ReturnType<typeof teamSnapshot>>((resolve) => {
      resolveWorkARecheck = resolve;
    });
    const harness = createHarness(async (userId, workId) => {
      if (workId === "work-a") {
        workACalls += 1;
        if (workACalls === 1) {
          return teamSnapshot(userId, workId, { role: "viewer", edit: false });
        }
        return workARecheck;
      }
      return teamSnapshot(userId, workId, { role: "editor", edit: true });
    });
    const socket = harness.socket("member");
    await connectAndJoin(harness, socket, "work-a");

    const oldWorkLock = harness.gateway.requestLock(
      socket as never,
      { workId: "work-a", resourceId: "page:old", leaseMs: 15_000 },
      undefined
    );
    await vi.waitFor(() => expect(workACalls).toBe(2));
    const switched = await harness.gateway.join(
      socket as never,
      { workId: "work-b", clientInstanceId: "client-member-b" },
      undefined
    );
    expect(switched.ok).toBe(true);

    resolveWorkARecheck?.(
      teamSnapshot("member", "work-a", { role: "viewer", edit: false })
    );
    await expect(oldWorkLock).resolves.toMatchObject({ ok: false, code: "forbidden" });
    expect(
      harness.emissions.some(
        (emission) =>
          emission.target === "studio-live:work-a" &&
          emission.event === "studio:lock:update" &&
          (emission.payload as { action?: string }).action === "acquired"
      )
    ).toBe(false);

    const currentCursor = await harness.gateway.updateCursor(
      socket as never,
      { workId: "work-b", pageId: null, x: 0.5, y: 0.5 },
      undefined
    );
    expect(currentCursor).toEqual({ ok: true, data: { accepted: true } });
  });

  it("discards a stale concurrent ACL result after a newer role downgrade", async () => {
    let teamCalls = 0;
    let resolveStaleEditor:
      | ((snapshot: ReturnType<typeof teamSnapshot>) => void)
      | null = null;
    const staleEditor = new Promise<ReturnType<typeof teamSnapshot>>((resolve) => {
      resolveStaleEditor = resolve;
    });
    const harness = createHarness(async (userId, workId) => {
      teamCalls += 1;
      if (teamCalls === 1) {
        return teamSnapshot(userId, workId, { role: "editor", edit: true });
      }
      if (teamCalls === 2) return staleEditor;
      return teamSnapshot(userId, workId, { role: "commenter", edit: false });
    });
    const socket = harness.socket("editor");
    await connectAndJoin(harness, socket);

    const staleRequest = harness.gateway.requestLock(
      socket as never,
      { workId: "work-1", resourceId: "page:stale", leaseMs: 15_000 },
      undefined
    );
    await vi.waitFor(() => expect(teamCalls).toBe(2));
    const freshRequest = await harness.gateway.requestLock(
      socket as never,
      { workId: "work-1", resourceId: "page:fresh", leaseMs: 15_000 },
      undefined
    );
    expect(freshRequest).toMatchObject({ ok: false, code: "forbidden" });

    resolveStaleEditor?.(
      teamSnapshot("editor", "work-1", { role: "editor", edit: true })
    );
    await expect(staleRequest).resolves.toMatchObject({ ok: false, code: "forbidden" });
    expect(
      harness.emissions.some(
        (emission) =>
          emission.event === "studio:lock:update" &&
          (emission.payload as { action?: string }).action === "acquired"
      )
    ).toBe(false);

    await expect(
      harness.gateway.releaseLock(
        socket as never,
        { workId: "work-1", resourceId: "page:stale", leaseId: "none" },
        undefined
      )
    ).resolves.toMatchObject({ ok: false, code: "forbidden" });
  });

  it("does not acquire a lock when a peer relay starts a newer target downgrade at the authorization boundary", async () => {
    const pendingReads: Array<{
      userId: string;
      workId: string;
      resolve: (snapshot: ReturnType<typeof teamSnapshot>) => void;
    }> = [];
    let holdReads = false;
    const harness = createHarness(async (userId, workId) => {
      if (!holdReads) return teamSnapshot(userId, workId);
      return new Promise<ReturnType<typeof teamSnapshot>>((resolve) => {
        pendingReads.push({ userId, workId, resolve });
      });
    });
    const sender = harness.socket("sender");
    const editor = harness.socket("editor");
    await connectAndJoin(harness, sender);
    await connectAndJoin(harness, editor);
    holdReads = true;

    const offer = harness.gateway.relaySignal(
      sender as never,
      {
        workId: "work-1",
        targetConnectionId: "editor",
        shareId: "share-atomic-lock",
        kind: "description",
        description: { type: "offer", sdp: "v=0\r\n" },
      },
      undefined
    );
    const lock = harness.gateway.requestLock(
      editor as never,
      { workId: "work-1", resourceId: "page:atomic-lock", leaseMs: 15_000 },
      undefined
    );
    await vi.waitFor(() => expect(pendingReads).toHaveLength(2));
    expect(pendingReads.map(({ userId }) => userId)).toEqual(["sender", "editor"]);

    pendingReads.shift()?.resolve(teamSnapshot("sender", "work-1"));
    pendingReads.shift()?.resolve(
      teamSnapshot("editor", "work-1", { role: "editor", edit: true })
    );
    await vi.waitFor(() => expect(pendingReads).toHaveLength(1));
    expect(pendingReads[0]?.userId).toBe("editor");
    expect(
      harness.emissions.some(
        (emission) =>
          emission.event === "studio:lock:update" &&
          (emission.payload as { action?: string }).action === "acquired"
      )
    ).toBe(false);

    pendingReads.shift()?.resolve(
      teamSnapshot("editor", "work-1", { role: "viewer", edit: false })
    );
    await expect(lock).resolves.toMatchObject({ ok: false, code: "forbidden" });
    await expect(offer).resolves.toMatchObject({ ok: true });
    expect(
      harness.emissions.some(
        (emission) =>
          emission.event === "studio:lock:update" &&
          (emission.payload as { action?: string }).action === "acquired"
      )
    ).toBe(false);
  });

  it("disconnects and cleans leases when the authenticated session is revoked", async () => {
    let sessionAllowed = true;
    const harness = createHarness(
      undefined,
      undefined,
      async () => sessionAllowed
    );
    const socket = harness.socket("editor");
    await connectAndJoin(harness, socket);
    const acquired = await harness.gateway.requestLock(
      socket as never,
      { workId: "work-1", resourceId: "page:session", leaseMs: 15_000 },
      undefined
    );
    expect(acquired.ok).toBe(true);
    sessionAllowed = false;

    const revalidator = harness.gateway as unknown as {
      revalidateAllParticipants(): Promise<void>;
    };
    await revalidator.revalidateAllParticipants();

    expect(socket.disconnected).toBe(true);
    expect(socket.data.authUserId).toBeUndefined();
    expect(socket.data.authPrincipal).toBeUndefined();
    expect(harness.emissions).toContainEqual({
      target: "editor",
      event: "studio:access:revoked",
      payload: {
        workId: "work-1",
        message: "로그인 세션이 만료되거나 해제되어 실시간 작업실 연결을 종료했습니다.",
      },
    });
    expect(harness.emissions).toContainEqual({
      target: "studio-live:work-1",
      event: "studio:lock:update",
      payload: expect.objectContaining({
        action: "released",
        resourceId: "page:session",
      }),
    });
  });

  it("disconnects and removes a participant when the work view ACL is revoked", async () => {
    let canView = true;
    const harness = createHarness(async (userId, workId) =>
      teamSnapshot(userId, workId, { view: canView, role: "editor", edit: true })
    );
    const socket = harness.socket("editor");
    await connectAndJoin(harness, socket);
    canView = false;

    const revalidator = harness.gateway as unknown as {
      revalidateAllParticipants(): Promise<void>;
      participantsBySocket: Map<string, unknown>;
    };
    await revalidator.revalidateAllParticipants();

    expect(socket.disconnected).toBe(true);
    expect(socket.data.authUserId).toBeUndefined();
    expect(socket.data.authPrincipal).toBeUndefined();
    expect(socket.left).toContain("studio-live:work-1");
    expect(revalidator.participantsBySocket.has("editor")).toBe(false);
    expect(harness.emissions).toContainEqual({
      target: "editor",
      event: "studio:access:revoked",
      payload: {
        workId: "work-1",
        message: "팀 권한이 변경되어 실시간 작업실 연결을 종료했습니다.",
      },
    });
    expect(harness.emissions).toContainEqual({
      target: "studio-live:work-1",
      event: "studio:presence:leave",
      payload: { connectionId: "editor", reason: "revoked" },
    });
  });

  it("disconnects an ACL-revoked participant without waiting for an async adapter leave", async () => {
    let canView = true;
    const harness = createHarness(async (userId, workId) =>
      teamSnapshot(userId, workId, { view: canView, role: "viewer", edit: false })
    );
    const socket = harness.socket("viewer");
    await connectAndJoin(harness, socket);
    const pendingLeave = new Promise<void>(() => undefined);
    const leave = vi.fn(() => pendingLeave);
    socket.leave = leave;
    canView = false;

    const revalidator = harness.gateway as unknown as {
      revalidateAllParticipants(): Promise<void>;
      participantsBySocket: Map<string, unknown>;
    };
    const revocation = revalidator.revalidateAllParticipants();
    await vi.waitFor(() => expect(socket.disconnected).toBe(true));
    await revocation;

    expect(leave).toHaveBeenCalledWith("studio-live:work-1");
    expect(socket.data.authUserId).toBeUndefined();
    expect(socket.data.authPrincipal).toBeUndefined();
    expect(revalidator.participantsBySocket.has("viewer")).toBe(false);
  });

  it("rejects an expired principal before using the short ACL cache", async () => {
    const harness = createHarness();
    const socket = harness.socket("editor");
    await connectAndJoin(harness, socket);
    if (!socket.data.authPrincipal) throw new Error("missing auth principal");
    socket.data.authPrincipal.expiresAt = Date.now() - 1;

    const response = await harness.gateway.updateCursor(
      socket as never,
      { workId: "work-1", pageId: null, x: 0.5, y: 0.5 },
      undefined
    );

    expect(response).toMatchObject({ ok: false, code: "not_joined" });
    expect(socket.disconnected).toBe(true);
    expect(socket.data.authUserId).toBeUndefined();
    expect(socket.data.authPrincipal).toBeUndefined();
    expect(harness.emissions).toContainEqual({
      target: "editor",
      event: "studio:access:revoked",
      payload: {
        workId: "work-1",
        message: "로그인 세션이 만료되거나 해제되어 실시간 작업실 연결을 종료했습니다.",
      },
    });
    expect(
      harness.emissions.some(
        (emission) =>
          emission.event === "studio:cursor" && emission.target.includes("studio-live:work-1")
      )
    ).toBe(false);
  });

  it("fails closed when session-revocation room leave throws synchronously", async () => {
    const harness = createHarness();
    const socket = harness.socket("editor");
    await connectAndJoin(harness, socket);
    const leave = vi.fn((): Promise<void> => {
      throw new Error("adapter leave failed");
    });
    socket.leave = leave;
    if (!socket.data.authPrincipal) throw new Error("missing auth principal");
    socket.data.authPrincipal.expiresAt = Date.now() - 1;

    const response = await harness.gateway.updateCursor(
      socket as never,
      { workId: "work-1", pageId: null, x: 0.5, y: 0.5 },
      undefined
    );
    const internals = harness.gateway as unknown as {
      participantsBySocket: Map<string, unknown>;
    };

    expect(response).toMatchObject({ ok: false, code: "not_joined" });
    expect(leave).toHaveBeenCalledWith("studio-live:work-1");
    expect(socket.disconnected).toBe(true);
    expect(socket.data.authUserId).toBeUndefined();
    expect(socket.data.authPrincipal).toBeUndefined();
    expect(internals.participantsBySocket.has("editor")).toBe(false);
  });

  it("fails closed and handles a rejected session-revocation room leave", async () => {
    const harness = createHarness();
    const socket = harness.socket("editor");
    await connectAndJoin(harness, socket);
    const leave = vi.fn(() => Promise.reject(new Error("adapter leave rejected")));
    socket.leave = leave;
    if (!socket.data.authPrincipal) throw new Error("missing auth principal");
    socket.data.authPrincipal.expiresAt = Date.now() - 1;

    const response = await harness.gateway.updateCursor(
      socket as never,
      { workId: "work-1", pageId: null, x: 0.5, y: 0.5 },
      undefined
    );
    await Promise.resolve();
    const internals = harness.gateway as unknown as {
      participantsBySocket: Map<string, unknown>;
    };

    expect(response).toMatchObject({ ok: false, code: "not_joined" });
    expect(leave).toHaveBeenCalledWith("studio-live:work-1");
    expect(socket.disconnected).toBe(true);
    expect(socket.data.authUserId).toBeUndefined();
    expect(socket.data.authPrincipal).toBeUndefined();
    expect(internals.participantsBySocket.has("editor")).toBe(false);
  });

  it("rejects a principal that expires while the forced work ACL lookup is pending", async () => {
    let teamReads = 0;
    let resolveRecheck:
      | ((snapshot: ReturnType<typeof teamSnapshot>) => void)
      | null = null;
    const recheck = new Promise<ReturnType<typeof teamSnapshot>>((resolve) => {
      resolveRecheck = resolve;
    });
    const harness = createHarness(async (userId, workId) => {
      teamReads += 1;
      if (teamReads === 1) return teamSnapshot(userId, workId);
      return recheck;
    });
    const socket = harness.socket("owner");
    await connectAndJoin(harness, socket);

    const announcement = harness.gateway.announceScreenShare(
      socket as never,
      { workId: "work-1", shareId: "share-expiring", label: "작업 화면" },
      undefined
    );
    await vi.waitFor(() => expect(teamReads).toBe(2));
    if (!socket.data.authPrincipal) throw new Error("missing auth principal");
    socket.data.authPrincipal.expiresAt = Date.now() - 1;
    resolveRecheck?.(teamSnapshot("owner", "work-1"));

    await expect(announcement).resolves.toMatchObject({ ok: false, code: "not_joined" });
    expect(socket.disconnected).toBe(true);
    expect(socket.data.authUserId).toBeUndefined();
    expect(socket.data.authPrincipal).toBeUndefined();
    expect(harness.emissions).toContainEqual({
      target: "owner",
      event: "studio:access:revoked",
      payload: {
        workId: "work-1",
        message: "로그인 세션이 만료되거나 해제되어 실시간 작업실 연결을 종료했습니다.",
      },
    });
    expect(
      harness.emissions.some((emission) => emission.event === "studio:screen:announce")
    ).toBe(false);
  });

  it("announces and stops a share with bounded public metadata and synchronized presence", async () => {
    const harness = createHarness();
    const host = harness.socket("owner");
    await connectAndJoin(harness, host);

    const announced = await harness.gateway.announceScreenShare(
      host as never,
      { workId: "work-1", shareId: "share-1", label: "작가 화면" },
      undefined
    );
    expect(announced).toEqual({ ok: true, data: { delivered: true } });
    expect(harness.emissions).toContainEqual({
      target: "studio-live:work-1",
      event: "studio:screen:announce",
      payload: {
        fromConnectionId: "owner",
        fromName: "작가",
        shareId: "share-1",
        label: "작가 화면",
      },
    });
    expect(harness.emissions).toContainEqual({
      target: "studio-live:work-1",
      event: "studio:presence:update",
      payload: expect.objectContaining({ connectionId: "owner", sharingScreen: true }),
    });

    const stopped = await harness.gateway.stopScreenShare(
      host as never,
      { workId: "work-1", shareId: "share-1" },
      undefined
    );
    expect(stopped).toEqual({ ok: true, data: { delivered: true } });
    expect(harness.emissions).toContainEqual({
      target: "studio-live:work-1",
      event: "studio:screen:stop",
      payload: {
        fromConnectionId: "owner",
        fromName: "작가",
        shareId: "share-1",
      },
    });
    expect(harness.emissions).toContainEqual({
      target: "studio-live:work-1",
      event: "studio:presence:update",
      payload: expect.objectContaining({ connectionId: "owner", sharingScreen: false }),
    });
  });

  it("relays screen requests and access decisions with only public peer fields", async () => {
    const harness = createHarness();
    const viewer = harness.socket("viewer");
    const host = harness.socket("owner");
    await connectAndJoin(harness, viewer);
    await connectAndJoin(harness, host);

    const requested = await harness.gateway.requestScreenAccess(
      viewer as never,
      { workId: "work-1", targetConnectionId: "owner", shareId: "share-1" },
      undefined
    );
    expect(requested).toEqual({ ok: true, data: { delivered: true } });
    expect(harness.emissions).toContainEqual({
      target: "owner",
      event: "studio:screen:request",
      payload: {
        fromConnectionId: "viewer",
        fromName: "어시스턴트",
        shareId: "share-1",
      },
    });

    const approved = await harness.gateway.relayScreenAccess(
      host as never,
      {
        workId: "work-1",
        targetConnectionId: "viewer",
        shareId: "share-1",
        decision: "approved",
      },
      undefined
    );
    expect(approved).toEqual({ ok: true, data: { delivered: true } });
    expect(harness.emissions).toContainEqual({
      target: "viewer",
      event: "studio:screen:access",
      payload: {
        fromConnectionId: "owner",
        fromName: "작가",
        shareId: "share-1",
        decision: "approved",
      },
    });
  });

  it("rejects self/cross-work screen relays and rechecks the sender session", async () => {
    let sessionAllowed = true;
    const harness = createHarness(undefined, undefined, async () => sessionAllowed);
    const sender = harness.socket("sender");
    const otherWork = harness.socket("other");
    await connectAndJoin(harness, sender, "work-1");
    await connectAndJoin(harness, otherWork, "work-2");

    await expect(
      harness.gateway.requestScreenAccess(
        sender as never,
        { workId: "work-1", targetConnectionId: "sender", shareId: "share-1" },
        undefined
      )
    ).resolves.toMatchObject({ ok: false, code: "peer_unavailable" });
    await expect(
      harness.gateway.relayScreenAccess(
        sender as never,
        {
          workId: "work-1",
          targetConnectionId: "other",
          shareId: "share-1",
          decision: "rejected",
        },
        undefined
      )
    ).resolves.toMatchObject({ ok: false, code: "peer_unavailable" });

    sessionAllowed = false;
    await expect(
      harness.gateway.requestScreenAccess(
        sender as never,
        { workId: "work-1", targetConnectionId: "other", shareId: "share-1" },
        undefined
      )
    ).resolves.toMatchObject({ ok: false, code: "not_joined" });
    expect(sender.disconnected).toBe(true);
    expect(
      harness.emissions.some(
        (emission) =>
          emission.event === "studio:screen:request" ||
          emission.event === "studio:screen:access"
      )
    ).toBe(false);
  });

  it("rate limits targeted screen requests before running peer authorization", async () => {
    const harness = createHarness();
    const sender = harness.socket("sender");
    const target = harness.socket("target");
    await connectAndJoin(harness, sender);
    await connectAndJoin(harness, target);
    const internals = harness.gateway as unknown as {
      rateLimits: Map<string, Map<string, { count: number; resetsAt: number }>>;
    };
    internals.rateLimits.set(
      "sender",
      new Map([
        ["screen-request", { count: 60, resetsAt: Date.now() + 60_000 }],
      ])
    );
    const teamReadsBefore = harness.service.getWorkTeam.mock.calls.length;

    const response = await harness.gateway.requestScreenAccess(
      sender as never,
      { workId: "work-1", targetConnectionId: "target", shareId: "share-1" },
      undefined
    );

    expect(response).toMatchObject({ ok: false, code: "rate_limited" });
    expect(harness.service.getWorkTeam).toHaveBeenCalledTimes(teamReadsBefore);
  });

  it("updates screen-sharing presence without accepting a media stream on the server", async () => {
    const harness = createHarness();
    const socket = harness.socket("editor");
    await connectAndJoin(harness, socket);

    const response = await harness.gateway.setScreenSharing(
      socket as never,
      { workId: "work-1", sharing: true },
      undefined
    );

    expect(response.ok).toBe(true);
    if (!response.ok) throw new Error("screen state failed");
    expect(response.data.participant.sharingScreen).toBe(true);
    expect(harness.emissions).toContainEqual({
      target: "studio-live:work-1",
      event: "studio:presence:update",
      payload: expect.objectContaining({ connectionId: "editor", sharingScreen: true }),
    });
  });

  it("rate limits screen-state updates before their forced session and work recheck", async () => {
    const harness = createHarness();
    const socket = harness.socket("editor");
    await connectAndJoin(harness, socket);
    const internals = harness.gateway as unknown as {
      rateLimits: Map<string, Map<string, { count: number; resetsAt: number }>>;
    };
    internals.rateLimits.set(
      socket.id,
      new Map([["screen-set", { count: 30, resetsAt: Date.now() + 60_000 }]])
    );
    const revalidationsBefore = harness.revalidate.mock.calls.length;
    const teamReadsBefore = harness.service.getWorkTeam.mock.calls.length;

    const response = await harness.gateway.setScreenSharing(
      socket as never,
      { workId: "work-1", sharing: true },
      undefined
    );

    expect(response).toMatchObject({ ok: false, code: "rate_limited" });
    expect(harness.revalidate).toHaveBeenCalledTimes(revalidationsBefore);
    expect(harness.service.getWorkTeam).toHaveBeenCalledTimes(teamReadsBefore);
  });

  it("relays WebRTC signaling only to a currently joined peer in the same work", async () => {
    const harness = createHarness();
    const sender = harness.socket("sender");
    const target = harness.socket("target");
    await connectAndJoin(harness, sender);
    await connectAndJoin(harness, target);

    const delivered = await harness.gateway.relaySignal(
      sender as never,
      {
        workId: "work-1",
        targetConnectionId: "target",
        shareId: "share-1",
        kind: "description",
        description: { type: "offer", sdp: "v=0\r\n" },
      },
      undefined
    );

    expect(delivered.ok).toBe(true);
    expect(harness.emissions).toContainEqual({
      target: "target",
      event: "studio:signal",
      payload: expect.objectContaining({
        fromConnectionId: "sender",
        fromName: "어시스턴트",
        shareId: "share-1",
        kind: "description",
        description: { type: "offer", sdp: "v=0\r\n" },
      }),
    });

    const sessionReadsAfterDescription = harness.revalidate.mock.calls.length;
    const teamReadsAfterDescription = harness.service.getWorkTeam.mock.calls.length;
    const candidateDelivered = await harness.gateway.relaySignal(
      sender as never,
      {
        workId: "work-1",
        targetConnectionId: "target",
        shareId: "share-1",
        kind: "candidate",
        candidate: {
          candidate: "candidate:1 1 UDP 2122260223 192.0.2.1 54400 typ host",
          sdpMid: "",
          sdpMLineIndex: null,
          usernameFragment: "",
        },
      },
      undefined
    );
    expect(candidateDelivered.ok).toBe(true);
    expect(harness.revalidate).toHaveBeenCalledTimes(sessionReadsAfterDescription);
    expect(harness.service.getWorkTeam).toHaveBeenCalledTimes(teamReadsAfterDescription);
    expect(harness.emissions).toContainEqual({
      target: "target",
      event: "studio:signal",
      payload: expect.objectContaining({
        fromConnectionId: "sender",
        shareId: "share-1",
        kind: "candidate",
        candidate: {
          candidate: "candidate:1 1 UDP 2122260223 192.0.2.1 54400 typ host",
          sdpMid: "",
          sdpMLineIndex: null,
          usernameFragment: "",
        },
      }),
    });

    const signalEmissionsBeforeInvalid = harness.emissions.filter(
      (emission) => emission.event === "studio:signal"
    ).length;
    const controlledCandidate = await harness.gateway.relaySignal(
      sender as never,
      {
        workId: "work-1",
        targetConnectionId: "target",
        shareId: "share-1",
        kind: "candidate",
        candidate: { candidate: "candidate:1\nforged" },
      },
      undefined
    );
    expect(controlledCandidate).toMatchObject({ ok: false, code: "invalid_payload" });
    const byteOversizedCandidate = await harness.gateway.relaySignal(
      sender as never,
      {
        workId: "work-1",
        targetConnectionId: "target",
        shareId: "share-1",
        kind: "candidate",
        candidate: { candidate: `${"\\\"".repeat((8 * 1_024) / 4)}"` },
      },
      undefined
    );
    expect(byteOversizedCandidate).toMatchObject({ ok: false, code: "invalid_payload" });
    const byteOversizedSdp = await harness.gateway.relaySignal(
      sender as never,
      {
        workId: "work-1",
        targetConnectionId: "target",
        shareId: "share-1",
        kind: "description",
        description: { type: "offer", sdp: "가".repeat((48 * 1_024) / 3 + 1) },
      },
      undefined
    );
    expect(byteOversizedSdp).toMatchObject({ ok: false, code: "invalid_payload" });
    const missingShareId = await harness.gateway.relaySignal(
      sender as never,
      {
        workId: "work-1",
        targetConnectionId: "target",
        kind: "bye",
      } as never,
      undefined
    );
    expect(missingShareId).toMatchObject({ ok: false, code: "invalid_payload" });
    expect(
      harness.emissions.filter((emission) => emission.event === "studio:signal")
    ).toHaveLength(signalEmissionsBeforeInvalid);

    const unavailable = await harness.gateway.relaySignal(
      sender as never,
      {
        workId: "work-1",
        targetConnectionId: "missing",
        shareId: "share-1",
        kind: "bye",
      },
      undefined
    );
    expect(unavailable).toMatchObject({ ok: false, code: "peer_unavailable" });
  });

  it("coalesces a fresh-cache ICE burst into one forced check per peer", async () => {
    const harness = createHarness();
    const sender = harness.socket("sender");
    const target = harness.socket("target");
    await connectAndJoin(harness, sender);
    await connectAndJoin(harness, target);
    const sessionReadsBefore = harness.revalidate.mock.calls.length;
    const teamReadsBefore = harness.service.getWorkTeam.mock.calls.length;

    const responses = await Promise.all(
      Array.from({ length: 24 }, (_, index) =>
        harness.gateway.relaySignal(
          sender as never,
          {
            workId: "work-1",
            targetConnectionId: "target",
            shareId: "share-1",
            kind: "candidate",
            candidate: { candidate: `candidate:${index}` },
          },
          undefined
        )
      )
    );

    expect(responses.every((response) => response.ok)).toBe(true);
    expect(harness.revalidate).toHaveBeenCalledTimes(sessionReadsBefore + 2);
    expect(harness.service.getWorkTeam).toHaveBeenCalledTimes(teamReadsBefore + 2);
    expect(
      harness.emissions.filter((emission) => emission.event === "studio:signal")
    ).toHaveLength(24);
    const grantInternals = harness.gateway as unknown as {
      candidateRelayAuthorizations: Map<string, { expiresAt: number }>;
    };
    const fixedExpiry = [...grantInternals.candidateRelayAuthorizations.values()][0]?.expiresAt;
    if (!fixedExpiry) throw new Error("missing candidate grant expiry");

    for (let index = 24; index < 30; index += 1) {
      const response = await harness.gateway.relaySignal(
        sender as never,
        {
          workId: "work-1",
          targetConnectionId: "target",
          shareId: "share-1",
          kind: "candidate",
          candidate: { candidate: `candidate:${index}` },
        },
        undefined
      );
      expect(response.ok).toBe(true);
    }
    expect(harness.revalidate).toHaveBeenCalledTimes(sessionReadsBefore + 2);
    expect(harness.service.getWorkTeam).toHaveBeenCalledTimes(teamReadsBefore + 2);
    expect([...grantInternals.candidateRelayAuthorizations.values()][0]?.expiresAt).toBe(
      fixedExpiry
    );
    expect(
      harness.emissions.filter((emission) => emission.event === "studio:signal")
    ).toHaveLength(30);
  });

  it("rebases a candidate onto an in-flight description authorization", async () => {
    const gate = createTeamReadGate();
    const harness = createHarness(gate.lookup);
    const sender = harness.socket("sender");
    const target = harness.socket("target");
    await connectAndJoin(harness, sender);
    await connectAndJoin(harness, target);
    gate.hold();
    const sessionReadsBefore = harness.revalidate.mock.calls.length;
    const teamReadsBefore = harness.service.getWorkTeam.mock.calls.length;

    const description = harness.gateway.relaySignal(
      sender as never,
      {
        workId: "work-1",
        targetConnectionId: "target",
        shareId: "share-1",
        kind: "description",
        description: { type: "offer", sdp: "v=0\r\n" },
      },
      undefined
    );
    await vi.waitFor(() => expect(gate.pendingCount()).toBe(1));
    const candidate = harness.gateway.relaySignal(
      sender as never,
      {
        workId: "work-1",
        targetConnectionId: "target",
        shareId: "share-1",
        kind: "candidate",
        candidate: { candidate: "candidate:coalesced" },
      },
      undefined
    );
    expect(gate.pendingCount()).toBe(1);
    gate.releasePending();
    await vi.waitFor(() => expect(gate.pendingCount()).toBe(1));
    gate.releasePending();

    const responses = await Promise.all([description, candidate]);
    expect(responses.every((response) => response.ok)).toBe(true);
    expect(harness.revalidate).toHaveBeenCalledTimes(sessionReadsBefore + 2);
    expect(harness.service.getWorkTeam).toHaveBeenCalledTimes(teamReadsBefore + 2);
    expect(
      harness.emissions.filter((emission) => emission.event === "studio:signal")
    ).toHaveLength(2);
  });

  it("requires a new candidate authorization for another share or peer", async () => {
    const harness = createHarness();
    const sender = harness.socket("sender");
    const firstTarget = harness.socket("target-a");
    const secondTarget = harness.socket("target-b");
    await connectAndJoin(harness, sender);
    await connectAndJoin(harness, firstTarget);
    await connectAndJoin(harness, secondTarget);
    const sessionReadsBefore = harness.revalidate.mock.calls.length;
    const teamReadsBefore = harness.service.getWorkTeam.mock.calls.length;
    const sendCandidate = (targetConnectionId: string, shareId: string) =>
      harness.gateway.relaySignal(
        sender as never,
        {
          workId: "work-1",
          targetConnectionId,
          shareId,
          kind: "candidate",
          candidate: { candidate: `candidate:${targetConnectionId}:${shareId}` },
        },
        undefined
      );

    expect((await sendCandidate("target-a", "share-1")).ok).toBe(true);
    expect((await sendCandidate("target-a", "share-2")).ok).toBe(true);
    expect((await sendCandidate("target-b", "share-1")).ok).toBe(true);

    expect(harness.revalidate).toHaveBeenCalledTimes(sessionReadsBefore + 6);
    expect(harness.service.getWorkTeam).toHaveBeenCalledTimes(teamReadsBefore + 6);
  });

  it("forces a new candidate authorization after the fixed grant expires", async () => {
    const harness = createHarness();
    const sender = harness.socket("sender");
    const target = harness.socket("target");
    await connectAndJoin(harness, sender);
    await connectAndJoin(harness, target);
    const sendCandidate = () =>
      harness.gateway.relaySignal(
        sender as never,
        {
          workId: "work-1",
          targetConnectionId: "target",
          shareId: "share-1",
          kind: "candidate",
          candidate: { candidate: "candidate:ttl" },
        },
        undefined
      );
    expect((await sendCandidate()).ok).toBe(true);
    const sessionReadsAfterGrant = harness.revalidate.mock.calls.length;
    const teamReadsAfterGrant = harness.service.getWorkTeam.mock.calls.length;
    const internals = harness.gateway as unknown as {
      candidateRelayAuthorizations: Map<string, { expiresAt: number }>;
    };
    const authorization = [...internals.candidateRelayAuthorizations.values()][0];
    if (!authorization) throw new Error("missing candidate authorization");
    authorization.expiresAt = Date.now() - 1;

    expect((await sendCandidate()).ok).toBe(true);
    expect(harness.revalidate).toHaveBeenCalledTimes(sessionReadsAfterGrant + 2);
    expect(harness.service.getWorkTeam).toHaveBeenCalledTimes(teamReadsAfterGrant + 2);
  });

  it("invalidates a candidate grant on ended access and disconnect", async () => {
    const harness = createHarness();
    const sender = harness.socket("sender");
    const target = harness.socket("target");
    await connectAndJoin(harness, sender);
    await connectAndJoin(harness, target);
    const internals = harness.gateway as unknown as {
      candidateRelayAuthorizations: Map<string, unknown>;
    };
    const sendCandidate = () =>
      harness.gateway.relaySignal(
        sender as never,
        {
          workId: "work-1",
          targetConnectionId: "target",
          shareId: "share-1",
          kind: "candidate",
          candidate: { candidate: "candidate:lifecycle" },
        },
        undefined
      );

    expect((await sendCandidate()).ok).toBe(true);
    expect(internals.candidateRelayAuthorizations.size).toBe(1);
    const ended = await harness.gateway.relayScreenAccess(
      sender as never,
      {
        workId: "work-1",
        targetConnectionId: "target",
        shareId: "share-1",
        decision: "ended",
      },
      undefined
    );
    expect(ended.ok).toBe(true);
    expect(internals.candidateRelayAuthorizations.size).toBe(0);
    const sessionReadsAfterEnded = harness.revalidate.mock.calls.length;
    const teamReadsAfterEnded = harness.service.getWorkTeam.mock.calls.length;

    expect((await sendCandidate()).ok).toBe(true);
    expect(harness.revalidate).toHaveBeenCalledTimes(sessionReadsAfterEnded + 2);
    expect(harness.service.getWorkTeam).toHaveBeenCalledTimes(teamReadsAfterEnded + 2);
    expect(internals.candidateRelayAuthorizations.size).toBe(1);
    harness.gateway.handleDisconnect(target as never);
    expect(internals.candidateRelayAuthorizations.size).toBe(0);
  });

  it("converges opposite-direction forced signaling onto the latest peer generations", async () => {
    const gate = createTeamReadGate();
    const harness = createHarness(gate.lookup);
    const first = harness.socket("first");
    const second = harness.socket("second");
    await connectAndJoin(harness, first);
    await connectAndJoin(harness, second);
    gate.hold();
    const sessionReadsBefore = harness.revalidate.mock.calls.length;
    const teamReadsBefore = harness.service.getWorkTeam.mock.calls.length;

    const firstToSecond = harness.gateway.relaySignal(
      first as never,
      {
        workId: "work-1",
        targetConnectionId: "second",
        shareId: "share-a",
        kind: "description",
        description: { type: "offer", sdp: "v=0\r\n" },
      },
      undefined
    );
    const secondToFirst = harness.gateway.relaySignal(
      second as never,
      {
        workId: "work-1",
        targetConnectionId: "first",
        shareId: "share-b",
        kind: "description",
        description: { type: "offer", sdp: "v=0\r\n" },
      },
      undefined
    );
    await vi.waitFor(() => expect(gate.pendingCount()).toBe(2));
    gate.releasePending();
    await vi.waitFor(() => expect(gate.pendingCount()).toBe(2));
    gate.releasePending();

    const responses = await Promise.all([firstToSecond, secondToFirst]);
    expect(responses.every((response) => response.ok)).toBe(true);
    expect(harness.revalidate).toHaveBeenCalledTimes(sessionReadsBefore + 4);
    expect(harness.service.getWorkTeam).toHaveBeenCalledTimes(teamReadsBefore + 4);
    expect(
      harness.emissions.filter((emission) => emission.event === "studio:signal")
    ).toHaveLength(2);
  });

  it("rebases concurrent screen access and offer checks without dropping either relay", async () => {
    const gate = createTeamReadGate();
    const harness = createHarness(gate.lookup);
    const host = harness.socket("owner");
    const viewer = harness.socket("viewer");
    await connectAndJoin(harness, host);
    await connectAndJoin(harness, viewer);
    gate.hold();
    const sessionReadsBefore = harness.revalidate.mock.calls.length;
    const teamReadsBefore = harness.service.getWorkTeam.mock.calls.length;

    const access = harness.gateway.relayScreenAccess(
      host as never,
      {
        workId: "work-1",
        targetConnectionId: "viewer",
        shareId: "share-1",
        decision: "approved",
      },
      undefined
    );
    const offer = harness.gateway.relaySignal(
      host as never,
      {
        workId: "work-1",
        targetConnectionId: "viewer",
        shareId: "share-1",
        kind: "description",
        description: { type: "offer", sdp: "v=0\r\n" },
      },
      undefined
    );
    await vi.waitFor(() => expect(gate.pendingCount()).toBe(1));
    gate.releasePending();
    await vi.waitFor(() => expect(gate.pendingCount()).toBe(1));
    gate.releasePending();

    const responses = await Promise.all([access, offer]);
    expect(responses.every((response) => response.ok)).toBe(true);
    expect(harness.revalidate).toHaveBeenCalledTimes(sessionReadsBefore + 4);
    expect(harness.service.getWorkTeam).toHaveBeenCalledTimes(teamReadsBefore + 2);
    expect(harness.emissions.some((emission) => emission.event === "studio:screen:access")).toBe(true);
    expect(harness.emissions.some((emission) => emission.event === "studio:signal")).toBe(true);
  });

  it("converges an offer with presence, lock, and sweep authorization collisions", async () => {
    const gate = createTeamReadGate();
    const harness = createHarness(gate.lookup);
    const sender = harness.socket("sender");
    const target = harness.socket("target");
    await connectAndJoin(harness, sender);
    await connectAndJoin(harness, target);
    gate.hold();
    const sessionReadsBefore = harness.revalidate.mock.calls.length;
    const teamReadsBefore = harness.service.getWorkTeam.mock.calls.length;

    const offer = harness.gateway.relaySignal(
      sender as never,
      {
        workId: "work-1",
        targetConnectionId: "target",
        shareId: "share-1",
        kind: "description",
        description: { type: "offer", sdp: "v=0\r\n" },
      },
      undefined
    );
    await vi.waitFor(() => expect(gate.pendingCount()).toBe(1));
    const presence = harness.gateway.updatePresence(
      sender as never,
      { workId: "work-1", state: "active", pageId: "page-1", tool: "pen" },
      undefined
    );
    const lock = harness.gateway.requestLock(
      sender as never,
      { workId: "work-1", resourceId: "page:page-1", leaseMs: 15_000 },
      undefined
    );
    const revalidator = harness.gateway as unknown as {
      revalidateAllParticipants(): Promise<void>;
    };
    const sweep = revalidator.revalidateAllParticipants();
    await vi.waitFor(() => expect(gate.pendingCount()).toBe(3));
    gate.releasePending();
    await vi.waitFor(() => expect(gate.pendingCount()).toBe(1));
    gate.releasePending();

    const [offerResponse, presenceResponse, lockResponse] = await Promise.all([
      offer,
      presence,
      lock,
      sweep,
    ]).then(([currentOffer, currentPresence, currentLock]) => [
      currentOffer,
      currentPresence,
      currentLock,
    ]);
    expect(offerResponse.ok).toBe(true);
    expect(presenceResponse.ok).toBe(true);
    expect(lockResponse.ok).toBe(true);
    expect(harness.revalidate).toHaveBeenCalledTimes(sessionReadsBefore + 4);
    expect(harness.service.getWorkTeam).toHaveBeenCalledTimes(teamReadsBefore + 4);
    expect(harness.emissions.some((emission) => emission.event === "studio:signal")).toBe(true);
    expect(
      harness.emissions.some(
        (emission) =>
          emission.event === "studio:lock:update" &&
          (emission.payload as { action?: string }).action === "acquired"
      )
    ).toBe(true);
  });

  it("denies a fresh-cache ICE candidate when the sender session is revoked", async () => {
    let revokedUserId: string | null = null;
    const harness = createHarness(
      undefined,
      undefined,
      async (principal) =>
        principal.expiresAt > Date.now() && principal.userId !== revokedUserId
    );
    const sender = harness.socket("sender");
    const target = harness.socket("target");
    await connectAndJoin(harness, sender);
    await connectAndJoin(harness, target);
    revokedUserId = "sender";

    const response = await harness.gateway.relaySignal(
      sender as never,
      {
        workId: "work-1",
        targetConnectionId: "target",
        shareId: "share-1",
        kind: "candidate",
        candidate: { candidate: "candidate:revoked" },
      },
      undefined
    );

    expect(response).toMatchObject({ ok: false, code: "not_joined" });
    expect(sender.disconnected).toBe(true);
    expect(
      harness.emissions.some((emission) => emission.event === "studio:signal")
    ).toBe(false);
  });

  it("does not relay WebRTC signaling after the sender session is revoked", async () => {
    let revokedUserId: string | null = null;
    const harness = createHarness(
      undefined,
      undefined,
      async (principal) =>
        principal.expiresAt > Date.now() && principal.userId !== revokedUserId
    );
    const sender = harness.socket("sender");
    const target = harness.socket("target");
    await connectAndJoin(harness, sender);
    await connectAndJoin(harness, target);
    revokedUserId = "sender";

    const response = await harness.gateway.relaySignal(
      sender as never,
      {
        workId: "work-1",
        targetConnectionId: "target",
        shareId: "share-1",
        kind: "bye",
      },
      undefined
    );

    expect(response).toMatchObject({ ok: false, code: "not_joined" });
    expect(sender.disconnected).toBe(true);
    expect(
      harness.emissions.some((emission) => emission.event === "studio:signal")
    ).toBe(false);
  });

  it("does not relay WebRTC signaling to a target with an expired session", async () => {
    const harness = createHarness();
    const sender = harness.socket("sender");
    const target = harness.socket("target");
    await connectAndJoin(harness, sender);
    await connectAndJoin(harness, target);
    if (!target.data.authPrincipal) throw new Error("missing target auth principal");
    target.data.authPrincipal.expiresAt = Date.now() - 1;

    const response = await harness.gateway.relaySignal(
      sender as never,
      {
        workId: "work-1",
        targetConnectionId: "target",
        shareId: "share-1",
        kind: "candidate",
        candidate: { candidate: "candidate:1" },
      },
      undefined
    );

    expect(response).toMatchObject({ ok: false, code: "peer_unavailable" });
    expect(target.disconnected).toBe(true);
    expect(
      harness.emissions.some((emission) => emission.event === "studio:signal")
    ).toBe(false);
  });

  it("denies a fresh-cache ICE candidate after the target work ACL is revoked", async () => {
    let revokedUserId: string | null = null;
    const harness = createHarness(async (userId, workId) =>
      teamSnapshot(userId, workId, { view: userId !== revokedUserId })
    );
    const sender = harness.socket("sender");
    const target = harness.socket("target");
    await connectAndJoin(harness, sender);
    await connectAndJoin(harness, target);
    revokedUserId = "target";

    const response = await harness.gateway.relaySignal(
      sender as never,
      {
        workId: "work-1",
        targetConnectionId: "target",
        shareId: "share-1",
        kind: "candidate",
        candidate: { candidate: "candidate:revoked-target" },
      },
      undefined
    );

    expect(response).toMatchObject({ ok: false, code: "peer_unavailable" });
    expect(target.disconnected).toBe(true);
    expect(target.data.authUserId).toBeUndefined();
    expect(
      harness.emissions.some((emission) => emission.event === "studio:signal")
    ).toBe(false);
  });

  it("rejects self-targeted and cross-work WebRTC signaling", async () => {
    const harness = createHarness();
    const sender = harness.socket("sender");
    const otherWork = harness.socket("other");
    await connectAndJoin(harness, sender, "work-1");
    await connectAndJoin(harness, otherWork, "work-2");

    await expect(
      harness.gateway.relaySignal(
        sender as never,
        {
          workId: "work-1",
          targetConnectionId: "sender",
          shareId: "share-1",
          kind: "bye",
        },
        undefined
      )
    ).resolves.toMatchObject({ ok: false, code: "peer_unavailable" });
    await expect(
      harness.gateway.relaySignal(
        sender as never,
        {
          workId: "work-1",
          targetConnectionId: "other",
          shareId: "share-1",
          kind: "bye",
        },
        undefined
      )
    ).resolves.toMatchObject({ ok: false, code: "peer_unavailable" });
    expect(
      harness.emissions.some((emission) => emission.event === "studio:signal")
    ).toBe(false);
  });

  it("allows a joined viewer to fetch an exact, chunked CRDT sync response", async () => {
    const harness = createHarness(async (userId, workId) =>
      teamSnapshot(userId, workId, { role: "viewer", edit: false })
    );
    const viewer = harness.socket("viewer");
    await connectAndJoin(harness, viewer);

    const response = await harness.gateway.syncCrdtDocument(
      viewer as never,
      {
        protocolVersion: 1,
        workId: "work-1",
        requestId: "request-1",
        stateVector: crdtStateVector(),
      },
      undefined
    );

    expect(response).toEqual({
      ok: true,
      data: {
        protocolVersion: 1,
        workId: "work-1",
        requestId: "request-1",
        transferId: expect.any(String),
        chunks: ["AA=="],
        chunkCount: 1,
        totalBytes: 1,
        serverStateVector: "AA==",
        serverSequence: "0",
      },
    });
    expect(harness.crdtService.sync).toHaveBeenCalledWith(
      "work-1",
      crdtStateVector()
    );
  });

  it("persists, ACKs, then broadcasts one canonical remote CRDT update", async () => {
    const harness = createHarness();
    const editor = harness.socket("editor");
    await connectAndJoin(harness, editor);
    const order: string[] = [];
    const originalTo = editor.to;
    editor.to = (room) => {
      const target = originalTo(room);
      return {
        emit(event, payload) {
          if (event === "studio:crdt:update") order.push("broadcast");
          target.emit(event, payload);
        },
      };
    };
    const request = crdtUpdateRequest(21);

    const response = await harness.gateway.applyCrdtUpdate(
      editor as never,
      request,
      () => order.push("ack")
    );

    expect(order).toEqual(["ack", "broadcast"]);
    expect(harness.crdtService.applyUpdate).toHaveBeenCalledWith({
      workId: "work-1",
      updateId: request.updateId,
      actorUserId: "editor",
      data: request.update,
    });
    expect(response).toEqual({
      ok: true,
      data: {
        protocolVersion: 1,
        workId: "work-1",
        updateId: request.updateId,
        serverSequence: "1",
        serverStateVector: "AA==",
        duplicate: false,
      },
    });
    expect(harness.emissions).toContainEqual({
      target: "from:editor:studio-live:work-1",
      event: "studio:crdt:update",
      payload: {
        protocolVersion: 1,
        workId: "work-1",
        updateId: request.updateId,
        serverSequence: "1",
        update: request.update,
      },
    });
  });

  it("denies viewer writes and never broadcasts an exact-retry duplicate", async () => {
    const viewerHarness = createHarness(async (userId, workId) =>
      teamSnapshot(userId, workId, { role: "viewer", edit: false })
    );
    const viewer = viewerHarness.socket("viewer");
    await connectAndJoin(viewerHarness, viewer);
    await expect(
      viewerHarness.gateway.applyCrdtUpdate(
        viewer as never,
        crdtUpdateRequest(22),
        undefined
      )
    ).resolves.toMatchObject({ ok: false, code: "forbidden" });
    expect(viewerHarness.crdtService.applyUpdate).not.toHaveBeenCalled();

    const editorHarness = createHarness();
    const editor = editorHarness.socket("editor");
    await connectAndJoin(editorHarness, editor);
    const request = crdtUpdateRequest(23);
    editorHarness.crdtService.applyUpdate.mockResolvedValueOnce({
      duplicate: true,
      updateId: request.updateId,
      update: request.update,
      serverStateVector: "AA==",
      serverSequence: "7",
    });
    await expect(
      editorHarness.gateway.applyCrdtUpdate(editor as never, request, undefined)
    ).resolves.toMatchObject({ ok: true, data: { duplicate: true, serverSequence: "7" } });
    expect(
      editorHarness.emissions.some((emission) => emission.event === "studio:crdt:update")
    ).toBe(false);
  });

  it("ACKs and broadcasts a committed update even when ACL changes after admission", async () => {
    let canEdit = true;
    const harness = createHarness(async (userId, workId) =>
      teamSnapshot(userId, workId, {
        role: canEdit ? "editor" : "viewer",
        edit: canEdit,
      })
    );
    const editor = harness.socket("editor");
    await connectAndJoin(harness, editor);
    const request = crdtUpdateRequest(24);
    let releasePersist: (() => void) | undefined;
    harness.crdtService.applyUpdate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releasePersist = () =>
            resolve({
              duplicate: false,
              updateId: request.updateId,
              update: request.update,
              serverStateVector: "AA==",
              serverSequence: "8",
            });
        })
    );

    const pending = harness.gateway.applyCrdtUpdate(editor as never, request, undefined);
    await vi.waitFor(() => expect(releasePersist).toBeTypeOf("function"));
    canEdit = false;
    releasePersist?.();

    await expect(pending).resolves.toMatchObject({
      ok: true,
      data: {
        updateId: request.updateId,
        serverSequence: "8",
        duplicate: false,
      },
    });
    expect(harness.emissions).toContainEqual({
      target: "from:editor:studio-live:work-1",
      event: "studio:crdt:update",
      payload: {
        protocolVersion: 1,
        workId: "work-1",
        updateId: request.updateId,
        serverSequence: "8",
        update: request.update,
      },
    });
  });

  it("admits at least forty 30-50 ms batched CRDT ops in one short burst", async () => {
    const harness = createHarness();
    const editor = harness.socket("editor");
    await connectAndJoin(harness, editor);

    for (let sequence = 1; sequence <= 40; sequence += 1) {
      const response = await harness.gateway.applyCrdtUpdate(
        editor as never,
        crdtUpdateRequest(100 + sequence),
        undefined
      );
      expect(response.ok).toBe(true);
    }
    expect(harness.crdtService.applyUpdate).toHaveBeenCalledTimes(40);
  });

  it("shares the CRDT update burst across parallel sockets for one authenticated user and work", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T00:00:00.000Z"));
    try {
      const harness = createHarness();
      const firstTab = harness.socket("editor-tab-a", "valid:shared-editor");
      const secondTab = harness.socket("editor-tab-b", "valid:shared-editor");
      await connectAndJoin(harness, firstTab);
      await connectAndJoin(harness, secondTab);

      const accepted = await Promise.all(
        Array.from({ length: 120 }, (_, index) =>
          harness.gateway.applyCrdtUpdate(
            (index % 2 === 0 ? firstTab : secondTab) as never,
            crdtUpdateRequest(1_000 + index),
            undefined
          )
        )
      );

      expect(accepted.every((response) => response.ok)).toBe(true);
      const teamCallsBeforeRejection = harness.service.getWorkTeam.mock.calls.length;
      const sessionCallsBeforeRejection = harness.revalidate.mock.calls.length;
      await expect(
        harness.gateway.applyCrdtUpdate(
          secondTab as never,
          crdtUpdateRequest(1_121),
          undefined
        )
      ).resolves.toMatchObject({ ok: false, code: "rate_limited" });
      expect(harness.crdtService.applyUpdate).toHaveBeenCalledTimes(120);
      expect(harness.service.getWorkTeam).toHaveBeenCalledTimes(
        teamCallsBeforeRejection
      );
      expect(harness.revalidate).toHaveBeenCalledTimes(
        sessionCallsBeforeRejection
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not reset the shared CRDT sync quota when the same user reconnects", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T00:00:00.000Z"));
    try {
      const harness = createHarness();
      const firstConnection = harness.socket("sync-before-reconnect", "valid:sync-user");
      await connectAndJoin(harness, firstConnection);

      for (let request = 1; request <= 30; request += 1) {
        await expect(
          harness.gateway.syncCrdtDocument(
            firstConnection as never,
            {
              protocolVersion: 1,
              workId: "work-1",
              requestId: `sync-before-${request}`,
              stateVector: crdtStateVector(),
            },
            undefined
          )
        ).resolves.toMatchObject({ ok: true });
      }

      harness.gateway.handleDisconnect(firstConnection as never);
      const reconnected = harness.socket("sync-after-reconnect", "valid:sync-user");
      await connectAndJoin(harness, reconnected);
      const teamCallsBeforeRejection = harness.service.getWorkTeam.mock.calls.length;
      const sessionCallsBeforeRejection = harness.revalidate.mock.calls.length;
      await expect(
        harness.gateway.syncCrdtDocument(
          reconnected as never,
          {
            protocolVersion: 1,
            workId: "work-1",
            requestId: "sync-after-reconnect",
            stateVector: crdtStateVector(),
          },
          undefined
        )
      ).resolves.toMatchObject({ ok: false, code: "rate_limited" });
      expect(harness.crdtService.sync).toHaveBeenCalledTimes(30);
      expect(harness.service.getWorkTeam).toHaveBeenCalledTimes(
        teamCallsBeforeRejection
      );
      expect(harness.revalidate).toHaveBeenCalledTimes(
        sessionCallsBeforeRejection
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not charge CRDT quota or revalidate ACL for invalid and unjoined callers", async () => {
    const harness = createHarness();
    const joined = harness.socket("joined-quota-owner", "valid:shared-quota-user");
    await connectAndJoin(harness, joined);
    const unjoined = harness.socket("unjoined-quota-peer", "valid:shared-quota-user");
    await harness.gateway.handleConnection(unjoined as never);
    const teamCallsBeforeRequests = harness.service.getWorkTeam.mock.calls.length;
    const sessionCallsBeforeRequests = harness.revalidate.mock.calls.length;
    const internals = harness.gateway as unknown as {
      crdtSyncBuckets: Map<string, unknown>;
      crdtTokenBuckets: Map<string, unknown>;
    };

    await expect(
      harness.gateway.applyCrdtUpdate(
        unjoined as never,
        { ...crdtUpdateRequest(1_122), update: "not-base64" },
        undefined
      )
    ).resolves.toMatchObject({ ok: false, code: "invalid_payload" });
    await expect(
      harness.gateway.applyCrdtUpdate(
        unjoined as never,
        crdtUpdateRequest(1_123),
        undefined
      )
    ).resolves.toMatchObject({ ok: false, code: "not_joined" });
    await expect(
      harness.gateway.syncCrdtDocument(
        unjoined as never,
        {
          protocolVersion: 1,
          workId: "work-1",
          requestId: "unjoined-sync",
          stateVector: crdtStateVector(),
        },
        undefined
      )
    ).resolves.toMatchObject({ ok: false, code: "not_joined" });

    expect(internals.crdtSyncBuckets.size).toBe(0);
    expect(internals.crdtTokenBuckets.size).toBe(0);
    expect(harness.service.getWorkTeam).toHaveBeenCalledTimes(
      teamCallsBeforeRequests
    );
    expect(harness.revalidate).toHaveBeenCalledTimes(
      sessionCallsBeforeRequests
    );
  });

  it("purges stale CRDT quota buckets and keeps each in-process quota map bounded", async () => {
    const harness = createHarness();
    const editor = harness.socket("quota-cap-editor", "valid:quota-cap-user");
    await connectAndJoin(harness, editor);
    const now = Date.now();
    const internals = harness.gateway as unknown as {
      crdtQuotaLastCleanupAt: number;
      crdtSyncBuckets: Map<
        string,
        { count: number; resetsAt: number; updatedAt: number }
      >;
      crdtTokenBuckets: Map<
        string,
        { operationTokens: number; byteTokens: number; updatedAt: number }
      >;
    };
    for (let index = 0; index < 4_096; index += 1) {
      internals.crdtSyncBuckets.set(`active-${index}`, {
        count: 1,
        resetsAt: now + 60_000,
        updatedAt: now + index,
      });
    }

    await expect(
      harness.gateway.syncCrdtDocument(
        editor as never,
        {
          protocolVersion: 1,
          workId: "work-1",
          requestId: "bounded-quota-map",
          stateVector: crdtStateVector(),
        },
        undefined
      )
    ).resolves.toMatchObject({ ok: false, code: "rate_limited" });
    expect(internals.crdtSyncBuckets.size).toBe(4_096);

    internals.crdtSyncBuckets.set("active-0", {
      count: 30,
      resetsAt: now - 1,
      updatedAt: now - 1,
    });
    internals.crdtTokenBuckets.set("idle-update", {
      operationTokens: 0,
      byteTokens: 0,
      updatedAt: now - 11 * 60_000,
    });
    internals.crdtQuotaLastCleanupAt = 0;

    await expect(
      harness.gateway.syncCrdtDocument(
        editor as never,
        {
          protocolVersion: 1,
          workId: "work-1",
          requestId: "purge-stale-quota",
          stateVector: crdtStateVector(),
        },
        undefined
      )
    ).resolves.toMatchObject({ ok: true });
    expect(internals.crdtSyncBuckets.has("active-0")).toBe(false);
    expect(internals.crdtTokenBuckets.has("idle-update")).toBe(false);
    expect(internals.crdtSyncBuckets.size).toBeLessThanOrEqual(4_096);
    expect(internals.crdtTokenBuckets.size).toBeLessThanOrEqual(4_096);
  });

  it("releases presence and leases when a socket disconnects", async () => {
    const harness = createHarness();
    const socket = harness.socket("editor");
    await connectAndJoin(harness, socket);
    const acquired = await harness.gateway.requestLock(
      socket as never,
      { workId: "work-1", resourceId: "element:1", leaseMs: 15_000 },
      undefined
    );
    expect(acquired.ok).toBe(true);

    harness.gateway.handleDisconnect(socket as never);

    expect(harness.emissions).toContainEqual({
      target: "studio-live:work-1",
      event: "studio:presence:leave",
      payload: { connectionId: "editor", reason: "disconnect" },
    });
    expect(harness.emissions).toContainEqual({
      target: "studio-live:work-1",
      event: "studio:lock:update",
      payload: expect.objectContaining({ action: "released", resourceId: "element:1" }),
    });
  });
});
