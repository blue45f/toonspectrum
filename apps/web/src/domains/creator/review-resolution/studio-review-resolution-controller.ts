import { httpStatus } from "@/platform/api";
import type { resolveStudioReviewComment } from "../project-graph/studio-project-graph-client";

import { StudioReviewResolutionError, type StudioReviewResolutionAuthority, type StudioReviewResolutionReason } from "./studio-review-resolution-authority";
import type { StudioReviewResolutionRequest } from "./studio-review-resolution-route";

export interface StudioReviewResolutionSnapshot {
  readonly phase: "idle" | "checking" | "ready" | "resolving" | "resolved" | "uncertain" | "failed";
  readonly authority: StudioReviewResolutionAuthority | null;
  readonly reason: StudioReviewResolutionReason | null;
}
export const EMPTY_STUDIO_REVIEW_RESOLUTION: StudioReviewResolutionSnapshot = Object.freeze({ phase: "idle", authority: null, reason: null });
export interface StudioReviewResolutionDependencies {
  getContext(): { readonly actorId: string | null; readonly generation: number; readonly available: boolean };
  read(request: StudioReviewResolutionRequest, signal: AbortSignal): Promise<StudioReviewResolutionAuthority>;
  resolve: typeof resolveStudioReviewComment;
  now(): number;
}

/** Explicit resolution only. An ambiguous POST switches to read-only reconciliation for
 * this attempt; it is never automatically or blindly reissued. */
export class StudioReviewResolutionController {
  private snapshot = EMPTY_STUDIO_REVIEW_RESOLUTION;
  private listeners = new Set<() => void>();
  private epoch = 0;
  private pending: AbortController | null = null;
  private disposed = false;
  private uncertainWrite = false;
  constructor(readonly request: StudioReviewResolutionRequest, private readonly deps: StudioReviewResolutionDependencies) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(next: StudioReviewResolutionSnapshot) { if (!this.disposed) { this.snapshot = next; this.listeners.forEach((listener) => listener()); } }
  private start() {
    const context = { ...this.deps.getContext() };
    if (this.disposed || !context.actorId || !context.available) throw new StudioReviewResolutionError("access-denied");
    this.pending?.abort(); const abort = new AbortController(); this.pending = abort; const epoch = ++this.epoch;
    return { abort, current: () => { const latest = this.deps.getContext();
      return !this.disposed && !abort.signal.aborted && epoch === this.epoch && latest.available
        && latest.actorId === context.actorId && latest.generation === context.generation; } };
  }
  async check(retain = false) {
    if (this.pending || this.snapshot.phase === "resolving" || this.disposed) return;
    let operation: ReturnType<StudioReviewResolutionController["start"]> | undefined;
    try {
      operation = this.start();
      const authority = retain && this.snapshot.authority && this.snapshot.authority.expiresAt > this.deps.now() ? this.snapshot.authority : null;
      this.publish({ phase: authority ? this.snapshot.phase : "checking", authority, reason: null });
      const fresh = await this.deps.read(this.request, operation.abort.signal);
      if (!operation.current()) return;
      this.publish({ phase: fresh.resolved ? "resolved" : this.uncertainWrite ? "uncertain" : "ready", authority: fresh,
        reason: this.uncertainWrite && !fresh.resolved ? "uncertain" : null });
    } catch (error) {
      if (!operation || operation.current()) this.publish({ phase: "failed", authority: null, reason: error instanceof StudioReviewResolutionError ? error.reason : "unavailable" });
    } finally { if (operation?.abort === this.pending) this.pending = null; }
  }
  async resolve(confirmed: boolean) {
    if (!confirmed || this.uncertainWrite || this.disposed || this.snapshot.phase !== "ready"
      || !this.snapshot.authority || this.snapshot.authority.expiresAt <= this.deps.now()) return;
    let operation: ReturnType<StudioReviewResolutionController["start"]> | undefined;
    try {
      operation = this.start(); this.publish({ ...this.snapshot, phase: "resolving", reason: null });
      const fresh = await this.deps.read(this.request, operation.abort.signal);
      if (!operation.current()) return;
      if (fresh.expiresAt <= this.deps.now()) throw new StudioReviewResolutionError("expired");
      if (fresh.resolved) { this.publish({ phase: "resolved", authority: fresh, reason: null }); return; }
      try {
        const result = await this.deps.resolve(this.request.origin.commentId, fresh.submissionId, "resolved", this.request.replacement);
        if (!operation.current()) return;
        if (result.id !== this.request.origin.commentId || result.status !== "resolved" || result.resolutionRevisionId !== fresh.submissionId) throw new StudioReviewResolutionError("uncertain");
        this.publish({ phase: "resolved", authority: fresh.expiresAt > this.deps.now() ? { ...fresh, resolved: true } : null, reason: null });
      } catch (error) {
        if (!operation.current()) return;
        const status = httpStatus(error);
        if (status !== null && status >= 400 && status < 500) {
          throw new StudioReviewResolutionError(status === 401 || status === 403 ? "access-denied" : status === 409 ? "conflict" : "invalid-source");
        }
        this.uncertainWrite = true;
        try {
          const reconciled = await this.deps.read(this.request, operation.abort.signal);
          if (!operation.current()) return;
          if (reconciled.resolved && reconciled.expiresAt > this.deps.now()) {
            this.publish({ phase: "resolved", authority: reconciled, reason: null }); return;
          }
        } catch { if (!operation.current()) return; }
        this.publish({ phase: "uncertain", authority: null, reason: "uncertain" });
      }
    } catch (error) {
      if (!operation || operation.current()) this.publish({ phase: "failed", authority: null, reason: error instanceof StudioReviewResolutionError ? error.reason : "unavailable" });
    } finally { if (operation?.abort === this.pending) this.pending = null; }
  }
  checkLease() {
    if (this.snapshot.authority && this.snapshot.authority.expiresAt <= this.deps.now()) {
      if (this.snapshot.phase !== "resolving") { ++this.epoch; this.pending?.abort(); this.pending = null; }
      this.publish({ ...this.snapshot, authority: null, reason: "expired" });
    }
  }
  invalidate() { ++this.epoch; this.pending?.abort(); this.pending = null; this.publish({ phase: "failed", authority: null, reason: "context-changed" }); }
  dispose() { this.invalidate(); this.disposed = true; this.listeners.clear(); }
}
