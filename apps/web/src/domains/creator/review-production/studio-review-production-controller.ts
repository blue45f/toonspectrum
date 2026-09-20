import { StudioProductionServerConflictError, type StudioServerProductionSnapshot } from "../studio-production/studio-production-server-client";
import type { ProductionWorkspace } from "../studio-production/studio-production-workspace-runtime";

import { prepareStudioReviewProductionPatch, studioReviewProductionPatchIsPresent, StudioReviewProductionError,
  type StudioReviewProductionAuthority, type StudioReviewProductionChoice, type StudioReviewProductionReason,
  type StudioReviewProductionRequest } from "./studio-review-production-model";

interface Context { readonly actorId: string | null; readonly workId: string; readonly generation: number; readonly available: boolean }
export interface StudioReviewProductionSnapshot {
  readonly phase: "idle" | "loading" | "ready" | "saving" | "connected" | "failed" | "uncertain" | "conflict";
  readonly authority: StudioReviewProductionAuthority | null;
  readonly reason: StudioReviewProductionReason | null;
}
export const EMPTY_STUDIO_REVIEW_PRODUCTION: StudioReviewProductionSnapshot = Object.freeze({ phase: "idle", authority: null, reason: null });
export interface StudioReviewProductionDependencies {
  getContext(): Context;
  read(request: StudioReviewProductionRequest, actorId: string, signal: AbortSignal): Promise<StudioReviewProductionAuthority>;
  save(workId: string, revision: number, document: ProductionWorkspace, signal: AbortSignal): Promise<StudioServerProductionSnapshot>;
  now(): number;
}

/** One saved-comment connection. Network writes are explicit and CAS conflicts never reapply. */
export class StudioReviewProductionController {
  private snapshot = EMPTY_STUDIO_REVIEW_PRODUCTION;
  private listeners = new Set<() => void>();
  private epoch = 0;
  private pending: AbortController | null = null;
  private disposed = false;
  constructor(readonly request: StudioReviewProductionRequest, private readonly deps: StudioReviewProductionDependencies) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(next: StudioReviewProductionSnapshot) {
    if (this.disposed) return;
    this.snapshot = Object.freeze(next); this.listeners.forEach((listener) => listener());
  }
  private start() {
    const context = { ...this.deps.getContext() };
    if (this.disposed || !context.available || !context.actorId || context.workId !== this.request.subject.workId) throw new StudioReviewProductionError("access-denied");
    this.pending?.abort(); const abort = new AbortController(); this.pending = abort;
    const epoch = ++this.epoch;
    const current = () => {
      const now = this.deps.getContext();
      return !this.disposed && !abort.signal.aborted && epoch === this.epoch && now.available
        && now.actorId === context.actorId && now.workId === context.workId && now.generation === context.generation;
    };
    return { abort, current, actorId: context.actorId, epoch };
  }
  async refresh(retain = false) {
    if (this.snapshot.phase === "saving") return;
    let operation: ReturnType<StudioReviewProductionController["start"]> | undefined;
    try {
      operation = this.start();
      this.publish({ phase: "loading", authority: retain && this.snapshot.authority && this.snapshot.authority.expiresAt > this.deps.now() ? this.snapshot.authority : null, reason: null });
      const authority = await this.deps.read(this.request, operation.actorId, operation.abort.signal);
      if (!operation.current()) return;
      this.publish({ phase: "ready", authority, reason: null });
    } catch (error) {
      if (!operation || operation.current()) this.publish({ phase: "failed", authority: null,
        reason: error instanceof StudioReviewProductionError ? error.reason : "unavailable" });
    } finally { if (operation?.abort === this.pending) this.pending = null; }
  }
  async connect(choice: StudioReviewProductionChoice) {
    if (["saving", "loading", "conflict"].includes(this.snapshot.phase) || this.disposed) return;
    let operation: ReturnType<StudioReviewProductionController["start"]> | undefined;
    try {
      operation = this.start();
      this.publish({ ...this.snapshot, phase: "saving", reason: null });
      const authority = await this.deps.read(this.request, operation.actorId, operation.abort.signal);
      if (!operation.current()) return;
      if (authority.expiresAt <= this.deps.now()) throw new StudioReviewProductionError("expired");
      const patch = prepareStudioReviewProductionPatch(authority, choice);
      if (!patch.changed) { this.publish({ phase: "connected", authority, reason: null }); return; }
      // One full-document CAS, derived from the fresh server snapshot, changes exactly one task.
      try {
        const saved = await this.deps.save(this.request.subject.workId, authority.workspace.revision, patch.document, operation.abort.signal);
        if (!operation.current()) return;
        if (!studioReviewProductionPatchIsPresent(saved, choice.taskId, patch)) throw new StudioReviewProductionError("uncertain");
        this.publish({ phase: "connected", authority: authority.expiresAt > this.deps.now() ? { ...authority, workspace: saved } : null, reason: null });
      } catch (error) {
        if (!operation.current()) return;
        if (error instanceof StudioProductionServerConflictError) {
          this.publish({ phase: "conflict", authority: null, reason: "conflict" }); return;
        }
        // A failed/lost response is never a reason to repeat PUT. Read and prove the desired
        // reference first; a user can explicitly retry after an unconfirmed read.
        try {
          const reconciled = await this.deps.read(this.request, operation.actorId, operation.abort.signal);
          if (!operation.current()) return;
          // The same role ID can be rebound. Prove the fresh user/scope/criteria relation,
          // not just a locator-shaped value, and never save this reconciliation patch.
          const currentPatch = prepareStudioReviewProductionPatch(reconciled, choice);
          if (reconciled.expiresAt > this.deps.now() && studioReviewProductionPatchIsPresent(reconciled.workspace, choice.taskId, currentPatch)) {
            this.publish({ phase: "connected", authority: reconciled, reason: null }); return;
          }
        } catch { if (!operation.current()) return; }
        this.publish({ phase: "uncertain", authority: null, reason: "uncertain" });
      }
    } catch (error) {
      if (!operation || operation.current()) this.publish({ phase: "failed", authority: null,
        reason: error instanceof StudioReviewProductionError ? error.reason : "unavailable" });
    } finally { if (operation?.abort === this.pending) this.pending = null; }
  }
  checkLease() {
    if (this.snapshot.authority && this.snapshot.authority.expiresAt <= this.deps.now()) {
      this.publish({ ...this.snapshot, authority: null, reason: "expired" });
    }
  }
  invalidate() {
    ++this.epoch; this.pending?.abort(); this.pending = null;
    this.publish({ phase: "failed", authority: null, reason: "context-changed" });
  }
  dispose() { this.invalidate(); this.disposed = true; this.listeners.clear(); }
}
