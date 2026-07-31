import { DurableObject } from "cloudflare:workers";

import {
  REALTIME_CLIENT_PING_FRAME,
  REALTIME_MAX_OUTBOUND_FRAME_BYTES,
  REALTIME_MAX_REPLAY_EVENTS_PER_FRAME,
  REALTIME_PROTOCOL_VERSION,
  REALTIME_SERVER_PONG_FRAME,
  REALTIME_WEBSOCKET_PROTOCOL,
  areRealtimePayloadsEquivalent,
  isRealtimeChannel,
  isRealtimeId,
  parseRealtimeClientMessage,
  serializeRealtimeServerMessage,
  utf8ByteLength,
  type ClientPublishMessage,
  type ClientResumeMessage,
  type PresenceCursorPayload,
  type PresenceUpdatePayload,
  type RealtimeChannel,
  type RealtimeProtocolErrorCode,
  type RealtimeServerMessage,
  type ScreenSignalingPayload,
  type ServerPresenceSnapshotMessage,
  type ServerErrorMessage,
  type ServerReplayMessage,
} from "./protocol";
import { createPublishReceiptFingerprints } from "./receipt-fingerprint";
import {
  canBufferFrame,
  evaluatePublishTiming,
  evaluateRateBudget,
  isClientSequenceAccepted,
  planReplay,
  resolveHibernatableBufferedAmount,
  resolveRealtimeRoomLimits,
  selectNextAlarmAt,
  type RealtimeRoomLimits,
} from "./room-core";
import {
  RealtimeReceiptBudgetExceededError,
  RealtimeRoomStore,
  isScreenSignalTeardown,
  type ScreenSignalPublication,
  type StoredRoomEvent,
} from "./room-store";
import {
  createWebSocketAutoResponsePair,
  createWebSocketPair,
  type DurableObjectStateLike,
  type HibernatableWebSocket,
  type RealtimeWorkerEnv,
} from "./runtime-types";
import {
  hasForbiddenCredentialQuery,
  isAllowedRealtimeOrigin,
  isWebSocketUpgrade,
  parseRealtimeRoomPath,
  resolveAllowedOrigins,
} from "./security";
import {
  extractRealtimeTicketFromSubprotocols,
  verifyRealtimeTicket,
  type RealtimeTicketClaims,
} from "./ticket";

const CONNECTION_ATTACHMENT_VERSION =
  "toonspectrum.realtime-connection.v2" as const;
const MAX_PROTOCOL_VIOLATIONS = 3;

type ResumeFrontiers = Readonly<Record<RealtimeChannel, number | null>>;

interface ConnectionAttachment {
  readonly version: typeof CONNECTION_ATTACHMENT_VERSION;
  readonly workId: string;
  readonly roomId: string;
  readonly connectionId: string;
  readonly actorId: string;
  readonly clientId: string;
  readonly scopes: readonly RealtimeChannel[];
  readonly sessionExpiresAtMs: number;
  readonly lastClientSequence: number;
  readonly protocolViolations: number;
  readonly resumeWindowStartedAtMs: number;
  readonly resumeRequestCount: number;
  readonly resumeEgressBytes: number;
  readonly resumeFrontiers: ResumeFrontiers;
  readonly completedResumeChannels: readonly RealtimeChannel[];
}

function jsonResponse(
  status: number,
  code: string,
): Response {
  return new Response(
    JSON.stringify({
      version: REALTIME_PROTOCOL_VERSION,
      ok: false,
      code,
    }),
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isConnectionAttachment(
  value: unknown,
): value is ConnectionAttachment {
  if (!isRecord(value)) {
    return false;
  }
  const expectedKeys = new Set([
    "version",
    "workId",
    "roomId",
    "connectionId",
    "actorId",
    "clientId",
    "scopes",
    "sessionExpiresAtMs",
    "lastClientSequence",
    "protocolViolations",
    "resumeWindowStartedAtMs",
    "resumeRequestCount",
    "resumeEgressBytes",
    "resumeFrontiers",
    "completedResumeChannels",
  ]);
  return (
    Object.keys(value).length === expectedKeys.size &&
    Object.keys(value).every((key) => expectedKeys.has(key)) &&
    value.version === CONNECTION_ATTACHMENT_VERSION &&
    isRealtimeId(value.workId) &&
    isRealtimeId(value.roomId) &&
    isRealtimeId(value.connectionId) &&
    isRealtimeId(value.actorId) &&
    isRealtimeId(value.clientId) &&
    Array.isArray(value.scopes) &&
    value.scopes.length >= 1 &&
    value.scopes.length <= 3 &&
    value.scopes.every(isRealtimeChannel) &&
    new Set(value.scopes).size === value.scopes.length &&
    typeof value.sessionExpiresAtMs === "number" &&
    Number.isSafeInteger(value.sessionExpiresAtMs) &&
    value.sessionExpiresAtMs > 0 &&
    typeof value.lastClientSequence === "number" &&
    Number.isSafeInteger(value.lastClientSequence) &&
    value.lastClientSequence >= 0 &&
    typeof value.protocolViolations === "number" &&
    Number.isSafeInteger(value.protocolViolations) &&
    value.protocolViolations >= 0 &&
    value.protocolViolations <= MAX_PROTOCOL_VIOLATIONS &&
    typeof value.resumeWindowStartedAtMs === "number" &&
    Number.isSafeInteger(value.resumeWindowStartedAtMs) &&
    value.resumeWindowStartedAtMs >= 0 &&
    typeof value.resumeRequestCount === "number" &&
    Number.isSafeInteger(value.resumeRequestCount) &&
    value.resumeRequestCount >= 0 &&
    typeof value.resumeEgressBytes === "number" &&
    Number.isSafeInteger(value.resumeEgressBytes) &&
    value.resumeEgressBytes >= 0 &&
    isRecord(value.resumeFrontiers) &&
    Object.keys(value.resumeFrontiers).length === 3 &&
    Object.keys(value.resumeFrontiers).every(isRealtimeChannel) &&
    Object.values(value.resumeFrontiers).every(
      (frontier) =>
        frontier === null ||
        (typeof frontier === "number" &&
          Number.isSafeInteger(frontier) &&
          frontier >= 0),
    ) &&
    Array.isArray(value.completedResumeChannels) &&
    value.completedResumeChannels.length <= 3 &&
    value.completedResumeChannels.every(isRealtimeChannel) &&
    new Set(value.completedResumeChannels).size ===
      value.completedResumeChannels.length
  );
}

function toConnectionAttachment(
  claims: RealtimeTicketClaims,
  connectionId: string,
  nowMs: number,
): ConnectionAttachment {
  return {
    version: CONNECTION_ATTACHMENT_VERSION,
    workId: claims.workId,
    roomId: claims.roomId,
    connectionId,
    actorId: claims.subject,
    clientId: claims.clientId,
    scopes: claims.scopes,
    sessionExpiresAtMs: claims.sessionExpiresAtMs,
    lastClientSequence: 0,
    protocolViolations: 0,
    resumeWindowStartedAtMs: nowMs,
    resumeRequestCount: 0,
    resumeEgressBytes: 0,
    resumeFrontiers: {
      presence: null,
      comments: null,
      "screen-signaling": null,
    },
    completedResumeChannels: [],
  };
}

function withAttachmentUpdate(
  attachment: ConnectionAttachment,
  update: Partial<
    Pick<
      ConnectionAttachment,
      | "lastClientSequence"
      | "protocolViolations"
      | "resumeWindowStartedAtMs"
      | "resumeRequestCount"
      | "resumeEgressBytes"
      | "resumeFrontiers"
      | "completedResumeChannels"
    >
  >,
): ConnectionAttachment {
  return {
    ...attachment,
    ...update,
  };
}

function closeSocket(
  webSocket: HibernatableWebSocket,
  code: number,
  reason: string,
): void {
  try {
    webSocket.close(code, reason);
  } catch {
    // The socket may already be closing. Closing is deliberately idempotent.
  }
}

export class RealtimeRoom extends DurableObject<RealtimeWorkerEnv> {
  private readonly store: RealtimeRoomStore;
  private readonly limits: RealtimeRoomLimits;
  private readonly allowedOrigins: ReadonlySet<string>;
  private readonly ready: Promise<void>;

  constructor(
    private readonly roomState: DurableObjectStateLike,
    private readonly runtimeEnv: RealtimeWorkerEnv,
  ) {
    super(roomState, runtimeEnv);
    this.store = new RealtimeRoomStore(roomState.storage);
    this.limits = resolveRealtimeRoomLimits(runtimeEnv);
    this.allowedOrigins = resolveAllowedOrigins(
      runtimeEnv.REALTIME_ALLOWED_ORIGINS,
    );
    this.roomState.setWebSocketAutoResponse(
      createWebSocketAutoResponsePair(
        REALTIME_CLIENT_PING_FRAME,
        REALTIME_SERVER_PONG_FRAME,
      ),
    );
    this.ready = this.roomState.blockConcurrencyWhile(async () => {
      this.store.initialize();
      const nowMs = Date.now();
      const liveSockets = this.reconcilePersistedConnections(nowMs);
      for (const stored of this.store.cleanupExpiredSharesWithEvents(
        nowMs,
        nowMs + this.limits.eventRetentionMs,
      )) {
        this.broadcastEvent(stored, liveSockets);
      }
      await this.scheduleNextAlarm(nowMs);
    });
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);
    if (
      url.search !== "" ||
      hasForbiddenCredentialQuery(url) ||
      !isWebSocketUpgrade(request)
    ) {
      return jsonResponse(400, "invalid-websocket-request");
    }
    const scope = parseRealtimeRoomPath(url.pathname);
    const origin = request.headers.get("Origin");
    if (
      scope === null ||
      !isAllowedRealtimeOrigin(origin, this.allowedOrigins)
    ) {
      return jsonResponse(403, "origin-or-room-denied");
    }

    const extracted = extractRealtimeTicketFromSubprotocols(
      request.headers.get("Sec-WebSocket-Protocol"),
    );
    if (!extracted.ok) {
      return jsonResponse(401, "ticket-required");
    }
    const verified = await verifyRealtimeTicket(
      extracted.ticket,
      this.runtimeEnv.REALTIME_TICKET_SECRET,
      {
        issuer: this.runtimeEnv.REALTIME_TICKET_ISSUER,
        audience: this.runtimeEnv.REALTIME_TICKET_AUDIENCE,
        workId: scope.workId,
        roomId: scope.roomId,
        origin,
        nowMs: Date.now(),
      },
    );
    if (!verified.ok) {
      return jsonResponse(401, "ticket-rejected");
    }
    if (!this.store.bindScope(scope.workId, scope.roomId)) {
      return jsonResponse(409, "room-binding-conflict");
    }
    const nowMs = Date.now();
    const sockets = this.roomState.getWebSockets();
    if (sockets.length >= this.limits.maxConnectionsPerRoom) {
      return jsonResponse(503, "room-capacity-reached");
    }
    const actorConnections = sockets.reduce((count, socket) => {
      const attachment = socket.deserializeAttachment();
      return (
        count +
        (isConnectionAttachment(attachment) &&
        attachment.actorId === verified.claims.subject
          ? 1
          : 0)
      );
    }, 0);
    if (actorConnections >= this.limits.maxConnectionsPerActor) {
      return jsonResponse(429, "actor-capacity-reached");
    }
    const activeClientActor = this.store.resolveActiveClientActor(
      verified.claims.clientId,
      nowMs,
    );
    if (
      activeClientActor !== null &&
      activeClientActor !== verified.claims.subject
    ) {
      return jsonResponse(409, "client-identity-conflict");
    }
    if (
      !this.store.consumeTicketNonce(
        verified.claims.nonce,
        verified.claims.expiresAtMs,
        nowMs,
      )
    ) {
      return jsonResponse(401, "ticket-replayed");
    }

    const [client, server] = createWebSocketPair();
    const serverSocket = server as HibernatableWebSocket;
    const connectionId = crypto.randomUUID();
    if (
      !this.store.registerConnection({
        connectionId,
        actorId: verified.claims.subject,
        clientId: verified.claims.clientId,
        sessionExpiresAtMs: verified.claims.sessionExpiresAtMs,
        nowMs,
      })
    ) {
      return jsonResponse(409, "client-identity-conflict");
    }
    this.roomState.acceptWebSocket(server, [
      `work:${scope.workId}`,
      `room:${scope.roomId}`,
    ]);
    serverSocket.serializeAttachment(
      toConnectionAttachment(verified.claims, connectionId, nowMs),
    );

    const channelStates = this.store.getAllSequenceStates();
    this.sendMessage(serverSocket, {
      version: REALTIME_PROTOCOL_VERSION,
      type: "welcome",
      workId: scope.workId,
      roomId: scope.roomId,
      connectionId,
      actorId: verified.claims.subject,
      clientId: verified.claims.clientId,
      scopes: verified.claims.scopes,
      channelStates,
      sessionExpiresAtMs: verified.claims.sessionExpiresAtMs,
    });
    if (verified.claims.scopes.includes("presence")) {
      this.sendPresenceSnapshot(
        serverSocket,
        channelStates.presence.currentSequence,
        nowMs,
      );
    }
    await this.scheduleNextAlarm(nowMs);

    return new Response(null, {
      status: 101,
      headers: {
        "Cache-Control": "no-store",
        "Sec-WebSocket-Protocol": REALTIME_WEBSOCKET_PROTOCOL,
      },
      webSocket: client,
    } as ResponseInit & { readonly webSocket: WebSocket });
  }

  async webSocketMessage(
    webSocket: HibernatableWebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    await this.ready;
    const attachment = this.readAttachment(webSocket);
    if (attachment === null) {
      return;
    }
    const nowMs = Date.now();
    if (attachment.sessionExpiresAtMs <= nowMs) {
      this.sendError(webSocket, "session-expired", false);
      this.cleanupConnection(attachment, nowMs);
      closeSocket(webSocket, 4003, "session-expired");
      return;
    }
    if (typeof message !== "string") {
      this.sendError(webSocket, "binary-not-supported", false);
      closeSocket(webSocket, 1003, "binary-not-supported");
      return;
    }
    if (message === REALTIME_CLIENT_PING_FRAME) {
      this.sendRaw(webSocket, REALTIME_SERVER_PONG_FRAME);
      return;
    }

    const parsed = parseRealtimeClientMessage(message);
    if (!parsed.ok) {
      this.recordProtocolViolation(webSocket, attachment, parsed.code);
      return;
    }
    if (parsed.value.type === "ping") {
      this.sendRaw(webSocket, REALTIME_SERVER_PONG_FRAME);
      return;
    }
    if (parsed.value.type === "resume") {
      this.handleResume(webSocket, attachment, parsed.value, nowMs);
      return;
    }
    const publishMessage = parsed.value;
    // Web Crypto yields the event loop while deriving fixed-width receipt
    // fingerprints. Keep that await and the following synchronous SQLite
    // mutation under one input gate so publish order cannot interleave.
    const publishOutcome =
      await this.roomState.blockConcurrencyWhile(async () => {
        try {
          await this.handlePublish(
            webSocket,
            attachment,
            publishMessage,
            nowMs,
            utf8ByteLength(message),
          );
          return { ok: true } as const;
        } catch (error) {
          // A blockConcurrencyWhile callback must not reject because the
          // runtime resets the Durable Object when it does.
          return { ok: false, error } as const;
        }
      });
    if (!publishOutcome.ok) {
      throw publishOutcome.error;
    }
    await this.scheduleNextAlarm(nowMs);
  }

  async webSocketClose(
    webSocket: HibernatableWebSocket,
    code: number,
    _reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    await this.ready;
    const attachment = webSocket.deserializeAttachment();
    const nowMs = Date.now();
    try {
      if (isConnectionAttachment(attachment)) {
        this.cleanupConnection(attachment, nowMs);
      }
    } finally {
      closeSocket(webSocket, code, "");
      await this.scheduleNextAlarm(nowMs);
    }
  }

  async webSocketError(
    webSocket: HibernatableWebSocket,
    _error: unknown,
  ): Promise<void> {
    await this.ready;
    const attachment = webSocket.deserializeAttachment();
    const nowMs = Date.now();
    try {
      if (isConnectionAttachment(attachment)) {
        this.cleanupConnection(attachment, nowMs);
      }
    } finally {
      closeSocket(webSocket, 1011, "realtime-error");
      await this.scheduleNextAlarm(nowMs);
    }
  }

  async alarm(): Promise<void> {
    await this.ready;
    const nowMs = Date.now();
    try {
      const liveSockets = this.reconcilePersistedConnections(nowMs);
      for (const stored of this.store.cleanupExpiredSharesWithEvents(
        nowMs,
        nowMs + this.limits.eventRetentionMs,
      )) {
        this.broadcastEvent(stored, liveSockets);
      }
      this.store.prune(nowMs, this.limits.maxReplayEvents);
    } finally {
      try {
        await this.scheduleNextAlarm(nowMs);
      } catch {
        // Keep cleanup recoverable even after Cloudflare's automatic alarm
        // retries are exhausted. No request or payload data is logged.
        await this.roomState.storage.setAlarm(
          nowMs + this.limits.cleanupIntervalMs,
        );
      }
    }
  }

  private cleanupConnection(
    attachment: ConnectionAttachment,
    nowMs: number,
  ): void {
    for (const stored of this.store.cleanupConnectionWithEvents(
      attachment.connectionId,
      nowMs,
      nowMs + this.limits.eventRetentionMs,
      {
        actorId: attachment.actorId,
        clientId: attachment.clientId,
      },
    )) {
      this.broadcastEvent(stored);
    }
  }

  private reconcilePersistedConnections(
    nowMs: number,
  ): HibernatableWebSocket[] {
    const liveConnectionIds = new Set<string>();
    const liveSockets: HibernatableWebSocket[] = [];
    for (const socket of this.roomState.getWebSockets()) {
      const attachment = socket.deserializeAttachment();
      const isValid =
        socket.readyState === WebSocket.OPEN &&
        isConnectionAttachment(attachment) &&
        attachment.sessionExpiresAtMs > nowMs &&
        !liveConnectionIds.has(attachment.connectionId) &&
        this.store.bindScope(attachment.workId, attachment.roomId) &&
        this.store.matchesRegisteredConnection({
          connectionId: attachment.connectionId,
          actorId: attachment.actorId,
          clientId: attachment.clientId,
          sessionExpiresAtMs: attachment.sessionExpiresAtMs,
        });
      if (!isValid) {
        closeSocket(socket, 4003, "invalid-connection-state");
        continue;
      }
      liveConnectionIds.add(attachment.connectionId);
      liveSockets.push(socket);
    }
    for (const stored of this.store.reconcileRegisteredConnections(
      liveConnectionIds,
      nowMs,
      nowMs + this.limits.eventRetentionMs,
    )) {
      this.broadcastEvent(stored, liveSockets);
    }
    return liveSockets;
  }

  private readAttachment(
    webSocket: HibernatableWebSocket,
  ): ConnectionAttachment | null {
    const attachment = webSocket.deserializeAttachment();
    if (!isConnectionAttachment(attachment)) {
      closeSocket(webSocket, 1011, "invalid-connection-state");
      return null;
    }
    return attachment;
  }

  private recordProtocolViolation(
    webSocket: HibernatableWebSocket,
    attachment: ConnectionAttachment,
    code: RealtimeProtocolErrorCode,
  ): void {
    const protocolViolations = attachment.protocolViolations + 1;
    webSocket.serializeAttachment(
      withAttachmentUpdate(attachment, { protocolViolations }),
    );
    this.sendError(webSocket, code, false);
    if (protocolViolations >= MAX_PROTOCOL_VIOLATIONS) {
      closeSocket(webSocket, 1008, "protocol-violation");
    }
  }

  private async handlePublish(
    webSocket: HibernatableWebSocket,
    attachment: ConnectionAttachment,
    message: ClientPublishMessage,
    nowMs: number,
    frameBytes: number,
  ): Promise<void> {
    if (!attachment.scopes.includes(message.channel)) {
      this.sendError(
        webSocket,
        "scope-denied",
        false,
        message.idempotencyKey,
        undefined,
        message.channel,
      );
      return;
    }
    const fingerprints = await createPublishReceiptFingerprints({
      idempotencyKey: message.idempotencyKey,
      actorId: attachment.actorId,
      clientId: attachment.clientId,
      channel: message.channel,
      payload: message.payload,
    });
    const existing = this.store.findReceipt(
      message.idempotencyKey,
    );
    if (existing !== null) {
      if (
        existing.event.actorId !== attachment.actorId ||
        existing.event.clientId !== attachment.clientId ||
        existing.event.channel !== message.channel ||
        !areRealtimePayloadsEquivalent(
          existing.event.payload,
          message.payload,
        )
      ) {
        this.sendError(
          webSocket,
          "idempotency-conflict",
          false,
          message.idempotencyKey,
        );
        return;
      }
      webSocket.serializeAttachment(
        withAttachmentUpdate(attachment, {
          lastClientSequence: Math.max(
            attachment.lastClientSequence,
            message.clientSequence,
          ),
        }),
      );
      this.sendMessage(webSocket, {
        version: REALTIME_PROTOCOL_VERSION,
        type: "ack",
        channel: existing.event.channel,
        idempotencyKey: message.idempotencyKey,
        sequence: existing.event.sequence,
        duplicate: true,
      });
      return;
    }
    const teardownAck = this.store.findTeardownAck(
      fingerprints.idempotencyFingerprint,
    );
    if (teardownAck !== null) {
      if (
        teardownAck.requestFingerprint !==
        fingerprints.requestFingerprint
      ) {
        this.sendError(
          webSocket,
          "idempotency-conflict",
          false,
          message.idempotencyKey,
        );
        return;
      }
      webSocket.serializeAttachment(
        withAttachmentUpdate(attachment, {
          lastClientSequence: Math.max(
            attachment.lastClientSequence,
            message.clientSequence,
          ),
        }),
      );
      this.sendMessage(webSocket, {
        version: REALTIME_PROTOCOL_VERSION,
        type: "ack",
        channel: "screen-signaling",
        idempotencyKey: message.idempotencyKey,
        sequence: teardownAck.sequence,
        duplicate: true,
      });
      return;
    }

    const timing = evaluatePublishTiming(message.sentAtMs, nowMs);
    if (!timing.ok) {
      this.sendError(
        webSocket,
        timing.code,
        false,
        message.idempotencyKey,
        undefined,
        message.channel,
      );
      return;
    }
    if (
      !isClientSequenceAccepted(
        attachment.lastClientSequence,
        message.clientSequence,
      )
    ) {
      this.sendError(
        webSocket,
        "sequence-out-of-order",
        false,
        message.idempotencyKey,
        this.store.getSequenceState(message.channel),
        message.channel,
      );
      return;
    }
    const rateAdmission = this.store.consumeRateBudget(
      attachment.actorId,
      message.channel,
      nowMs,
      frameBytes,
      this.limits.rateWindowMs,
      this.limits.channelRateLimits[message.channel],
    );
    if (!rateAdmission.ok) {
      this.sendError(
        webSocket,
        "rate-limited",
        true,
        message.idempotencyKey,
        this.store.getSequenceState(message.channel),
        message.channel,
      );
      return;
    }

    const receiptBudget = {
      maximumCount: this.limits.maxReceiptCount,
      maximumBytes: this.limits.maxReceiptBytes,
    };
    const baseEventInput = {
      idempotencyKey: message.idempotencyKey,
      actorId: attachment.actorId,
      clientId: attachment.clientId,
      connectionId: attachment.connectionId,
      channel: message.channel,
      serverAtMs: nowMs,
      eventExpiresAtMs: nowMs + this.limits.eventRetentionMs,
      receiptExpiresAtMs: nowMs + this.limits.eventRetentionMs,
      payload: message.payload,
    } as const;
    const teardown =
      message.channel === "screen-signaling" &&
      isScreenSignalTeardown(
        message.payload as ScreenSignalingPayload,
      );
    const canAppendReceipt = (): boolean =>
      teardown ||
      this.store.canAppendReceipt(baseEventInput, receiptBudget);
    if (!canAppendReceipt()) {
      // Reclaim only expired receipt/event prefixes. Live idempotency records
      // are never evicted to admit a new publish.
      this.store.prune(nowMs, this.limits.maxReplayEvents);
      if (!canAppendReceipt()) {
        this.sendError(
          webSocket,
          "backpressure",
          true,
          message.idempotencyKey,
          this.store.getSequenceState(message.channel),
          message.channel,
        );
        return;
      }
    }

    let stored: StoredRoomEvent;
    if (message.channel === "screen-signaling") {
      let publication: ScreenSignalPublication;
      try {
        publication = this.store.appendAuthorizedScreenSignal(
          {
            ...baseEventInput,
            channel: "screen-signaling",
            payload: message.payload as ScreenSignalingPayload,
          },
          {
            actorId: attachment.actorId,
            clientId: attachment.clientId,
            connectionId: attachment.connectionId,
            sessionExpiresAtMs: attachment.sessionExpiresAtMs,
          },
          nowMs,
          receiptBudget,
          fingerprints,
        );
      } catch (error) {
        if (!(error instanceof RealtimeReceiptBudgetExceededError)) {
          throw error;
        }
        this.sendError(
          webSocket,
          "backpressure",
          true,
          message.idempotencyKey,
          this.store.getSequenceState(message.channel),
          message.channel,
        );
        return;
      }
      if (!publication.ok) {
        this.sendError(
          webSocket,
          "signaling-state-conflict",
          false,
          message.idempotencyKey,
          this.store.getSequenceState(message.channel),
          message.channel,
        );
        return;
      }
      stored = publication.stored;
    } else {
      if (message.channel === "presence") {
        if (message.payload.kind === "presence.leave") {
          this.store.clearPresence(attachment.connectionId);
        } else {
          this.store.updatePresence(
            attachment.connectionId,
            attachment.actorId,
            attachment.clientId,
            message.payload as
              | PresenceUpdatePayload
              | PresenceCursorPayload,
            nowMs,
          );
        }
      }
      try {
        stored = this.store.appendEvent(
          baseEventInput,
          receiptBudget,
        );
      } catch (error) {
        if (!(error instanceof RealtimeReceiptBudgetExceededError)) {
          throw error;
        }
        this.sendError(
          webSocket,
          "backpressure",
          true,
          message.idempotencyKey,
          this.store.getSequenceState(message.channel),
          message.channel,
        );
        return;
      }
    }
    webSocket.serializeAttachment(
      withAttachmentUpdate(attachment, {
        lastClientSequence: message.clientSequence,
      }),
    );
    this.sendMessage(webSocket, {
      version: REALTIME_PROTOCOL_VERSION,
      type: "ack",
      channel: message.channel,
      idempotencyKey: message.idempotencyKey,
      sequence: stored.event.sequence,
      duplicate: false,
    });
    this.broadcastEvent(stored);
  }

  private handleResume(
    webSocket: HibernatableWebSocket,
    attachment: ConnectionAttachment,
    message: ClientResumeMessage,
    nowMs: number,
  ): void {
    if (!attachment.scopes.includes(message.channel)) {
      this.recordProtocolViolation(
        webSocket,
        attachment,
        "scope-denied",
      );
      return;
    }
    const expectedFrontier =
      attachment.resumeFrontiers[message.channel];
    if (
      attachment.completedResumeChannels.includes(message.channel) ||
      (expectedFrontier !== null &&
        message.afterSequence !== expectedFrontier)
    ) {
      this.recordProtocolViolation(
        webSocket,
        attachment,
        "sequence-out-of-order",
      );
      return;
    }
    const previousBudget = {
      windowStartedAtMs: attachment.resumeWindowStartedAtMs,
      eventCount: attachment.resumeRequestCount,
      byteCount: attachment.resumeEgressBytes,
    };
    const requestAdmission = evaluateRateBudget(
      previousBudget,
      nowMs,
      0,
      this.limits.resumeWindowMs,
      this.limits.resumeRateLimit,
    );
    if (!requestAdmission.ok) {
      this.rejectResumeBackpressure(webSocket, message.channel);
      return;
    }

    const state = this.store.getSequenceState(message.channel);
    const plan = planReplay(
      message.afterSequence,
      state.currentSequence,
      state.replayFloorSequence,
    );
    if (plan.kind === "gap") {
      this.sendBudgetedResumeResponse(
        webSocket,
        attachment,
        {
          version: REALTIME_PROTOCOL_VERSION,
          type: "error",
          code: "resume-gap",
          retryable: false,
          channel: message.channel,
          currentSequence: state.currentSequence,
          replayFloorSequence: state.replayFloorSequence,
        },
        nowMs,
      );
      return;
    }
    if (plan.kind === "future") {
      this.sendBudgetedResumeResponse(
        webSocket,
        attachment,
        {
          version: REALTIME_PROTOCOL_VERSION,
          type: "error",
          code: "sequence-out-of-order",
          retryable: false,
          channel: message.channel,
          currentSequence: state.currentSequence,
          replayFloorSequence: state.replayFloorSequence,
        },
        nowMs,
      );
      return;
    }
    if (plan.kind === "empty") {
      this.sendBudgetedResumeResponse(
        webSocket,
        attachment,
        {
          version: REALTIME_PROTOCOL_VERSION,
          type: "replay",
          channel: message.channel,
          fromSequence: message.afterSequence + 1,
          toSequence: state.currentSequence,
          currentSequence: state.currentSequence,
          complete: true,
          events: [],
        },
        nowMs,
        {
          channel: message.channel,
          toSequence: state.currentSequence,
          complete: true,
        },
      );
      return;
    }

    const candidates = this.store.readEventsAfter(
      message.channel,
      message.afterSequence,
      REALTIME_MAX_REPLAY_EVENTS_PER_FRAME,
    );
    const visibleEvents: StoredRoomEvent["event"][] = [];
    let scannedToSequence = message.afterSequence;
    for (const stored of candidates) {
      const isVisible = this.canConnectionReceiveEvent(
        attachment,
        stored,
      );
      const candidateVisibleEvents = isVisible
        ? [...visibleEvents, stored.event]
        : visibleEvents;
      const candidateReplay: ServerReplayMessage = {
        version: REALTIME_PROTOCOL_VERSION,
        type: "replay",
        channel: message.channel,
        fromSequence: message.afterSequence + 1,
        toSequence: stored.event.sequence,
        currentSequence: state.currentSequence,
        complete: stored.event.sequence >= state.currentSequence,
        events: candidateVisibleEvents,
      };
      if (
        utf8ByteLength(JSON.stringify(candidateReplay)) >
        REALTIME_MAX_OUTBOUND_FRAME_BYTES
      ) {
        break;
      }
      scannedToSequence = stored.event.sequence;
      if (isVisible) {
        visibleEvents.push(stored.event);
      }
    }
    if (scannedToSequence === message.afterSequence) {
      this.sendBudgetedResumeResponse(
        webSocket,
        attachment,
        {
          version: REALTIME_PROTOCOL_VERSION,
          type: "error",
          code: "internal-error",
          retryable: true,
          channel: message.channel,
          currentSequence: state.currentSequence,
          replayFloorSequence: state.replayFloorSequence,
        },
        nowMs,
      );
      return;
    }
    const complete = scannedToSequence >= state.currentSequence;
    this.sendBudgetedResumeResponse(
      webSocket,
      attachment,
      {
        version: REALTIME_PROTOCOL_VERSION,
        type: "replay",
        channel: message.channel,
        fromSequence: message.afterSequence + 1,
        toSequence: scannedToSequence,
        currentSequence: state.currentSequence,
        complete,
        events: visibleEvents,
      },
      nowMs,
      {
        channel: message.channel,
        toSequence: scannedToSequence,
        complete,
      },
    );
  }

  private sendBudgetedResumeResponse(
    webSocket: HibernatableWebSocket,
    attachment: ConnectionAttachment,
    message: RealtimeServerMessage,
    nowMs: number,
    progress?: {
      readonly channel: RealtimeChannel;
      readonly toSequence: number;
      readonly complete: boolean;
    },
  ): boolean {
    const serialized = serializeRealtimeServerMessage(message);
    const evaluated = evaluateRateBudget(
      {
        windowStartedAtMs: attachment.resumeWindowStartedAtMs,
        eventCount: attachment.resumeRequestCount,
        byteCount: attachment.resumeEgressBytes,
      },
      nowMs,
      utf8ByteLength(serialized),
      this.limits.resumeWindowMs,
      this.limits.resumeRateLimit,
    );
    if (!evaluated.ok) {
      this.rejectResumeBackpressure(
        webSocket,
        progress?.channel,
      );
      return false;
    }
    const resumeFrontiers: ResumeFrontiers =
      progress === undefined
        ? attachment.resumeFrontiers
        : {
            ...attachment.resumeFrontiers,
            [progress.channel]: progress.toSequence,
          };
    const completedResumeChannels =
      progress?.complete === true &&
      !attachment.completedResumeChannels.includes(progress.channel)
        ? [...attachment.completedResumeChannels, progress.channel]
        : attachment.completedResumeChannels;
    webSocket.serializeAttachment(
      withAttachmentUpdate(attachment, {
        resumeWindowStartedAtMs:
          evaluated.state.windowStartedAtMs,
        resumeRequestCount: evaluated.state.eventCount,
        resumeEgressBytes: evaluated.state.byteCount,
        resumeFrontiers,
        completedResumeChannels,
      }),
    );
    return this.sendRaw(webSocket, serialized);
  }

  private rejectResumeBackpressure(
    webSocket: HibernatableWebSocket,
    channel?: RealtimeChannel,
  ): void {
    this.sendError(
      webSocket,
      "backpressure",
      true,
      undefined,
      undefined,
      channel,
    );
    closeSocket(webSocket, 1013, "resume-backpressure");
  }

  private canConnectionReceiveEvent(
    attachment: ConnectionAttachment,
    stored: StoredRoomEvent,
  ): boolean {
    const event = stored.event;
    if (!attachment.scopes.includes(event.channel)) {
      return false;
    }
    if (
      stored.targetActorId === null ||
      stored.targetClientId === null
    ) {
      return true;
    }
    return (
      (attachment.actorId === event.actorId &&
        attachment.clientId === event.clientId) ||
      (attachment.actorId === stored.targetActorId &&
        attachment.clientId === stored.targetClientId)
    );
  }

  private broadcastEvent(
    stored: StoredRoomEvent,
    sockets: readonly HibernatableWebSocket[] =
      this.roomState.getWebSockets(),
  ): void {
    for (const socket of sockets) {
      const attachment = socket.deserializeAttachment();
      if (!isConnectionAttachment(attachment)) {
        closeSocket(socket, 1011, "invalid-connection-state");
        continue;
      }
      if (attachment.sessionExpiresAtMs <= Date.now()) {
        closeSocket(socket, 4003, "session-expired");
        continue;
      }
      if (this.canConnectionReceiveEvent(attachment, stored)) {
        this.sendMessage(socket, stored.event);
      }
    }
  }

  private sendPresenceSnapshot(
    webSocket: HibernatableWebSocket,
    sequence: number,
    generatedAtMs: number,
  ): void {
    const entries = this.store.listPresenceSnapshot(generatedAtMs);
    const snapshotId = `snapshot-${crypto.randomUUID()}`;
    const pageSize = 32;
    const pageCount = Math.max(1, Math.ceil(entries.length / pageSize));
    for (let page = 0; page < pageCount; page += 1) {
      const message: ServerPresenceSnapshotMessage = {
        version: REALTIME_PROTOCOL_VERSION,
        type: "presence-snapshot",
        channel: "presence",
        sequence,
        snapshotId,
        page,
        complete: page === pageCount - 1,
        generatedAtMs,
        entries: entries.slice(page * pageSize, (page + 1) * pageSize),
      };
      if (!this.sendMessage(webSocket, message)) {
        return;
      }
    }
  }

  private sendError(
    webSocket: HibernatableWebSocket,
    code: RealtimeProtocolErrorCode,
    retryable: boolean,
    idempotencyKey?: string,
    sequenceState?: {
      readonly currentSequence: number;
      readonly replayFloorSequence: number;
    },
    channel?: RealtimeChannel,
  ): void {
    const message: ServerErrorMessage = {
      version: REALTIME_PROTOCOL_VERSION,
      type: "error",
      code,
      retryable,
      ...(channel === undefined ? {} : { channel }),
      ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      ...(sequenceState === undefined
        ? {}
        : {
            currentSequence: sequenceState.currentSequence,
            replayFloorSequence: sequenceState.replayFloorSequence,
          }),
    };
    this.sendMessage(webSocket, message);
  }

  private sendMessage(
    webSocket: HibernatableWebSocket,
    message: RealtimeServerMessage,
  ): boolean {
    return this.sendRaw(
      webSocket,
      serializeRealtimeServerMessage(message),
    );
  }

  private sendRaw(
    webSocket: HibernatableWebSocket,
    serialized: string,
  ): boolean {
    const frameBytes = utf8ByteLength(serialized);
    if (
      !canBufferFrame(
        resolveHibernatableBufferedAmount(
          (webSocket as WebSocket & { bufferedAmount?: unknown })
            .bufferedAmount,
        ),
        frameBytes,
        this.limits.maxBufferedBytes,
      )
    ) {
      closeSocket(webSocket, 1013, "backpressure");
      return false;
    }
    try {
      webSocket.send(serialized);
      return true;
    } catch {
      closeSocket(webSocket, 1013, "backpressure");
      return false;
    }
  }

  private async scheduleNextAlarm(nowMs: number): Promise<void> {
    const sockets = this.roomState.getWebSockets();
    const nextAlarmAt = selectNextAlarmAt(
      nowMs,
      this.limits.cleanupIntervalMs,
      this.store.hasExpiringRows(),
      sockets.flatMap((socket) => {
        const attachment = socket.deserializeAttachment();
        return isConnectionAttachment(attachment)
          ? [attachment.sessionExpiresAtMs]
          : [nowMs + 1];
      }),
    );
    if (nextAlarmAt === null) {
      await this.roomState.storage.deleteAlarm();
      return;
    }
    const currentAlarm = await this.roomState.storage.getAlarm();
    if (currentAlarm === null || nextAlarmAt < currentAlarm) {
      await this.roomState.storage.setAlarm(nextAlarmAt);
    }
  }
}
