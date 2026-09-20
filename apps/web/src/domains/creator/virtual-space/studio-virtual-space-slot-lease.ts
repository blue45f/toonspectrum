import type { StudioLiveLockLease, StudioLiveParticipant } from "../live/studio-live-collaboration-protocol";
import type { StudioLiveRoom } from "../live/studio-live-collaboration-room";

export const STUDIO_SLOT_LEASE_MS = 15_000;
export const STUDIO_SLOT_RENEW_MS = 5_000;
const SLOT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u;
const CONTENT_REVISION = /^[a-f0-9]{64}$/u;
const PREFIX = "virtual-slot:";

export function studioVirtualSlotResource(contentRevision: string, slotId: string): string {
  if (!CONTENT_REVISION.test(contentRevision) || !SLOT_ID.test(slotId)) {
    throw new TypeError("Invalid virtual slot world revision or identity");
  }
  return `${PREFIX}${contentRevision}:${slotId}`;
}

export function parseStudioVirtualSlotResource(resource: string): { contentRevision: string; slotId: string } | null {
  if (!resource.startsWith(PREFIX)) return null;
  const [contentRevision, slotId, extra] = resource.slice(PREFIX.length).split(":");
  return extra === undefined && contentRevision && slotId && CONTENT_REVISION.test(contentRevision) && SLOT_ID.test(slotId)
    ? { contentRevision, slotId } : null;
}

export type StudioVirtualSlotRoom = Pick<StudioLiveRoom,
  "workId" | "participant" | "ready" | "authoritativeLockCapability" | "getLocks" | "subscribe"
  | "claimAuthoritativeLockAsync" | "releaseLockAsync">;

export interface StudioVirtualSlotLeaseSnapshot {
  readonly available: boolean;
  readonly status: "idle" | "requesting" | "held" | "denied" | "lost" | "closed";
  readonly slotId: string | null;
  readonly claimId: string | null;
  readonly ownerSessionId: string | null;
  readonly reason: string | null;
  readonly occupied: readonly { slotId: string; owner: StudioLiveParticipant; claimId: string }[];
}

export interface StudioVirtualSlotLeaseDependencies {
  /** A monotonic clock. Wall clock changes must never extend a shared seat. */
  readonly now?: () => number;
  readonly setInterval?: (callback: () => void, ms: number) => unknown;
  readonly clearInterval?: (handle: unknown) => void;
}

// One local controller may own a room/slot lifecycle. A replacement cannot inherit an old pending ACK.
const owners = new WeakMap<StudioVirtualSlotRoom, Map<string, StudioVirtualSlotLeaseController>>();

/** Projects the existing authenticated server lease; it never arbitrates peer claims. */
export class StudioVirtualSlotLeaseController {
  private status: StudioVirtualSlotLeaseSnapshot["status"] = "idle";
  private slotId: string | null = null;
  private lease: StudioLiveLockLease | null = null;
  private reason: string | null = null;
  private deadline = 0;
  private renewAt = 0;
  private generation = 0;
  private closed = false;
  private renewing = false;
  private operation = Promise.resolve();
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribe: () => void;
  private readonly timer: unknown;
  private readonly slotIds: ReadonlySet<string>;
  private readonly participantId: string;
  private readonly workId: string;

  constructor(
    private readonly room: StudioVirtualSlotRoom,
    readonly contentRevision: string,
    slotIds: readonly string[],
    private readonly dependencies: StudioVirtualSlotLeaseDependencies = {},
  ) {
    if (slotIds.length > 128 || new Set(slotIds).size !== slotIds.length) throw new TypeError("Invalid slot catalogue");
    for (const slot of slotIds) studioVirtualSlotResource(contentRevision, slot);
    if (!CONTENT_REVISION.test(contentRevision)) throw new TypeError("Invalid world content revision");
    this.slotIds = new Set(slotIds);
    this.participantId = room.participant.sessionId;
    this.workId = room.workId;
    this.unsubscribe = room.subscribe((event) => {
      if (event.type === "locks" || event.type === "transport-status") this.refresh();
    });
    this.timer = dependencies.setInterval?.(() => this.refresh(), 250)
      ?? globalThis.setInterval(() => this.refresh(), 250);
  }

  private now(): number { return this.dependencies.now?.() ?? performance.now(); }
  private available(): boolean {
    return !this.closed && this.room.ready && this.room.authoritativeLockCapability === "fenced-v2"
      && this.room.workId === this.workId && this.room.participant.sessionId === this.participantId
      && this.room.participant.role !== "viewer";
  }
  private emit(): void { for (const listener of this.listeners) listener(); }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  snapshot(): StudioVirtualSlotLeaseSnapshot {
    const available = this.available();
    const valid = available && this.lease && this.now() < this.deadline;
    return {
      available, status: this.status === "held" && !valid ? "lost" : this.status,
      slotId: this.slotId, claimId: valid ? this.lease!.claimId : null,
      ownerSessionId: valid ? this.participantId : null, reason: this.reason,
      occupied: available ? this.room.getLocks().flatMap((lock) => {
        const resource = parseStudioVirtualSlotResource(lock.resource);
        return resource?.contentRevision === this.contentRevision && this.slotIds.has(resource.slotId)
          ? [{ slotId: resource.slotId, owner: { ...lock.owner }, claimId: lock.claimId }] : [];
      }) : [],
    };
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operation.then(operation);
    this.operation = result.then(() => undefined, () => undefined);
    return result;
  }
  private async releaseResource(resource: string): Promise<void> {
    const reservation = owners.get(this.room);
    if (reservation?.get(resource) !== this) return;
    try {
      const current = this.room.getLocks().find((lock) => lock.resource === resource);
      if (this.room.workId === this.workId && this.room.participant.sessionId === this.participantId
        && current?.owner.sessionId === this.participantId) await this.room.releaseLockAsync(resource);
    } catch {
      // The UI already relinquished ownership. A disconnected release expires server-side.
    } finally {
      if (reservation.get(resource) === this) reservation.delete(resource);
    }
  }
  private async releaseOwned(): Promise<void> {
    for (const [resource, owner] of owners.get(this.room) ?? []) {
      if (owner === this) await this.releaseResource(resource);
    }
  }

  acquire(slotId: string): Promise<boolean> {
    if (!this.slotIds.has(slotId) || !this.available()) return Promise.resolve(false);
    if (this.status === "held" && this.slotId === slotId && this.now() < this.deadline) return Promise.resolve(true);
    const generation = ++this.generation;
    this.lease = null; this.slotId = slotId; this.status = "requesting"; this.reason = null; this.emit();
    return this.enqueue(async () => {
      await this.releaseOwned();
      if (generation !== this.generation || !this.available()) return false;
      const resource = studioVirtualSlotResource(this.contentRevision, slotId);
      let reservation = owners.get(this.room);
      if (!reservation) { reservation = new Map(); owners.set(this.room, reservation); }
      if (reservation.has(resource)) {
        this.status = "denied"; this.reason = "lifecycle_busy"; this.emit(); return false;
      }
      reservation.set(resource, this);
      return this.requestLease(resource, generation);
    });
  }

  private async requestLease(resource: string, generation: number, claimId?: string): Promise<boolean> {
    const started = this.now();
    try {
      const result = await this.room.claimAuthoritativeLockAsync(resource, claimId);
      if (generation !== this.generation || !this.available()) {
        await this.releaseResource(resource); return false;
      }
      const lock = result.status === "acquired" ? result.lock : null;
      const current = this.room.getLocks().find((entry) => entry.resource === resource);
      if (!lock || lock.resource !== resource || lock.owner.sessionId !== this.participantId
        || current?.claimId !== lock.claimId || current.owner.sessionId !== this.participantId
        || (claimId !== undefined && lock.claimId === claimId) || this.now() >= started + STUDIO_SLOT_LEASE_MS) {
        this.lose(result.status === "acquired" ? "invalid_or_late_grant" : result.status);
        await this.releaseResource(resource); return false;
      }
      this.lease = { ...lock, owner: { ...lock.owner } };
      // Deadline starts before the server receives the request, so delayed ACKs cannot extend it.
      this.deadline = started + STUDIO_SLOT_LEASE_MS;
      this.renewAt = started + STUDIO_SLOT_RENEW_MS;
      this.status = "held"; this.reason = null; this.emit(); return true;
    } catch {
      if (generation === this.generation) this.lose("transport_error");
      await this.releaseResource(resource); return false;
    }
  }

  private lose(reason: string): void {
    ++this.generation; this.lease = null; this.deadline = 0;
    this.status = "lost"; this.reason = reason; this.emit();
  }

  refresh(): void {
    if (this.closed) return;
    if (!this.available()) {
      if (this.status === "held" || this.status === "requesting") {
        this.lose("authority_unavailable"); void this.enqueue(() => this.releaseOwned());
      }
      this.emit(); return;
    }
    if (!this.lease) { this.emit(); return; }
    const current = this.room.getLocks().find((lock) => lock.resource === this.lease?.resource);
    if (!current || current.owner.sessionId !== this.participantId || this.now() >= this.deadline
      || (!this.renewing && current.claimId !== this.lease.claimId)) {
      this.lose("lease_lost"); void this.enqueue(() => this.releaseOwned()); return;
    }
    if (!this.renewing && this.now() >= this.renewAt) {
      const resource = this.lease.resource, claimId = this.lease.claimId, generation = this.generation;
      this.renewing = true;
      void this.enqueue(async () => {
        try {
          if (generation === this.generation && this.available()) await this.requestLease(resource, generation, claimId);
        } finally { this.renewing = false; }
      });
    }
    this.emit();
  }

  release(): Promise<void> {
    ++this.generation; this.lease = null; this.deadline = 0; this.slotId = null;
    this.status = "idle"; this.reason = null; this.emit();
    return this.enqueue(() => this.releaseOwned());
  }

  close(): Promise<void> {
    if (this.closed) return this.operation;
    this.closed = true; ++this.generation; this.lease = null; this.deadline = 0; this.status = "closed";
    this.unsubscribe();
    if (this.dependencies.clearInterval) this.dependencies.clearInterval(this.timer);
    else globalThis.clearInterval(this.timer as ReturnType<typeof setInterval>);
    this.emit(); this.listeners.clear();
    return this.enqueue(() => this.releaseOwned());
  }
}
