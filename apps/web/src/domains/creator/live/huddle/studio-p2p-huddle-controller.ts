import {
  HUDDLE_HISTORY_LIMIT, HUDDLE_MAX_REMOTE_PEERS, HUDDLE_TEXT_LIMIT,
  huddleRtcConfiguration, parseHuddlePacket,
  type HuddlePacket, type HuddleReaction, type HuddleState,
} from "./studio-p2p-huddle-protocol";
import type { StudioLiveParticipant } from "../studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../studio-live-direct-port";

export interface HuddleMessage {
  id: string; author: string; name: string; text: string; self: boolean; at: number;
  targets: string[]; sent: string[]; received: string[];
}
export interface HuddlePeer extends HuddleState {
  participant: StudioLiveParticipant; epoch: string; lastSeen: number;
  stream: MediaStream | null; connection: RTCPeerConnectionState | "idle";
  reaction: HuddleReaction | null; reactionUntil: number;
}
export type HuddleCameraFacingMode = "user" | "environment";
export interface HuddleSnapshot extends HuddleState {
  peers: HuddlePeer[]; messages: HuddleMessage[]; localStream: MediaStream | null;
  availablePeers: number; error: string | null; closed: boolean;
  cameraFacing: HuddleCameraFacingMode;
}
interface Link {
  pc: RTCPeerConnection; audio: RTCRtpSender; video: RTCRtpSender;
  makingOffer: boolean; ignoreOffer: boolean; settingAnswer: boolean;
  pendingIce: RTCIceCandidateInit[]; queue: Promise<void>; epoch: string; pendingSignals: number;
  iceRestartAttempts: number; lastIceRestartAt: number;
}
export interface HuddleDependencies {
  createPeerConnection?: (config: RTCConfiguration) => RTCPeerConnection;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  getDisplayMedia?: () => Promise<MediaStream>;
  createStream?: (tracks: MediaStreamTrack[]) => MediaStream;
  /** Optional RTC-only cohort gate. Virtual Space uses this to keep a huddle proximity-scoped. */
  peerFilter?: (participant: StudioLiveParticipant) => boolean;
  id?: () => string; now?: () => number;
}

/** Memory-only session. Starting never requests camera or microphone access. */
export class StudioP2pHuddleController {
  private readonly epoch: string;
  private readonly peers = new Map<string, HuddlePeer>();
  private readonly links = new Map<string, Link>();
  private readonly deferredSignals = new Map<string, Array<HuddlePacket & { kind: "description" | "ice" }>>();
  private mediaPeerScope: Set<string> | null = null;
  private readonly blocked = new Set<string>();
  private readonly seen = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private readonly messages: HuddleMessage[] = [];
  private state: HuddleState = { muted: true, camera: false, sharing: false, hand: false };
  private audioTrack: MediaStreamTrack | null = null;
  private videoTrack: MediaStreamTrack | null = null;
  private localStream: MediaStream | null = null;
  private cameraFacing: HuddleCameraFacingMode = "user";
  private mediaGeneration = { audio: 0, video: 0 };
  private unsubscribe: (() => void) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private error: string | null = null;
  private closed = false;
  private lastChatAt: number[] = [];
  private readonly inboundChat = new Map<string, number[]>();
  constructor(
    private readonly self: StudioLiveParticipant,
    private readonly port: StudioLiveDirectPort,
    private readonly deps: HuddleDependencies = {},
  ) { this.epoch = this.id(); }
  private id(): string { return this.deps.id?.() ?? crypto.randomUUID(); }
  private now(): number { return this.deps.now?.() ?? Date.now(); }
  private stream(tracks: MediaStreamTrack[]): MediaStream {
    return this.deps.createStream?.(tracks) ?? new MediaStream(tracks);
  }
  snapshot(): HuddleSnapshot {
    return { ...this.state, peers: [...this.peers.values()].map((p) => ({ ...p })),
      messages: this.messages.map((m) => ({ ...m, targets: [...m.targets], sent: [...m.sent], received: [...m.received] })),
      localStream: this.localStream, availablePeers: this.eligiblePeers().length,
      error: this.error, closed: this.closed, cameraFacing: this.cameraFacing };
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener); return () => { this.listeners.delete(listener); };
  }
  start(): void {
    if (this.closed || this.unsubscribe || this.self.role === "viewer") return;
    this.unsubscribe = this.port.subscribe((sender, raw) => this.receive(sender, raw));
    this.sync();
    this.timer = setInterval(() => this.sync(), 3_000);
  }
  private emit(): void { for (const listener of this.listeners) listener(); }
  private fail(message: string): void { this.error = message; this.emit(); }
  private eligiblePeers(): StudioLiveParticipant[] {
    return this.port.getPeers().filter((peer) =>
      peer.sessionId !== this.self.sessionId
      && peer.role !== "viewer"
      && !this.blocked.has(peer.sessionId)
      && (this.deps.peerFilter?.(peer) ?? true)
    );
  }
  private isEligiblePeer(peer: StudioLiveParticipant): boolean {
    return this.eligiblePeers().some((candidate) => candidate.sessionId === peer.sessionId);
  }
  /** Re-evaluate a dynamic cohort without reopening camera or microphone capture. */
  refreshPeers(): void { this.sync(); }
  private send(id: string, packet: HuddlePacket): boolean {
    return !this.closed && this.port.send(id, JSON.stringify(packet));
  }
  private announce(id?: string): void {
    const packet: HuddlePacket = { kind: "state", epoch: this.epoch, ...this.state };
    for (const peer of this.eligiblePeers()) {
      if (!id || id === peer.sessionId) this.send(peer.sessionId, packet);
    }
  }
  private sync(): void {
    if (this.closed) return;
    const available = new Set(this.eligiblePeers().map((p) => p.sessionId));
    for (const [id, peer] of this.peers) {
      if (!available.has(id) || this.now() - peer.lastSeen > 12_000) this.removePeer(id);
      else if (peer.reactionUntil < this.now()) peer.reaction = null;
    }
    for (const [id, link] of this.links) {
      if (link.pc.connectionState === "failed" || link.pc.connectionState === "disconnected") {
        this.restartLinkIce(id, link);
      }
    }
    this.announce(); this.emit();
  }
  private receive(sender: StudioLiveParticipant, raw: string): void {
    const id = sender.sessionId;
    if (this.closed || !this.isEligiblePeer(sender)) return;
    const packet = parseHuddlePacket(raw);
    if (!packet) return;
    if (packet.kind === "state") { this.receiveState(sender, packet); return; }
    const peer = this.peers.get(id);
    if (!peer || peer.epoch !== packet.epoch) return;
    if (packet.kind === "left") { this.removePeer(id); this.emit(); return; }
    if (packet.kind === "description" || packet.kind === "ice") {
      if (packet.toEpoch === this.epoch) {
        if (this.isMediaPeerAllowed(id)) this.enqueueSignal(id, packet);
        else this.deferSignal(id, packet);
      }
      return;
    }
    if (packet.kind === "ack") {
      const message = this.messages.find((m) => m.self && m.id === packet.id);
      if (message?.targets.includes(id) && !message.received.includes(id)) message.received.push(id);
    } else if (packet.kind === "chat" || packet.kind === "reaction") {
      const key = `${id}:${packet.epoch}:${packet.id}`;
      if (packet.kind === "chat") {
        const recent = (this.inboundChat.get(id) ?? []).filter((at) => this.now() - at < 10_000);
        if (recent.length >= 20) return;
        this.inboundChat.set(id, [...recent, this.now()]);
        this.send(id, { kind: "ack", epoch: this.epoch, id: packet.id });
      }
      if (this.seen.has(key)) return;
      this.seen.add(key);
      if (this.seen.size > 512) this.seen.delete(this.seen.values().next().value!);
      if (packet.kind === "chat") {
        this.messages.push({ id: key, author: id, name: sender.displayName, text: packet.text,
          self: false, at: this.now(), targets: [], sent: [], received: [] });
        this.trimHistory();
      } else { peer.reaction = packet.emoji; peer.reactionUntil = this.now() + 3_000; }
    }
    this.emit();
  }
  private receiveState(sender: StudioLiveParticipant, packet: HuddlePacket & { kind: "state" }): void {
    const id = sender.sessionId;
    let peer = this.peers.get(id);
    const fresh = !peer || peer.epoch !== packet.epoch;
    if (!peer && this.peers.size >= HUDDLE_MAX_REMOTE_PEERS) return;
    if (peer && fresh) this.removePeer(id);
    if (fresh) {
      peer = { participant: sender, epoch: packet.epoch, lastSeen: this.now(), stream: null,
        connection: "idle", reaction: null, reactionUntil: 0, ...this.state };
      this.peers.set(id, peer);
    }
    if (!peer) return;
    Object.assign(peer, { muted: packet.muted, camera: packet.camera,
      sharing: packet.sharing, hand: packet.hand, lastSeen: this.now(), participant: sender });
    if (fresh) this.announce(id);
    if (!peer.muted || peer.camera || peer.sharing || this.audioTrack || this.videoTrack) this.ensureLink(id);
    this.emit();
  }
  private trimHistory(): void {
    if (this.messages.length > HUDDLE_HISTORY_LIMIT) this.messages.splice(0, this.messages.length - HUDDLE_HISTORY_LIMIT);
  }
  sendChat(text: string): boolean {
    text = text.trim();
    this.lastChatAt = this.lastChatAt.filter((at) => this.now() - at < 10_000);
    if (this.closed || !text || text.length > HUDDLE_TEXT_LIMIT || this.lastChatAt.length >= 20) return false;
    const targets = [...this.peers.keys()];
    if (!targets.length) { this.fail("P2P 대화에 참여한 상대가 없습니다. 서버로 대체 전송하지 않습니다."); return false; }
    this.lastChatAt.push(this.now());
    const message: HuddleMessage = { id: this.id(), author: this.self.sessionId,
      name: this.self.displayName, text, self: true, at: this.now(), targets, sent: [], received: [] };
    this.messages.push(message); this.trimHistory();
    for (const id of targets) {
      if (this.send(id, { kind: "chat", epoch: this.epoch, id: message.id, text })) message.sent.push(id);
    }
    this.error = message.sent.length === targets.length ? null : "일부 상대에게 전송하지 못했습니다. 수신 확인 수를 확인해 주세요.";
    this.emit(); return message.sent.length > 0;
  }
  setHand(hand: boolean): void { this.state.hand = hand; this.announce(); this.emit(); }
  setMediaPeerScope(sessionIds: readonly string[] | null): void {
    this.mediaPeerScope = sessionIds === null
      ? null
      : new Set(sessionIds.filter((id) => id !== this.self.sessionId && !this.blocked.has(id)));
    for (const id of [...this.links.keys()]) {
      if (!this.isMediaPeerAllowed(id)) this.closeLink(id);
    }
    for (const [id, peer] of this.peers) {
      if (!this.isMediaPeerAllowed(id)) continue;
      this.flushDeferredSignals(id);
      if (!peer.muted || peer.camera || peer.sharing || this.audioTrack || this.videoTrack) {
        this.ensureLink(id);
      }
    }
    this.emit();
  }
  private isMediaPeerAllowed(id: string): boolean {
    return this.mediaPeerScope === null || this.mediaPeerScope.has(id);
  }
  react(emoji: HuddleReaction): void {
    const packet: HuddlePacket = { kind: "reaction", epoch: this.epoch, id: this.id(), emoji };
    for (const id of this.peers.keys()) this.send(id, packet);
  }
  block(id: string): void {
    this.send(id, { kind: "left", epoch: this.epoch });
    this.blocked.add(id); this.removePeer(id); this.emit();
  }
  private ensureLink(id: string): Link | null {
    const peer = this.peers.get(id);
    if (this.closed || !peer || !this.isMediaPeerAllowed(id)) return null;
    const existing = this.links.get(id);
    if (existing) return existing;
    try {
      const pc = this.deps.createPeerConnection?.(huddleRtcConfiguration())
        ?? new RTCPeerConnection(huddleRtcConfiguration());
      const link: Link = { pc, audio: pc.addTransceiver("audio", { direction: "sendrecv" }).sender,
        video: pc.addTransceiver("video", { direction: "sendrecv" }).sender, makingOffer: false,
        ignoreOffer: false, settingAnswer: false, pendingIce: [], queue: Promise.resolve(), epoch: peer.epoch, pendingSignals: 0,
        iceRestartAttempts: 0, lastIceRestartAt: 0 };
      this.links.set(id, link);
      pc.onicecandidate = ({ candidate }) => {
        if (candidate && this.links.get(id) === link) this.send(id,
          { kind: "ice", epoch: this.epoch, toEpoch: link.epoch, candidate: candidate.toJSON() });
      };
      pc.ontrack = ({ track }) => {
        if (this.links.get(id) !== link) return;
        const tracks = (peer.stream?.getTracks() ?? []).filter((t) => t.kind !== track.kind);
        peer.stream = this.stream([...tracks, track]); this.emit();
      };
      pc.onconnectionstatechange = () => {
        if (this.links.get(id) !== link) return;
        peer.connection = pc.connectionState;
        if (pc.connectionState === "connected") {
          link.iceRestartAttempts = 0;
          link.lastIceRestartAt = 0;
          this.error = null;
        } else if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          this.restartLinkIce(id, link);
        }
        this.emit();
      };
      pc.onnegotiationneeded = () => {
        link.queue = link.queue.then(async () => {
          if (this.links.get(id) !== link || pc.signalingState !== "stable") return;
          try {
            link.makingOffer = true;
            await pc.setLocalDescription();
            if (this.links.get(id) === link) this.sendDescription(id, link);
          } finally { link.makingOffer = false; }
        }).catch(() => this.signalError(id, link));
      };
      void Promise.all([link.audio.replaceTrack(this.audioTrack), link.video.replaceTrack(this.videoTrack)])
        .catch(() => this.signalError(id, link));
      return link;
    } catch { this.fail("이 브라우저에서 WebRTC 통화를 준비하지 못했습니다."); return null; }
  }
  private sendDescription(id: string, link: Link): void {
    const description = link.pc.localDescription;
    if (!description || (description.type !== "offer" && description.type !== "answer")) return;
    if (!this.send(id, { kind: "description", epoch: this.epoch, toEpoch: link.epoch,
      type: description.type, sdp: description.sdp })) this.signalError(id, link);
  }
  private signalError(id: string, link: Link): void {
    if (!this.closed && this.links.get(id) === link) this.fail("통화 연결 신호를 처리하지 못했습니다. 나간 뒤 재참여해 주세요.");
  }
  private restartLinkIce(id: string, link: Link): boolean {
    if (this.closed || this.links.get(id) !== link) return false;
    const state = link.pc.connectionState;
    if (state !== "failed" && state !== "disconnected") return false;
    const now = this.now();
    if (now - link.lastIceRestartAt < 4_000) return false;
    if (link.iceRestartAttempts >= 3) {
      this.error = "직접 통화 연결을 자동 복구하지 못했습니다. 네트워크를 확인하거나 P2P 대화에 다시 참여해 주세요. TURN 중계는 사용하지 않습니다.";
      return false;
    }
    link.lastIceRestartAt = now;
    link.iceRestartAttempts += 1;
    this.error = "네트워크 변경을 감지해 직접 통화 연결을 복구하는 중입니다.";
    try {
      if (typeof link.pc.restartIce === "function") {
        link.pc.restartIce();
      } else {
        link.queue = link.queue.then(async () => {
          if (this.links.get(id) !== link || link.pc.signalingState !== "stable") return;
          const offer = await link.pc.createOffer({ iceRestart: true });
          await link.pc.setLocalDescription(offer);
          if (this.links.get(id) === link) this.sendDescription(id, link);
        }).catch(() => this.signalError(id, link));
      }
      return true;
    } catch {
      this.signalError(id, link);
      return false;
    }
  }
  resume(): void {
    if (this.closed) return;
    this.sync();
    for (const [id, link] of this.links) {
      if (link.pc.connectionState === "failed" || link.pc.connectionState === "disconnected") {
        this.restartLinkIce(id, link);
      }
    }
  }
  private deferSignal(id: string, packet: HuddlePacket & { kind: "description" | "ice" }): void {
    const pending = this.deferredSignals.get(id) ?? [];
    if (pending.length >= 96) pending.shift();
    pending.push(packet);
    this.deferredSignals.set(id, pending);
  }
  private flushDeferredSignals(id: string): void {
    if (!this.isMediaPeerAllowed(id)) return;
    const pending = this.deferredSignals.get(id);
    if (!pending?.length) return;
    this.deferredSignals.delete(id);
    for (const packet of pending) this.enqueueSignal(id, packet);
  }
  private enqueueSignal(id: string, packet: HuddlePacket & { kind: "description" | "ice" }): void {
    const link = this.ensureLink(id);
    if (!link || link.pendingSignals >= 96) return;
    link.pendingSignals += 1;
    link.queue = link.queue.then(async () => {
      if (this.links.get(id) !== link) return;
      const pc = link.pc;
      if (packet.kind === "ice") {
        if (link.ignoreOffer) return;
        if (!pc.remoteDescription) {
          if (link.pendingIce.length < 64) link.pendingIce.push(packet.candidate);
        } else await pc.addIceCandidate(packet.candidate);
        return;
      }
      const collision = packet.type === "offer" && (link.makingOffer
        || (pc.signalingState !== "stable" && !link.settingAnswer));
      link.ignoreOffer = this.self.sessionId < id && collision;
      if (link.ignoreOffer) { link.pendingIce = []; return; }
      link.settingAnswer = packet.type === "answer";
      try { await pc.setRemoteDescription({ type: packet.type, sdp: packet.sdp }); }
      finally { link.settingAnswer = false; }
      if (this.links.get(id) !== link) return;
      for (const candidate of link.pendingIce.splice(0)) await pc.addIceCandidate(candidate);
      if (packet.type === "offer") {
        await pc.setLocalDescription();
        if (this.links.get(id) === link) this.sendDescription(id, link);
      }
    }).catch(() => this.signalError(id, link)).finally(() => { link.pendingSignals -= 1; });
  }
  async setMicrophone(enabled: boolean): Promise<void> {
    const generation = ++this.mediaGeneration.audio;
    if (!enabled) { this.stopTrack("audio"); this.publishMedia(); return; }
    if (this.closed || !this.unsubscribe) return;
    try {
      const constraints = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false };
      const stream = await (this.deps.getUserMedia?.(constraints) ?? navigator.mediaDevices.getUserMedia(constraints));
      this.acceptCapture("audio", stream, generation, false);
    } catch { if (!this.closed && generation === this.mediaGeneration.audio) this.fail("마이크를 켜지 못했습니다. 브라우저 권한과 장치를 확인해 주세요."); }
  }
  async setVideo(
    mode: "camera" | "screen" | null,
    facingMode: HuddleCameraFacingMode = this.cameraFacing,
  ): Promise<void> {
    const generation = ++this.mediaGeneration.video;
    if (!mode) { this.stopTrack("video"); this.publishMedia(); return; }
    if (this.closed || !this.unsubscribe) return;
    try {
      const constraints = { video: { width: { ideal: 640, max: 1280 }, height: { ideal: 360, max: 720 },
        frameRate: { ideal: 15, max: 24 }, facingMode: { ideal: facingMode } }, audio: false };
      const stream = mode === "screen"
        ? await (this.deps.getDisplayMedia?.() ?? navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { max: 15 } }, audio: false }))
        : await (this.deps.getUserMedia?.(constraints) ?? navigator.mediaDevices.getUserMedia(constraints));
      this.acceptCapture("video", stream, generation, mode === "screen", mode === "camera" ? facingMode : undefined);
    } catch { if (!this.closed && generation === this.mediaGeneration.video) this.fail("영상을 켜지 못했거나 공유를 취소했습니다. 브라우저 권한을 확인해 주세요."); }
  }
  private acceptCapture(
    kind: "audio" | "video",
    stream: MediaStream,
    generation: number,
    sharing: boolean,
    facingMode?: HuddleCameraFacingMode,
  ): void {
    const track = stream.getTracks().find((t) => t.kind === kind);
    if (this.closed || generation !== this.mediaGeneration[kind] || !track) {
      stream.getTracks().forEach((t) => t.stop()); return;
    }
    stream.getTracks().filter((t) => t !== track).forEach((t) => t.stop());
    this.stopTrack(kind);
    if (kind === "audio") { this.audioTrack = track; this.state.muted = false; }
    else {
      this.videoTrack = track; this.state.camera = !sharing; this.state.sharing = sharing;
      if (!sharing && facingMode) this.cameraFacing = facingMode;
    }
    track.onended = () => {
      if ((kind === "audio" ? this.audioTrack : this.videoTrack) !== track) return;
      this.stopTrack(kind); this.publishMedia();
    };
    this.error = null; this.publishMedia();
  }
  private stopTrack(kind: "audio" | "video"): void {
    const track = kind === "audio" ? this.audioTrack : this.videoTrack;
    if (track) { track.onended = null; track.stop(); }
    if (kind === "audio") { this.audioTrack = null; this.state.muted = true; }
    else { this.videoTrack = null; this.state.camera = false; this.state.sharing = false; }
  }
  private publishMedia(): void {
    const tracks = [this.audioTrack, this.videoTrack].filter((t): t is MediaStreamTrack => t !== null);
    this.localStream = tracks.length ? this.stream(tracks) : null;
    if (this.closed) return;
    if (tracks.length) for (const id of this.peers.keys()) this.ensureLink(id);
    for (const [id, link] of this.links) {
      void Promise.all([link.audio.replaceTrack(this.audioTrack), link.video.replaceTrack(this.videoTrack)])
        .catch(() => this.signalError(id, link));
    }
    this.announce(); this.emit();
  }
  private closeLink(id: string): void {
    const link = this.links.get(id);
    this.links.delete(id);
    if (link) {
      link.pc.onicecandidate = null; link.pc.ontrack = null;
      link.pc.onnegotiationneeded = null; link.pc.onconnectionstatechange = null;
      link.pc.close();
    }
    const peer = this.peers.get(id);
    if (peer) { peer.stream = null; peer.connection = "idle"; }
  }
  private removePeer(id: string): void {
    this.closeLink(id);
    this.deferredSignals.delete(id);
    this.peers.delete(id); this.inboundChat.delete(id);
  }
  close(): void {
    if (this.closed) return;
    for (const id of this.peers.keys()) this.send(id, { kind: "left", epoch: this.epoch });
    this.closed = true;
    ++this.mediaGeneration.audio; ++this.mediaGeneration.video;
    this.stopTrack("audio"); this.stopTrack("video"); this.localStream = null;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null; this.unsubscribe?.(); this.unsubscribe = null;
    for (const id of [...this.peers.keys()]) this.removePeer(id);
    this.messages.length = 0; this.seen.clear(); this.blocked.clear();
    this.emit(); this.listeners.clear();
  }
}
