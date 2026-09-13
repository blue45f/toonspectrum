import { HuddleActivities, parseHuddleActivity, type HuddleActivityView } from "./studio-p2p-activities";
import { StudioP2pHuddleController, type HuddleDependencies, type HuddleSnapshot } from "./studio-p2p-huddle-controller";
import type { StudioLiveParticipant } from "../studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../studio-live-direct-port";

export interface CreativeHuddleSnapshot extends HuddleSnapshot { activities: HuddleActivityView[] }
/** Extends the established consent/media lifecycle without changing the document transport. */
export class StudioP2pCreativeHuddleController extends StudioP2pHuddleController {
  private readonly activities: HuddleActivities;
  private readonly bridge: { epoch: string; active: boolean };
  private readonly creativeListeners = new Set<() => void>();
  private readonly peerEpochs = new Map<string, string>();
  private offActivities: (() => void) | null = null;
  private activityError: string | null = null;
  constructor(private readonly creativeSelf: StudioLiveParticipant,
    private readonly creativePort: StudioLiveDirectPort, deps: HuddleDependencies = {}) {
    const bridge = { epoch: "", active: false };
    let activities: HuddleActivities | null = null;
    super(creativeSelf, { getPeers: () => creativePort.getPeers(), subscribe: (fn) => creativePort.subscribe(fn),
      send: (target, raw) => {
        const packet = JSON.parse(raw) as { kind: string; epoch: string };
        if (packet.kind === "state") bridge.epoch = packet.epoch;
        const sent = creativePort.send(target, raw);
        if (sent && bridge.active && packet.kind === "state") activities?.sync(target);
        return sent;
      } }, deps);
    this.bridge = bridge;
    this.activities = new HuddleActivities(creativeSelf.sessionId, () => deps.now?.() ?? performance.now(),
      () => deps.id?.() ?? crypto.randomUUID(), () => super.snapshot().peers.map((p) => p.participant.sessionId),
      (target, state) => bridge.active && creativePort.send(target, JSON.stringify({ kind: "activity", epoch: bridge.epoch, state })));
    activities = this.activities;
  }
  private alignPeers(snapshot: HuddleSnapshot): void {
    const current = new Map(snapshot.peers.map((p) => [p.participant.sessionId, p.epoch]));
    for (const [id, epoch] of this.peerEpochs) {
      if (current.get(id) !== epoch) this.activities.remove(id);
    }
    this.peerEpochs.clear(); for (const [id, epoch] of current) this.peerEpochs.set(id, epoch);
  }
  override snapshot(): CreativeHuddleSnapshot {
    const snapshot = super.snapshot(); this.alignPeers(snapshot);
    return { ...snapshot, error: this.activityError ?? snapshot.error, activities: this.activities.snapshot() };
  }
  override subscribe(listener: () => void): () => void {
    const off = super.subscribe(listener); this.creativeListeners.add(listener);
    return () => { off(); this.creativeListeners.delete(listener); };
  }
  private emitActivities(): void { for (const listener of this.creativeListeners) listener(); }
  override start(): void {
    if (this.bridge.active || super.snapshot().closed || this.creativeSelf.role === "viewer") return;
    super.start(); this.bridge.active = true;
    this.offActivities = this.creativePort.subscribe((sender, raw) => {
      if (!this.bridge.active || typeof raw !== "string" || raw.length > 8_192) return;
      const snapshot = super.snapshot(); this.alignPeers(snapshot);
      const peer = snapshot.peers.find((p) => p.participant.sessionId === sender.sessionId);
      if (!peer || sender.role === "viewer") return;
      let packet: { kind?: unknown; epoch?: unknown; state?: unknown };
      try { packet = JSON.parse(raw); } catch { return; }
      if (!packet || packet.kind !== "activity" || packet.epoch !== peer.epoch) return;
      const state = parseHuddleActivity(packet.state);
      if (state) { this.activities.receive(sender.sessionId, state); this.emitActivities(); }
    });
    this.activities.sync(); this.emitActivities();
  }
  private action(run: () => boolean): boolean {
    if (!this.bridge.active || super.snapshot().closed) return false;
    this.alignPeers(super.snapshot()); const sent = run();
    this.activityError = sent ? null : "활동 전송을 확인하지 못했습니다. 입력·참여자를 확인해 주세요. 연결이 회복되면 현재 상태를 다시 보냅니다.";
    this.emitActivities(); return sent;
  }
  startChallenge(id: string): boolean { return this.action(() => this.activities.startChallenge(id)); }
  toggleChallenge(): boolean { return this.action(() => this.activities.toggleChallenge()); }
  clearChallenge(): boolean { return this.action(() => this.activities.clearChallenge()); }
  createPoll(question: string, options: string[]): boolean { return this.action(() => this.activities.createPoll(question, options)); }
  clearPoll(): boolean { return this.action(() => this.activities.clearPoll()); }
  vote(owner: string, choice: number): boolean { return this.action(() => this.activities.vote(owner, choice)); }
  override close(): void {
    this.bridge.active = false; this.offActivities?.(); this.offActivities = null;
    this.activities.clear(); this.peerEpochs.clear(); this.activityError = null;
    super.close(); this.creativeListeners.clear();
  }
}
