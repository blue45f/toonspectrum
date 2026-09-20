import type { StudioLiveParticipant } from "../live/studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../live/studio-live-direct-port";

export const STUDIO_CONVERSATION_WIRE = "toonspectrum-space-conversation-v1";
export const STUDIO_CONVERSATION_PROPOSAL_TTL = 20_000;
export const STUDIO_CONVERSATION_LIVENESS_TTL = 6_500;
const PULSE_MS = 2_000;
const MAX_PEERS = 23;
const MAX_RECORDS = 32;
const MAX_PENDING = 4;
type Kind = "hello" | "propose" | "accept" | "pulse" | "leave";
export type StudioConversationStatus = "offered" | "waiting" | "ready" | "declined" | "left" | "expired" | "disconnected" | "failed";

export interface StudioConversationScope {
  readonly id: string;
  /** Sorted, immutable and includes the local participant. Membership changes create a new ID. */
  readonly memberIds: readonly string[];
}
interface Proposal extends StudioConversationScope {
  readonly initiatorId: string;
  readonly initiatorInstanceId: string;
  readonly ordinal: number;
}
export interface StudioConversationPacket {
  readonly wire: typeof STUDIO_CONVERSATION_WIRE;
  readonly kind: Kind;
  readonly worldId: string;
  readonly contentRevision: string;
  readonly senderSessionId: string;
  readonly targetSessionId: string;
  readonly senderInstanceId: string;
  readonly sessionEpoch: string;
  readonly targetEpoch: string | null;
  readonly sequence: number;
  readonly proposal: Proposal | null;
}
export interface StudioConversationRecord extends Proposal {
  readonly status: StudioConversationStatus;
  readonly localAccepted: boolean;
  readonly acceptedIds: readonly string[];
  readonly members: readonly StudioLiveParticipant[];
  readonly canAccept: boolean;
}
export interface StudioConversationSnapshot {
  readonly available: boolean;
  readonly readyPeers: readonly StudioLiveParticipant[];
  readonly records: readonly StudioConversationRecord[];
  readonly active: StudioConversationScope | null;
}
export interface StudioConversationDependencies {
  readonly instanceId?: string;
  readonly now?: () => number;
  readonly setInterval?: (callback: () => void, delay: number) => unknown;
  readonly clearInterval?: (handle: unknown) => void;
  readonly onReady?: (scope: StudioConversationScope) => void;
  readonly onClosed?: (scope: StudioConversationScope) => void;
}

const safeId = (value: unknown, limit = 160): value is string => typeof value === "string"
  && value.length > 0 && value.length <= limit && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value);
const positiveInteger = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const packetKeys = new Set(["wire", "kind", "worldId", "contentRevision", "senderSessionId", "targetSessionId", "senderInstanceId", "sessionEpoch", "targetEpoch", "sequence", "proposal"]);
const proposalKeys = new Set(["id", "memberIds", "initiatorId", "initiatorInstanceId", "ordinal"]);
function validMembers(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length >= 2 && value.length <= 4
    && value.every((id, index) => safeId(id) && (index === 0 || value[index - 1] < id));
}
const sameProposal = (a: Proposal, b: Proposal) => a.id === b.id && a.initiatorId === b.initiatorId
  && a.initiatorInstanceId === b.initiatorInstanceId && a.ordinal === b.ordinal
  && a.memberIds.length === b.memberIds.length && a.memberIds.every((id, index) => id === b.memberIds[index]);
const scopeOf = (proposal: Proposal): StudioConversationScope => Object.freeze({ id: proposal.id, memberIds: Object.freeze([...proposal.memberIds]) });

export function parseStudioConversationPacket(raw: string): StudioConversationPacket | null {
  if (typeof raw !== "string" || raw.length > 4_096 || new TextEncoder().encode(raw).byteLength > 4_096) return null;
  let value: unknown; try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const packet = value as Record<string, unknown>;
  if (Object.keys(packet).length !== packetKeys.size || Object.keys(packet).some((key) => !packetKeys.has(key))
    || packet.wire !== STUDIO_CONVERSATION_WIRE || typeof packet.kind !== "string" || !["hello", "propose", "accept", "pulse", "leave"].includes(packet.kind)
    || !safeId(packet.worldId) || typeof packet.contentRevision !== "string" || !/^[a-f0-9]{64}$/u.test(packet.contentRevision)
    || !safeId(packet.senderSessionId) || !safeId(packet.targetSessionId) || packet.senderSessionId === packet.targetSessionId
    || !safeId(packet.senderInstanceId, 64) || !safeId(packet.sessionEpoch, 80) || !positiveInteger(packet.sequence)) return null;
  if (packet.kind === "hello") {
    if (packet.proposal !== null || (packet.targetEpoch !== null && !safeId(packet.targetEpoch, 80))) return null;
  } else {
    if (!safeId(packet.targetEpoch, 80) || !packet.proposal || typeof packet.proposal !== "object" || Array.isArray(packet.proposal)) return null;
    const proposal = packet.proposal as Record<string, unknown>;
    if (Object.keys(proposal).length !== proposalKeys.size || Object.keys(proposal).some((key) => !proposalKeys.has(key))
      || !validMembers(proposal.memberIds) || !safeId(proposal.initiatorId) || !safeId(proposal.initiatorInstanceId, 64)
      || !positiveInteger(proposal.ordinal) || proposal.id !== `${proposal.initiatorInstanceId}.${proposal.ordinal}`
      || !proposal.memberIds.includes(proposal.initiatorId) || !proposal.memberIds.includes(packet.senderSessionId)
      || !proposal.memberIds.includes(packet.targetSessionId)
      || (packet.kind === "propose" && (packet.senderSessionId !== proposal.initiatorId || packet.senderInstanceId !== proposal.initiatorInstanceId))) return null;
  }
  return packet as unknown as StudioConversationPacket;
}

interface PeerEpoch {
  localEpoch: string;
  epoch: string | null;
  instanceId: string | null;
  sequence: number;
  lastProposal: number;
  retired: Set<string>;
  helloSent: boolean;
  windowAt: number;
  count: number;
}
interface RecordState {
  proposal: Proposal;
  status: StudioConversationStatus;
  localAccepted: boolean;
  votes: Set<string>;
  lastSeen: Map<string, number>;
  expiresAt: number;
  nextPulse: number;
}
const pending = (record: RecordState) => record.status === "offered" || record.status === "waiting";
const live = (record: RecordState) => pending(record) || record.status === "ready";

/** Every roster member authenticates its own vote directly; no host can commit on their behalf. */
export class StudioVirtualConversationController {
  private readonly instanceId: string;
  private readonly peers = new Map<string, PeerEpoch>();
  private readonly records = new Map<string, RecordState>();
  private readonly early = new Map<string, { proposal: Proposal; senderId: string; kind: "accept" | "leave"; receivedAt: number }>();
  private readonly blocked = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private sequence = 0;
  private ordinal = 0;
  private linkGeneration = 0;
  private activeId: string | null = null;
  private closed = false;
  private unsubscribe: (() => void) | null = null;
  private timer: unknown;

  constructor(private readonly self: StudioLiveParticipant, private readonly port: StudioLiveDirectPort,
    private readonly world: { readonly worldId: string; readonly contentRevision: string },
    private readonly dependencies: StudioConversationDependencies = {}) {
    this.instanceId = dependencies.instanceId ?? globalThis.crypto.randomUUID();
    if (!safeId(self.sessionId) || !safeId(this.instanceId, 64) || !safeId(world.worldId) || !/^[a-f0-9]{64}$/u.test(world.contentRevision)) throw new TypeError("Invalid conversation identity");
    this.self = Object.freeze({ ...self }); this.world = Object.freeze({ ...world });
  }
  private now() { return this.dependencies.now?.() ?? performance.now(); }
  private availablePeers() { return this.port.getPeers().filter((peer) => peer.sessionId !== this.self.sessionId && peer.role !== "viewer" && safeId(peer.sessionId) && !this.blocked.has(peer.sessionId)).slice(0, MAX_PEERS); }
  private newPeer(): PeerEpoch { return { localEpoch: `${this.instanceId}:${++this.linkGeneration}`, epoch: null, instanceId: null, sequence: 0, lastProposal: 0, retired: new Set(), helloSent: false, windowAt: this.now(), count: 0 }; }
  private memberReady(id: string) { return id === this.self.sessionId || Boolean(this.peers.get(id)?.epoch && this.availablePeers().some((peer) => peer.sessionId === id)); }
  private emit() { for (const listener of this.listeners) listener(); }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  snapshot(): StudioConversationSnapshot {
    const participants = new Map([this.self, ...this.availablePeers()].map((peer) => [peer.sessionId, peer]));
    return Object.freeze({
      available: !this.closed && this.unsubscribe !== null && this.self.role !== "viewer",
      readyPeers: Object.freeze(this.availablePeers().filter((peer) => this.memberReady(peer.sessionId)).map((peer) => Object.freeze({ ...peer }))),
      active: this.activeId ? scopeOf(this.records.get(this.activeId)!.proposal) : null,
      records: Object.freeze([...this.records.values()].reverse().map((record) => Object.freeze({ ...record.proposal,
        memberIds: Object.freeze([...record.proposal.memberIds]), status: record.status, localAccepted: record.localAccepted,
        acceptedIds: Object.freeze([...record.votes].sort()), canAccept: !record.localAccepted && pending(record) && record.proposal.memberIds.every((id) => this.memberReady(id)),
        members: Object.freeze(record.proposal.memberIds.map((id) => Object.freeze({ ...(participants.get(id) ?? { sessionId: id, displayName: id, role: "viewer" as const }) }))),
      }))),
    });
  }
  start() {
    if (this.closed || this.unsubscribe || this.self.role === "viewer") return;
    this.unsubscribe = this.port.subscribe((sender, raw) => this.receive(sender, raw));
    this.sync();
    this.timer = this.dependencies.setInterval?.(() => this.sync(), 250) ?? globalThis.setInterval(() => this.sync(), 250);
    this.emit();
  }
  sync() {
    if (this.closed || !this.unsubscribe) return;
    const available = new Set(this.availablePeers().map((peer) => peer.sessionId));
    for (const id of this.peers.keys()) if (!available.has(id)) { this.endPeer(id); this.peers.delete(id); }
    for (const id of available) {
      let peer = this.peers.get(id); if (!peer) { peer = this.newPeer(); this.peers.set(id, peer); }
      if (!peer.helloSent) peer.helloSent = this.send(id, "hello", null, null);
    }
    for (const record of this.records.values()) {
      if (!live(record)) continue;
      if (pending(record) && this.now() >= record.expiresAt) { this.end(record, "expired", true); continue; }
      if (record.status === "ready" && record.proposal.memberIds.some((id) => id !== this.self.sessionId && this.now() - (record.lastSeen.get(id) ?? -Infinity) >= STUDIO_CONVERSATION_LIVENESS_TTL)) { this.end(record, "disconnected", true); continue; }
      if (record.localAccepted && this.now() >= record.nextPulse) {
        record.nextPulse = this.now() + PULSE_MS;
        if (!this.broadcast(record.proposal, "pulse")) this.end(record, "disconnected", true);
      }
    }
    for (const [key, item] of this.early) if (this.now() - item.receivedAt >= STUDIO_CONVERSATION_PROPOSAL_TTL) this.early.delete(key);
    this.emit();
  }
  propose(memberIds: readonly string[]): string | null {
    this.sync();
    const sorted = [...memberIds].sort();
    if (!this.snapshot().available || !validMembers(sorted) || !sorted.includes(this.self.sessionId)
      || !sorted.every((id) => this.memberReady(id)) || [...this.records.values()].filter(pending).length >= MAX_PENDING) return null;
    const ordinal = ++this.ordinal;
    const proposal: Proposal = Object.freeze({ id: `${this.instanceId}.${ordinal}`, initiatorId: this.self.sessionId, initiatorInstanceId: this.instanceId, ordinal, memberIds: Object.freeze(sorted) });
    const record = this.create(proposal, true);
    if (!this.store(record)) return null;
    if (!this.broadcast(proposal, "propose")) { this.end(record, "failed", true); return null; }
    this.emit(); return proposal.id;
  }
  respond(id: string, answer: "accept" | "decline"): boolean {
    this.sync(); const record = this.records.get(id);
    if (this.closed || !record || !pending(record) || record.localAccepted) return false;
    if (answer === "decline") { this.end(record, "declined", true); return true; }
    if (answer !== "accept" || !record.proposal.memberIds.every((member) => this.memberReady(member))) return false;
    record.localAccepted = true; record.status = "waiting"; record.votes.add(this.self.sessionId); record.nextPulse = this.now() + PULSE_MS;
    if (!this.broadcast(record.proposal, "accept")) { this.end(record, "failed", true); return false; }
    this.tryReady(record); this.emit(); return true;
  }
  leave(id: string): boolean { const record = this.records.get(id); if (!record || !live(record)) return false; this.end(record, "left", true); return true; }
  setBlockedPeers(ids: readonly string[]) {
    this.blocked.clear(); for (const id of ids.slice(0, 128)) if (safeId(id)) this.blocked.add(id);
    this.sync();
  }
  close() {
    if (this.closed) return;
    for (const record of this.records.values()) if (live(record)) this.end(record, "left", true);
    this.closed = true; this.unsubscribe?.(); this.unsubscribe = null;
    if (this.dependencies.clearInterval) this.dependencies.clearInterval(this.timer); else globalThis.clearInterval(this.timer as ReturnType<typeof setInterval>);
    this.peers.clear(); this.early.clear(); this.emit(); this.listeners.clear();
  }
  private create(proposal: Proposal, localAccepted: boolean): RecordState {
    return { proposal: Object.freeze({ ...proposal, memberIds: Object.freeze([...proposal.memberIds]) }), status: localAccepted ? "waiting" : "offered", localAccepted,
      votes: new Set([proposal.initiatorId]), lastSeen: new Map([[proposal.initiatorId, this.now()]]), expiresAt: this.now() + STUDIO_CONVERSATION_PROPOSAL_TTL, nextPulse: this.now() + PULSE_MS };
  }
  private store(record: RecordState): boolean {
    if (this.records.size >= MAX_RECORDS) {
      const oldest = [...this.records].find(([, candidate]) => !live(candidate));
      if (!oldest) return false; this.records.delete(oldest[0]);
    }
    this.records.set(record.proposal.id, record); return true;
  }
  private send(target: string, kind: Kind, proposal: Proposal | null, targetEpoch = this.peers.get(target)?.epoch ?? null): boolean {
    const peer = this.peers.get(target);
    if (this.closed || !peer || (kind !== "hello" && !targetEpoch)) return false;
    const packet: StudioConversationPacket = { wire: STUDIO_CONVERSATION_WIRE, ...this.world, kind, proposal,
      senderSessionId: this.self.sessionId, targetSessionId: target, senderInstanceId: this.instanceId,
      sessionEpoch: peer.localEpoch, targetEpoch, sequence: ++this.sequence };
    try { return this.port.send(target, JSON.stringify(packet)); } catch { return false; }
  }
  private broadcast(proposal: Proposal, kind: Exclude<Kind, "hello">): boolean {
    let sent = true;
    for (const id of proposal.memberIds) if (id !== this.self.sessionId && !this.send(id, kind, proposal)) sent = false;
    return sent;
  }
  private end(record: RecordState, status: StudioConversationStatus, broadcast: boolean) {
    if (!live(record)) return;
    const active = this.activeId === record.proposal.id;
    record.status = status;
    if (active) this.activeId = null;
    if (broadcast) this.broadcast(record.proposal, "leave");
    if (active) this.dependencies.onClosed?.(scopeOf(record.proposal));
    this.emit();
  }
  private endPeer(id: string) {
    for (const record of this.records.values()) if (record.proposal.memberIds.includes(id)) this.end(record, "disconnected", true);
    for (const [key, item] of this.early) if (item.proposal.memberIds.includes(id)) this.early.delete(key);
  }
  private tryReady(record: RecordState) {
    if (!pending(record) || !record.localAccepted || !record.proposal.memberIds.every((id) => this.memberReady(id) && record.votes.has(id)
      && (id === this.self.sessionId || this.now() - (record.lastSeen.get(id) ?? -Infinity) < STUDIO_CONVERSATION_LIVENESS_TTL))) return;
    if (this.activeId && this.activeId !== record.proposal.id) this.end(this.records.get(this.activeId)!, "left", true);
    record.status = "ready"; this.activeId = record.proposal.id; this.emit();
    this.dependencies.onReady?.(scopeOf(record.proposal));
  }
  private receive(sender: StudioLiveParticipant, raw: string) {
    if (this.closed || !this.unsubscribe || sender.role === "viewer" || !this.availablePeers().some((peer) => peer.sessionId === sender.sessionId)) return;
    const packet = parseStudioConversationPacket(raw);
    if (!packet || packet.senderSessionId !== sender.sessionId || packet.targetSessionId !== this.self.sessionId
      || packet.worldId !== this.world.worldId || packet.contentRevision !== this.world.contentRevision) return;
    let peer = this.peers.get(sender.sessionId);
    if (!peer) { peer = this.newPeer(); this.peers.set(sender.sessionId, peer); }
    if (packet.targetEpoch !== null && packet.targetEpoch !== peer.localEpoch) return;
    if (this.now() - peer.windowAt >= 3_000) { peer.windowAt = this.now(); peer.count = 0; }
    if (++peer.count > 64 || peer.retired.has(packet.sessionEpoch)) return;
    if (packet.kind === "hello") {
      if (packet.targetEpoch === null) this.send(sender.sessionId, "hello", null, packet.sessionEpoch);
      else if (peer.epoch !== packet.sessionEpoch) {
        if (peer.retired.size >= 8) {
          this.endPeer(sender.sessionId); peer = this.newPeer(); this.peers.set(sender.sessionId, peer);
          peer.helloSent = this.send(sender.sessionId, "hello", null, null); this.emit(); return;
        }
        if (peer.epoch) { peer.retired.add(peer.epoch); this.endPeer(sender.sessionId); }
        if (peer.instanceId !== packet.senderInstanceId) peer.lastProposal = 0;
        peer.epoch = packet.sessionEpoch; peer.instanceId = packet.senderInstanceId; peer.sequence = packet.sequence; peer.helloSent = true;
        this.send(sender.sessionId, "hello", null, packet.sessionEpoch); this.emit();
      }
      return;
    }
    if (peer.epoch !== packet.sessionEpoch || peer.instanceId !== packet.senderInstanceId || packet.sequence <= peer.sequence) return;
    peer.sequence = packet.sequence;
    const proposal = packet.proposal!;
    const initiator = proposal.initiatorId === this.self.sessionId ? this.instanceId : this.peers.get(proposal.initiatorId)?.instanceId;
    if (initiator !== proposal.initiatorInstanceId || proposal.memberIds.some((id) => this.blocked.has(id))) return;
    let record = this.records.get(proposal.id);
    if (packet.kind === "propose") {
      if (record || proposal.ordinal <= peer.lastProposal) return;
      peer.lastProposal = proposal.ordinal;
      record = this.create(proposal, false);
      if (!this.store(record)) return;
      if ([...this.records.values()].filter(pending).length > MAX_PENDING) { this.end(record, "declined", true); return; }
      for (const [key, early] of this.early) if (early.proposal.id === proposal.id) {
        this.early.delete(key);
        if (!sameProposal(early.proposal, proposal)) continue;
        if (early.kind === "leave") this.end(record, "left", true);
        else { record.votes.add(early.senderId); record.lastSeen.set(early.senderId, early.receivedAt); }
      }
      this.emit(); return;
    }
    if (!record) {
      if ((packet.kind === "accept" || packet.kind === "leave") && this.early.size < 32
        && proposal.initiatorId !== this.self.sessionId && proposal.ordinal > (this.peers.get(proposal.initiatorId)?.lastProposal ?? 0)) {
        this.early.set(`${proposal.id}/${sender.sessionId}`, { proposal, senderId: sender.sessionId, kind: packet.kind, receivedAt: this.now() });
      }
      return;
    }
    if (!live(record) || !sameProposal(record.proposal, proposal)) return;
    if (pending(record) && this.now() >= record.expiresAt) { this.end(record, "expired", true); return; }
    if (packet.kind === "leave") { this.end(record, "left", true); return; }
    if (packet.kind === "accept") record.votes.add(sender.sessionId);
    if (record.votes.has(sender.sessionId)) record.lastSeen.set(sender.sessionId, this.now());
    this.tryReady(record); this.emit();
  }
}
