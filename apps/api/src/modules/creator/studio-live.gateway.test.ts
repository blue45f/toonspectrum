import { describe, expect, it, vi } from "vitest";

import {
  StudioLiveCursorSchema,
  StudioLiveGateway,
  StudioLiveJoinSchema,
  StudioLiveSignalSchema,
  isStudioLiveOriginAllowed,
  studioLiveAllowRequest,
} from "./studio-live.gateway";

import type { CreatorService } from "./creator.service";
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
  const authenticate = vi.fn(authenticateSession);
  const revalidate = vi.fn(revalidateSession);
  const gateway = new StudioLiveGateway(
    service as unknown as CreatorService,
    authenticate,
    revalidate
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
        kind: "description",
        description: { type: "offer", sdp: "s".repeat(262_145) },
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
        kind: "description",
        description: { type: "offer", sdp: "v=0\r\n" },
      }),
    });

    const unavailable = await harness.gateway.relaySignal(
      sender as never,
      { workId: "work-1", targetConnectionId: "missing", kind: "bye" },
      undefined
    );
    expect(unavailable).toMatchObject({ ok: false, code: "peer_unavailable" });
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
