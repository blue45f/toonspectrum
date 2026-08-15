import {
  createStudioCrdtLocalWireMessage,
  isStudioCrdtLocalWireCandidate,
  parseStudioCrdtLocalWireMessage,
  parseStudioCrdtSyncRequest,
  parseStudioCrdtSyncResponse,
  parseStudioCrdtUpdateRequest,
  STUDIO_CRDT_PROTOCOL_VERSION,
  type StudioCrdtSyncRequest,
  type StudioCrdtSyncResponse,
  type StudioCrdtTransportMessage,
  type StudioCrdtUpdateAck,
  type StudioCrdtUpdateRequest,
} from "./studio-crdt-protocol";
import {
  createStudioLiveEnvelope,
  parseStudioLiveEnvelope,
  type StudioLiveEnvelope,
  type StudioLiveMessageKind,
  type StudioLiveParticipant,
  type StudioLiveWebRtcDescriptionPayload,
  type StudioLiveWebRtcIcePayload,
} from "./studio-live-collaboration-protocol";

import type {
  StudioLiveTransport,
  StudioLiveTransportContext,
  StudioLiveTransportControlEvent,
  StudioLiveTransportFactory,
} from "./studio-live-collaboration-transport";

/**
 * Reserved screen-signal share id for the STUN-only data-channel mesh. Media screen shares never
 * use this id, and the room swallows these envelopes so a mesh offer cannot start playback.
 */
export const STUDIO_LIVE_P2P_MESH_SHARE_ID = "p2p-mesh-v1";
export const STUDIO_LIVE_P2P_CHANNEL_LABEL = "studio-live-p2p";
/** Full-mesh ICE above this size is more expensive than a single server fanout. */
export const STUDIO_LIVE_P2P_MAX_PEERS = 8;

const STUDIO_LIVE_P2P_EPHEMERAL_KINDS = new Set<StudioLiveMessageKind>([
  "presence:heartbeat",
  "cursor:update",
  "chat:message",
]);

const STUDIO_LIVE_P2P_STUN_URLS = ["stun:stun.l.google.com:19302"] as const;

export function isStudioLiveP2pMeshShareId(shareId: string): boolean {
  return shareId === STUDIO_LIVE_P2P_MESH_SHARE_ID;
}

export function isStudioLiveP2pEphemeralKind(kind: StudioLiveMessageKind): boolean {
  return STUDIO_LIVE_P2P_EPHEMERAL_KINDS.has(kind);
}

export interface StudioLiveP2pRtcIceCandidate {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export interface StudioLiveP2pRtcDataChannel {
  readonly label: string;
  readonly readyState: string;
  send(data: string): void;
  close(): void;
  onopen: ((event: Event) => void) | null;
  onclose: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent<string>) => void) | null;
}

export interface StudioLiveP2pRtcPeerConnection {
  readonly connectionState: string;
  onicecandidate: ((event: { candidate: StudioLiveP2pRtcIceCandidate | null }) => void) | null;
  ondatachannel: ((event: { channel: StudioLiveP2pRtcDataChannel }) => void) | null;
  onconnectionstatechange: (() => void) | null;
  createDataChannel(label: string): StudioLiveP2pRtcDataChannel;
  createOffer(): Promise<RTCSessionDescriptionInit>;
  createAnswer(): Promise<RTCSessionDescriptionInit>;
  setLocalDescription(description: RTCSessionDescriptionInit): Promise<void>;
  setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void>;
  addIceCandidate(candidate: RTCIceCandidateInit): Promise<void>;
  close(): void;
}

export type StudioLiveP2pPeerConnectionFactory = () => StudioLiveP2pRtcPeerConnection;

export interface StudioLiveP2pOverlayOptions {
  readonly enabled?: boolean;
  readonly createPeerConnection?: StudioLiveP2pPeerConnectionFactory;
  readonly now?: () => number;
  readonly maxPeers?: number;
}

function defaultCreatePeerConnection(): StudioLiveP2pRtcPeerConnection | null {
  if (typeof RTCPeerConnection !== "function") return null;
  return new RTCPeerConnection({
    iceServers: [{ urls: [...STUDIO_LIVE_P2P_STUN_URLS] }],
    bundlePolicy: "max-bundle",
  }) as unknown as StudioLiveP2pRtcPeerConnection;
}

function shouldOfferMesh(selfSessionId: string, peerSessionId: string): boolean {
  return selfSessionId < peerSessionId;
}

function isMeshSignal(
  envelope: StudioLiveEnvelope,
): envelope is StudioLiveEnvelope<"webrtc:description" | "webrtc:ice"> {
  if (envelope.kind !== "webrtc:description" && envelope.kind !== "webrtc:ice") return false;
  return isStudioLiveP2pMeshShareId(
    (envelope.payload as StudioLiveWebRtcDescriptionPayload | StudioLiveWebRtcIcePayload).shareId,
  );
}

interface StudioLiveP2pPeerLink {
  readonly sessionId: string;
  participant: StudioLiveParticipant;
  connection: StudioLiveP2pRtcPeerConnection;
  channel: StudioLiveP2pRtcDataChannel | null;
  remoteDescriptionSet: boolean;
  pendingIce: RTCIceCandidateInit[];
  closed: boolean;
}

/**
 * Opportunistic STUN-only data-channel mesh on top of an authoritative server transport.
 * Cursor, presence heartbeat, and chat hop peer-to-peer once every known peer has an open
 * channel. Join, locks, and ICE signaling stay on the primary transport. CRDT stays
 * on the primary when it can persist updates; otherwise the mesh carries jam Yjs diffs.
 * A missing WebRTC implementation or a failed ICE path falls back without shrinking features.
 */
class StudioLiveP2pOverlayTransport implements StudioLiveTransport {
  readonly mode: StudioLiveTransport["mode"];
  readonly canonicalSessionId?: StudioLiveTransport["canonicalSessionId"];
  readonly transportSessionId?: StudioLiveTransport["transportSessionId"];
  private readonly context: StudioLiveTransportContext;
  private readonly primary: StudioLiveTransport;
  private readonly createPeerConnection: StudioLiveP2pPeerConnectionFactory;
  private readonly now: () => number;
  private readonly maxPeers: number;
  private readonly peers = new Map<string, StudioLiveP2pPeerLink>();
  private readonly listeners = new Set<(value: unknown) => void>();
  private readonly crdtListeners = new Set<(message: StudioCrdtTransportMessage) => void>();
  private readonly pendingCrdtSync = new Map<string, {
    resolve: (response: StudioCrdtSyncResponse | null) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();
  private readonly seenCrdtUpdateIds = new Set<string>();
  private unsubscribePrimary: (() => void) | null = null;
  private signalSequence = 1;
  private closed = false;

  constructor(
    context: StudioLiveTransportContext,
    primary: StudioLiveTransport,
    createPeerConnection: StudioLiveP2pPeerConnectionFactory,
    now: () => number,
    maxPeers: number,
  ) {
    this.context = context;
    this.primary = primary;
    this.mode = primary.mode;
    this.createPeerConnection = createPeerConnection;
    this.now = now;
    this.maxPeers = maxPeers;
    this.canonicalSessionId = primary.canonicalSessionId?.bind(primary);
    this.transportSessionId = primary.transportSessionId?.bind(primary);
  }

  get ready(): boolean {
    return this.primary.ready;
  }

  async connect(): Promise<void> {
    if (this.closed) return;
    this.unsubscribePrimary ??= this.primary.subscribe((value) => {
      this.handlePrimaryInbound(value);
    });
    await this.primary.connect();
  }

  send(envelope: StudioLiveEnvelope): boolean {
    if (this.closed) return false;
    if (isStudioLiveP2pEphemeralKind(envelope.kind) && this.sendEphemeral(envelope)) {
      return true;
    }
    return this.primary.send(envelope);
  }

  subscribe(listener: (value: unknown) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeControl(listener: (event: StudioLiveTransportControlEvent) => void): () => void {
    return this.primary.subscribeControl?.(listener) ?? (() => undefined);
  }

  acquireLock?(
    request: Parameters<NonNullable<StudioLiveTransport["acquireLock"]>>[0],
  ): ReturnType<NonNullable<StudioLiveTransport["acquireLock"]>> {
    if (!this.primary.acquireLock) {
      return Promise.resolve({
        status: "timeout",
        resource: request.resource,
        requestId: request.requestId,
        message: "권위 있는 편집 잠금 경로가 없습니다.",
      });
    }
    return this.primary.acquireLock(request);
  }

  releaseLock?(
    request: Parameters<NonNullable<StudioLiveTransport["releaseLock"]>>[0],
  ): ReturnType<NonNullable<StudioLiveTransport["releaseLock"]>> {
    if (!this.primary.releaseLock) {
      return Promise.resolve({
        status: "denied",
        resource: request.resource,
        requestId: request.requestId,
        claimId: request.claimId,
        code: "transport_error",
        message: "권위 있는 편집 잠금 경로가 없습니다.",
      });
    }
    return this.primary.releaseLock(request);
  }

  requestCrdtSync(request: StudioCrdtSyncRequest): Promise<StudioCrdtSyncResponse | null> {
    if (this.primary.requestCrdtSync) return this.primary.requestCrdtSync(request);
    return this.requestMeshCrdtSync(request);
  }

  respondCrdtSync(response: StudioCrdtSyncResponse, targetSessionId: string): boolean {
    if (this.primary.respondCrdtSync) {
      return this.primary.respondCrdtSync(response, targetSessionId);
    }
    const parsed = parseStudioCrdtSyncResponse(response, {
      expectedWorkId: this.context.workId,
    });
    if (!parsed || !targetSessionId) return false;
    return this.sendMeshCrdtWire({
      workId: this.context.workId,
      senderSessionId: this.context.participant.sessionId,
      targetSessionId,
      kind: "sync-response",
      payload: parsed,
    });
  }

  publishCrdtUpdate(request: StudioCrdtUpdateRequest): Promise<StudioCrdtUpdateAck> {
    if (this.primary.publishCrdtUpdate) return this.primary.publishCrdtUpdate(request);
    return this.publishMeshCrdtUpdate(request);
  }

  subscribeCrdt(listener: (message: StudioCrdtTransportMessage) => void): () => void {
    if (this.primary.subscribeCrdt) return this.primary.subscribeCrdt(listener);
    if (this.closed) return () => undefined;
    this.crdtListeners.add(listener);
    return () => this.crdtListeners.delete(listener);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribePrimary?.();
    this.unsubscribePrimary = null;
    for (const pending of this.pendingCrdtSync.values()) {
      clearTimeout(pending.timeout);
      pending.resolve(null);
    }
    this.pendingCrdtSync.clear();
    this.seenCrdtUpdateIds.clear();
    this.crdtListeners.clear();
    for (const sessionId of [...this.peers.keys()]) this.teardownPeer(sessionId);
    this.listeners.clear();
    this.primary.close();
  }

  private requestMeshCrdtSync(
    request: StudioCrdtSyncRequest,
  ): Promise<StudioCrdtSyncResponse | null> {
    const parsed = parseStudioCrdtSyncRequest(request, {
      expectedWorkId: this.context.workId,
    });
    if (!parsed) {
      return Promise.reject(new Error("CRDT 동기화 요청이 올바르지 않습니다."));
    }
    if (this.pendingCrdtSync.has(parsed.requestId)) {
      return Promise.reject(new Error("같은 CRDT 동기화 요청이 이미 진행 중입니다."));
    }
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingCrdtSync.delete(parsed.requestId);
        resolve(null);
      }, 2_000);
      this.pendingCrdtSync.set(parsed.requestId, { resolve, timeout });
      const sent = this.sendMeshCrdtWire({
        workId: this.context.workId,
        senderSessionId: this.context.participant.sessionId,
        targetSessionId: null,
        kind: "sync-request",
        payload: parsed,
      });
      if (sent) return;
      clearTimeout(timeout);
      this.pendingCrdtSync.delete(parsed.requestId);
      resolve(null);
    });
  }

  private publishMeshCrdtUpdate(
    request: StudioCrdtUpdateRequest,
  ): Promise<StudioCrdtUpdateAck> {
    const parsed = parseStudioCrdtUpdateRequest(request, {
      expectedWorkId: this.context.workId,
    });
    if (!parsed) {
      return Promise.reject(new Error("CRDT 업데이트가 올바르지 않습니다."));
    }
    const duplicate = this.seenCrdtUpdateIds.has(parsed.updateId);
    if (!duplicate) {
      this.rememberMeshCrdtUpdateId(parsed.updateId);
      if (this.peers.size > 0) {
        this.sendMeshCrdtWire({
          workId: this.context.workId,
          senderSessionId: this.context.participant.sessionId,
          targetSessionId: null,
          kind: "update",
          payload: {
            protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
            workId: this.context.workId,
            updateId: parsed.updateId,
            serverSequence: "0",
            update: parsed.update,
          },
        });
      }
    }
    return Promise.resolve({
      protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
      workId: this.context.workId,
      updateId: parsed.updateId,
      serverSequence: "0",
      serverStateVector: null,
      duplicate,
    });
  }

  private sendMeshCrdtWire(
    message: Parameters<typeof createStudioCrdtLocalWireMessage>[0],
  ): boolean {
    if (this.closed || this.peers.size === 0) return false;
    let delivered = 0;
    const serialized = JSON.stringify(createStudioCrdtLocalWireMessage(message));
    const target = message.targetSessionId;
    for (const peer of this.peers.values()) {
      if (target && peer.sessionId !== target) continue;
      if (this.sendSerializedToPeer(peer, serialized)) delivered += 1;
    }
    return delivered > 0;
  }

  private receiveMeshCrdt(value: unknown): boolean {
    if (!isStudioCrdtLocalWireCandidate(value)) return false;
    const wire = parseStudioCrdtLocalWireMessage(value, {
      expectedWorkId: this.context.workId,
      selfSessionId: this.context.participant.sessionId,
    });
    if (!wire) return true;
    if (wire.kind === "sync-response") {
      const pending = this.pendingCrdtSync.get(wire.payload.requestId);
      if (!pending) return true;
      this.pendingCrdtSync.delete(wire.payload.requestId);
      clearTimeout(pending.timeout);
      pending.resolve(wire.payload);
      return true;
    }
    if (wire.kind === "sync-request") {
      this.emitMeshCrdt({
        type: "sync-request",
        request: wire.payload,
        senderSessionId: wire.senderSessionId,
      });
      return true;
    }
    if (this.seenCrdtUpdateIds.has(wire.payload.updateId)) return true;
    this.rememberMeshCrdtUpdateId(wire.payload.updateId);
    this.emitMeshCrdt({
      type: "update",
      update: wire.payload,
      senderSessionId: wire.senderSessionId,
    });
    return true;
  }

  private emitMeshCrdt(message: StudioCrdtTransportMessage): void {
    for (const listener of this.crdtListeners) listener(message);
  }

  private rememberMeshCrdtUpdateId(updateId: string): void {
    if (this.seenCrdtUpdateIds.has(updateId)) return;
    this.seenCrdtUpdateIds.add(updateId);
    if (this.seenCrdtUpdateIds.size <= 2_048) return;
    const oldest = this.seenCrdtUpdateIds.values().next().value;
    if (typeof oldest === "string") this.seenCrdtUpdateIds.delete(oldest);
  }

  private sendEphemeral(envelope: StudioLiveEnvelope): boolean {
    const targetSessionId = envelope.targetSessionId;
    if (targetSessionId) {
      const peer = this.peers.get(targetSessionId);
      return Boolean(peer && this.sendToPeer(peer, envelope));
    }
    if (this.peers.size === 0) return false;
    let delivered = 0;
    let missing = 0;
    const serialized = JSON.stringify(envelope);
    for (const peer of this.peers.values()) {
      if (this.sendSerializedToPeer(peer, serialized)) delivered += 1;
      else missing += 1;
    }
    return missing === 0 && delivered > 0;
  }

  private sendToPeer(peer: StudioLiveP2pPeerLink, envelope: StudioLiveEnvelope): boolean {
    return this.sendSerializedToPeer(peer, JSON.stringify(envelope));
  }

  private sendSerializedToPeer(peer: StudioLiveP2pPeerLink, serialized: string): boolean {
    if (peer.closed || peer.channel?.readyState !== "open") return false;
    try {
      peer.channel.send(serialized);
      return true;
    } catch {
      return false;
    }
  }

  private handlePrimaryInbound(value: unknown): void {
    if (this.closed) return;
    const envelope = parseStudioLiveEnvelope(value, {
      expectedWorkId: this.context.workId,
      selfSessionId: this.context.participant.sessionId,
      now: this.now(),
    });
    if (envelope && isMeshSignal(envelope)) {
      void this.handleMeshSignal(envelope);
      return;
    }
    if (envelope) this.observePresence(envelope);
    this.emit(value);
  }

  private observePresence(envelope: StudioLiveEnvelope): void {
    const sessionId = envelope.sender.sessionId;
    if (sessionId === this.context.participant.sessionId) return;
    if (envelope.kind === "presence:leave") {
      this.teardownPeer(sessionId);
      return;
    }
    if (envelope.kind === "presence:hello" || envelope.kind === "presence:heartbeat") {
      this.ensurePeer(envelope.sender);
    }
  }

  private ensurePeer(participant: StudioLiveParticipant): void {
    if (this.closed) return;
    const sessionId = participant.sessionId;
    if (sessionId === this.context.participant.sessionId) return;
    const existing = this.peers.get(sessionId);
    if (existing && !existing.closed) {
      existing.participant = participant;
      return;
    }
    if (!existing && this.peers.size >= this.maxPeers) return;

    let connection: StudioLiveP2pRtcPeerConnection;
    try {
      connection = this.createPeerConnection();
    } catch {
      return;
    }
    const link: StudioLiveP2pPeerLink = {
      sessionId,
      participant,
      connection,
      channel: null,
      remoteDescriptionSet: false,
      pendingIce: [],
      closed: false,
    };
    this.peers.set(sessionId, link);
    connection.onicecandidate = (event) => {
      const candidate = event.candidate;
      if (link.closed || !candidate?.candidate) return;
      this.sendMeshIce(sessionId, candidate);
    };
    connection.ondatachannel = (event) => {
      if (link.closed) return;
      this.bindChannel(link, event.channel);
    };
    connection.onconnectionstatechange = () => {
      if (link.closed) return;
      const state = connection.connectionState;
      if (state === "failed" || state === "closed") {
        this.teardownPeer(sessionId);
      }
    };
    if (!shouldOfferMesh(this.context.participant.sessionId, sessionId)) return;
    try {
      this.bindChannel(link, connection.createDataChannel(STUDIO_LIVE_P2P_CHANNEL_LABEL));
    } catch {
      this.teardownPeer(sessionId);
      return;
    }
    void this.sendMeshOffer(link);
  }

  private async sendMeshOffer(link: StudioLiveP2pPeerLink): Promise<void> {
    try {
      const offer = await link.connection.createOffer();
      if (link.closed || this.closed) return;
      await link.connection.setLocalDescription(offer);
      if (link.closed || this.closed) return;
      if (typeof offer.sdp !== "string" || offer.sdp.length === 0) return;
      this.sendMeshDescription(link.sessionId, "offer", offer.sdp);
    } catch {
      this.teardownPeer(link.sessionId);
    }
  }

  private async handleMeshSignal(
    envelope: StudioLiveEnvelope<"webrtc:description" | "webrtc:ice">,
  ): Promise<void> {
    this.ensurePeer(envelope.sender);
    const link = this.peers.get(envelope.sender.sessionId);
    if (!link || link.closed) return;
    try {
      if (envelope.kind === "webrtc:description") {
        const payload = envelope.payload as StudioLiveWebRtcDescriptionPayload;
        await link.connection.setRemoteDescription({
          type: payload.type,
          sdp: payload.sdp,
        });
        if (link.closed || this.closed) return;
        link.remoteDescriptionSet = true;
        await this.flushPendingIce(link);
        if (payload.type === "offer") {
          const answer = await link.connection.createAnswer();
          if (link.closed || this.closed) return;
          await link.connection.setLocalDescription(answer);
          if (link.closed || this.closed || typeof answer.sdp !== "string") return;
          this.sendMeshDescription(link.sessionId, "answer", answer.sdp);
        }
        return;
      }
      const ice = envelope.payload as StudioLiveWebRtcIcePayload;
      const candidate: RTCIceCandidateInit = {
        candidate: ice.candidate,
        sdpMid: ice.sdpMid,
        sdpMLineIndex: ice.sdpMLineIndex,
        usernameFragment: ice.usernameFragment,
      };
      if (!link.remoteDescriptionSet) {
        if (link.pendingIce.length < 32) link.pendingIce.push(candidate);
        return;
      }
      await link.connection.addIceCandidate(candidate);
    } catch {
      // ICE/SDP can race a close or a stale candidate. Keep the mesh opportunistic.
    }
  }

  private bindChannel(
    link: StudioLiveP2pPeerLink,
    channel: StudioLiveP2pRtcDataChannel,
  ): void {
    if (link.closed) {
      channel.close();
      return;
    }
    if (link.channel && link.channel !== channel) {
      try {
        link.channel.close();
      } catch {
        // Replaced channel.
      }
    }
    link.channel = channel;
    channel.onmessage = (event) => {
      this.handleChannelMessage(event.data);
    };
    channel.onclose = () => {
      if (link.channel === channel) link.channel = null;
    };
  }

  private handleChannelMessage(data: unknown): void {
    if (this.closed || typeof data !== "string") return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data) as unknown;
    } catch {
      return;
    }
    if (this.receiveMeshCrdt(parsed)) return;
    const envelope = parseStudioLiveEnvelope(parsed, {
      expectedWorkId: this.context.workId,
      selfSessionId: this.context.participant.sessionId,
      now: this.now(),
    });
    if (!envelope || !isStudioLiveP2pEphemeralKind(envelope.kind)) return;
    this.emit(envelope);
  }

  private sendMeshDescription(
    targetSessionId: string,
    type: "offer" | "answer",
    sdp: string,
  ): void {
    this.sendSignal(
      targetSessionId,
      "webrtc:description",
      {
        shareId: STUDIO_LIVE_P2P_MESH_SHARE_ID,
        type,
        sdp,
      },
    );
  }

  private sendMeshIce(
    targetSessionId: string,
    candidate: StudioLiveP2pRtcIceCandidate,
  ): void {
    this.sendSignal(
      targetSessionId,
      "webrtc:ice",
      {
        shareId: STUDIO_LIVE_P2P_MESH_SHARE_ID,
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid ?? null,
        sdpMLineIndex: candidate.sdpMLineIndex ?? null,
        usernameFragment: candidate.usernameFragment ?? null,
      },
    );
  }

  private sendSignal<K extends "webrtc:description" | "webrtc:ice">(
    targetSessionId: string,
    kind: K,
    payload: K extends "webrtc:description"
      ? StudioLiveWebRtcDescriptionPayload
      : StudioLiveWebRtcIcePayload,
  ): void {
    if (this.closed) return;
    try {
      if (kind === "webrtc:description") {
        const envelope = createStudioLiveEnvelope({
          workId: this.context.workId,
          sender: this.context.participant,
          sentAt: this.now(),
          sequence: this.signalSequence++,
          kind: "webrtc:description",
          targetSessionId,
          payload: payload as StudioLiveWebRtcDescriptionPayload,
        });
        this.primary.send(envelope);
      } else {
        const envelope = createStudioLiveEnvelope({
          workId: this.context.workId,
          sender: this.context.participant,
          sentAt: this.now(),
          sequence: this.signalSequence++,
          kind: "webrtc:ice",
          targetSessionId,
          payload: payload as StudioLiveWebRtcIcePayload,
        });
        this.primary.send(envelope);
      }
    } catch {
      // Invalid SDP/ICE is dropped; the next presence tick can retry the mesh.
    }
  }

  private async flushPendingIce(link: StudioLiveP2pPeerLink): Promise<void> {
    const queued = link.pendingIce.splice(0, link.pendingIce.length);
    for (const candidate of queued) {
      if (link.closed) return;
      try {
        await link.connection.addIceCandidate(candidate);
      } catch {
        // Stale candidate after an ICE restart is ignored.
      }
    }
  }

  private teardownPeer(sessionId: string): void {
    const link = this.peers.get(sessionId);
    if (!link) return;
    link.closed = true;
    this.peers.delete(sessionId);
    try {
      link.channel?.close();
    } catch {
      // Channel may already be closing.
    }
    try {
      link.connection.close();
    } catch {
      // Peer connection may already be closed.
    }
  }

  private emit(value: unknown): void {
    for (const listener of this.listeners) {
      try {
        listener(value);
      } catch {
        // Room observers do not own the mesh lifecycle.
      }
    }
  }

}

/**
 * Wraps a server live factory with an opportunistic P2P overlay. Local BroadcastChannel rooms
 * are already same-origin P2P and are left untouched. Missing WebRTC is a no-op wrap.
 */
export function applyStudioLiveP2pOverlay(
  primaryFactory: StudioLiveTransportFactory,
  options: StudioLiveP2pOverlayOptions = {},
): StudioLiveTransportFactory {
  if (options.enabled === false) return primaryFactory;
  return (context) => {
    const primary = primaryFactory(context);
    if (primary.mode !== "server") return primary;
    const createPeerConnection =
      options.createPeerConnection ??
      (() => {
        const connection = defaultCreatePeerConnection();
        if (!connection) {
          throw new Error("WebRTC is unavailable");
        }
        return connection;
      });
    if (!options.createPeerConnection && typeof RTCPeerConnection !== "function") {
      return primary;
    }
    return new StudioLiveP2pOverlayTransport(
      context,
      primary,
      createPeerConnection,
      options.now ?? Date.now,
      options.maxPeers ?? STUDIO_LIVE_P2P_MAX_PEERS,
    );
  };
}
