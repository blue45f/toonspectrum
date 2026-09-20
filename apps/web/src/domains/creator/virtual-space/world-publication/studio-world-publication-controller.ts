import type { StudioWorldPublication, StudioWorldPublish } from "@toonspectrum/studio-project-model/world-publication";
import { httpStatus } from "@/infrastructure/api";
import { type PreparedStudioWorld } from "./studio-world-publication-assets";
import { StudioWorldPublicationError, studioWorldPublicationFailure, studioWorldPublishManifest,
  type StudioWorldPublicationAuthority, type StudioWorldPublicationReason } from "./studio-world-publication-client";

export interface StudioWorldPublicationSnapshot {
  readonly phase: "idle" | "reading" | "ready" | "publishing" | "preparing" | "failed" | "uncertain";
  readonly authority: StudioWorldPublicationAuthority | null;
  readonly active: PreparedStudioWorld | null;
  readonly previous: StudioWorldPublication | null;
  readonly reason: StudioWorldPublicationReason | null;
  readonly retryIntent: boolean;
  readonly accessDenied: boolean;
  readonly viewVerified: boolean;
  readonly hasPublishedWorld: boolean;
}
export const EMPTY_WORLD_PUBLICATION: StudioWorldPublicationSnapshot = Object.freeze({ phase: "idle", authority: null,
  active: null, previous: null, reason: null, retryIntent: false, accessDenied: false, viewVerified: false, hasPublishedWorld: false });
export interface StudioWorldPublicationDependencies {
  context(): { actorId: string | null; generation: number; available: boolean };
  read(workId: string, actorId: string, signal: AbortSignal): Promise<StudioWorldPublicationAuthority>;
  publish(workId: string, input: StudioWorldPublish, id: string, signal: AbortSignal): Promise<{ publication: StudioWorldPublication; replayed: boolean }>;
  prepare(publication: StudioWorldPublication, signal: AbortSignal): Promise<PreparedStudioWorld>;
  now(): number;
  id(): string;
}

/** Browser projection only. The server owns ACL, the immutable publication and the CAS. */
export class StudioWorldPublicationController {
  private snapshot = EMPTY_WORLD_PUBLICATION;
  private listeners = new Set<() => void>();
  private pending: AbortController | null = null;
  private epoch = 0;
  private disposed = false;
  private intent: { id: string; actorId: string; input: StudioWorldPublish } | null = null;
  constructor(readonly workId: string, private readonly deps: StudioWorldPublicationDependencies) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit(patch: Partial<StudioWorldPublicationSnapshot>) {
    if (this.disposed) return;
    this.snapshot = { ...this.snapshot, ...patch, retryIntent: Boolean(this.intent) };
    this.listeners.forEach((listener) => listener());
  }
  private start() {
    const context = { ...this.deps.context() };
    if (this.disposed || !context.actorId || !context.available) throw new StudioWorldPublicationError("context-changed");
    const abort = new AbortController(), epoch = ++this.epoch; this.pending = abort;
    return { abort, actorId: context.actorId, current: () => {
      const next = this.deps.context();
      return !this.disposed && !abort.signal.aborted && epoch === this.epoch && next.available
        && next.actorId === context.actorId && next.generation === context.generation;
    } };
  }
  private async apply(authority: StudioWorldPublicationAuthority, op: ReturnType<StudioWorldPublicationController["start"]>) {
    const candidate = authority.publication, active = this.snapshot.active;
    if (candidate?.revisionId === active?.publication.revisionId) {
      if (candidate?.contentHash !== active?.publication.contentHash) throw new StudioWorldPublicationError("invalid-world");
      this.emit({ phase: "ready", authority, reason: null, accessDenied: false, viewVerified: true, hasPublishedWorld: Boolean(authority.publication) }); return;
    }
    if (!candidate) {
      if (active) throw new StudioWorldPublicationError("invalid-world");
      this.emit({ phase: "ready", authority, reason: null, accessDenied: false, viewVerified: true, hasPublishedWorld: Boolean(authority.publication) }); return;
    }
    this.emit({ phase: "preparing", authority, reason: null });
    const prepared = await this.deps.prepare(candidate, op.abort.signal);
    try {
      if (!op.current()) return;
      // Asset loading may outlive the read lease or a concurrent publication. Re-read before adoption.
      const confirmed = await this.deps.read(this.workId, op.actorId, op.abort.signal);
      if (!op.current()) return;
      if (confirmed.expiresAt <= this.deps.now() || confirmed.publication?.revisionId !== candidate.revisionId
        || confirmed.publication.contentHash !== candidate.contentHash) throw new StudioWorldPublicationError("conflict");
      this.emit({ phase: "ready", authority: confirmed, active: prepared, previous: active?.publication ?? null,
        reason: null, accessDenied: false, viewVerified: true, hasPublishedWorld: Boolean(authority.publication) });
      active?.dispose();
    } finally { if (this.snapshot.active !== prepared) prepared.dispose(); }
  }
  private failure(error: unknown) {
    const reason = studioWorldPublicationFailure(error);
    if (reason === "access-denied") {
      this.revoke();
    } else this.emit({ phase: this.intent ? "uncertain" : "failed", authority: null, reason });
  }
  async read(adopt = true) {
    if (this.pending || this.disposed) return false;
    let op: ReturnType<StudioWorldPublicationController["start"]> | undefined;
    try {
      op = this.start();
      if (!this.snapshot.authority || this.snapshot.authority.expiresAt <= this.deps.now()) this.emit({ phase: "reading", authority: null, reason: null });
      const authority = await this.deps.read(this.workId, op.actorId, op.abort.signal);
      if (!op.current()) return false;
      if (adopt) await this.apply(authority, op);
      else this.emit({ authority, phase: this.intent ? "uncertain" : "ready", reason: this.intent ? "uncertain" : null, accessDenied: false, viewVerified: true, hasPublishedWorld: Boolean(authority.publication) });
      return op.current();
    } catch (error) { if (!op || op.current()) this.failure(error); return false; }
    finally { if (op?.abort === this.pending) this.pending = null; }
  }
  async publish(raw?: unknown, expectedRevision?: string | null) {
    if (this.pending || this.disposed) return false;
    let op: ReturnType<StudioWorldPublicationController["start"]> | undefined;
    let sent = false;
    try {
      op = this.start();
      const existing = this.intent;
      // Freeze the draft before the asynchronous authority read. Retry always keeps these exact bytes.
      const manifest = existing ? existing.input.manifest : studioWorldPublishManifest(raw);
      this.emit({ phase: "publishing", reason: null });
      const authority = await this.deps.read(this.workId, op.actorId, op.abort.signal);
      if (!op.current()) return false;
      if (!authority.canPublish || authority.expiresAt <= this.deps.now()) throw new StudioWorldPublicationError("access-denied");
      if (existing && existing.actorId !== op.actorId) throw new StudioWorldPublicationError("context-changed");
      if (!existing) {
        // A draft is published against the revision the owner saw, never silently rebased.
        if (!this.snapshot.authority || (authority.publication?.revisionId ?? null) !== (expectedRevision === undefined ? this.snapshot.authority.publication?.revisionId ?? null : expectedRevision)) {
          throw new StudioWorldPublicationError("conflict");
        }
        this.intent = { id: this.deps.id(), actorId: op.actorId, input: { manifest, expectedPublishedRevisionId: authority.publication?.revisionId ?? null } };
      }
      const intent = this.intent!; sent = true;
      const result = await this.deps.publish(this.workId, intent.input, intent.id, op.abort.signal);
      if (!op.current()) return false;
      this.intent = null;
      const current = await this.deps.read(this.workId, op.actorId, op.abort.signal);
      if (!op.current()) return false;
      if (current.publication?.revisionId !== result.publication.revisionId) throw new StudioWorldPublicationError("conflict");
      if (current.publication.contentHash !== result.publication.contentHash) throw new StudioWorldPublicationError("invalid-world");
      await this.apply(current, op);
      return op.current();
    } catch (error) {
      if (!op || op.current()) {
        const status = httpStatus(error);
        if (!sent || (status !== null && status >= 400 && status < 500)) this.intent = null;
        this.failure(sent && this.intent ? new StudioWorldPublicationError("uncertain") : error);
      }
      return false;
    } finally { if (op?.abort === this.pending) this.pending = null; }
  }
  invalidate() {
    ++this.epoch; this.pending?.abort(); this.pending = null;
    // A hidden tab/session renewal fences pending UI work, not an accepted conversation.
    this.emit({ authority: null, phase: this.intent ? "uncertain" : "idle", reason: "context-changed" });
  }
  revoke() {
    ++this.epoch; this.pending?.abort(); this.pending = null; this.intent = null;
    this.snapshot.active?.dispose();
    this.emit({ active: null, previous: null, authority: null, accessDenied: true, viewVerified: false,
      phase: "failed", reason: "access-denied" });
  }
  checkLease() { if (this.snapshot.authority && this.snapshot.authority.expiresAt <= this.deps.now()) this.emit({ authority: null }); }
  dispose() { this.invalidate(); this.snapshot.active?.dispose(); this.disposed = true; this.listeners.clear(); }
}
