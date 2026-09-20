import { canonicalJson, type StudioReviewTaskCompletionContext, type StudioReviewTaskCompletionInput } from "@toonspectrum/studio-project-model";
import { StudioReviewTaskCompletionClientError, type StudioReviewTaskCompletionRequest } from "./studio-review-task-completion-client";

interface Owner { readonly actorId: string | null; readonly generation: number; readonly available: boolean }
interface Dependencies {
  owner(): Owner;
  read(request: StudioReviewTaskCompletionRequest, signal: AbortSignal): Promise<StudioReviewTaskCompletionContext>;
  complete(request: StudioReviewTaskCompletionRequest, input: StudioReviewTaskCompletionInput, signal: AbortSignal): Promise<StudioReviewTaskCompletionContext>;
  now(): number;
  createId(): string;
}
export interface StudioReviewTaskCompletionSnapshot {
  readonly phase: "idle" | "loading" | "ready" | "saving" | "completed" | "uncertain" | "failed";
  readonly context: StudioReviewTaskCompletionContext | null;
  readonly expiresAt: number;
  readonly reason: string | null;
}
export const EMPTY_COMPLETION: StudioReviewTaskCompletionSnapshot = { phase: "idle", context: null, expiresAt: 0, reason: null };

/** No write from render, renewal, or reconciliation. A retained intent never changes bytes. */
export class StudioReviewTaskCompletionController {
  private state = EMPTY_COMPLETION;
  private listeners = new Set<() => void>();
  private pending: AbortController | null = null;
  private epoch = 0;
  private disposed = false;
  private attempt: StudioReviewTaskCompletionInput | null = null;
  constructor(readonly request: StudioReviewTaskCompletionRequest, private readonly deps: Dependencies) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit(state: StudioReviewTaskCompletionSnapshot) { if (!this.disposed) { this.state = state; this.listeners.forEach((listener) => listener()); } }
  private start() {
    const owner = { ...this.deps.owner() };
    if (this.disposed || !owner.actorId || !owner.available) throw new StudioReviewTaskCompletionClientError("denied");
    this.pending?.abort(); const abort = new AbortController(), epoch = ++this.epoch; this.pending = abort;
    return { abort, owner, valid: () => { const next = this.deps.owner(); return !this.disposed && !abort.signal.aborted && epoch === this.epoch
      && next.available && next.actorId === owner.actorId && next.generation === owner.generation; } };
  }
  async refresh(retain = false) {
    if (this.pending || this.state.phase === "saving") return;
    let operation: ReturnType<StudioReviewTaskCompletionController["start"]> | undefined;
    try {
      operation = this.start(); const started = this.deps.now();
      const context = retain && this.state.expiresAt > started ? this.state.context : null;
      this.emit({ ...this.state, context, phase: context ? "ready" : "loading", reason: null });
      const result = await this.deps.read(this.request, operation.abort.signal);
      if (!operation.valid()) return;
      if (this.deps.now() >= started + 15_000) throw new Error("expired");
      const confirmed = this.attempt && result.evidence?.current && result.evidence.receipt.requestId === this.attempt.requestId
        && result.evidence.receipt.completedBy === operation.owner.actorId;
      this.emit({ phase: confirmed ? "completed" : this.attempt ? "uncertain" : "ready", context: result, expiresAt: started + 15_000, reason: null });
    } catch (error) { if (!operation || operation.valid()) this.emit({ ...EMPTY_COMPLETION, phase: "failed", reason: error instanceof Error ? error.message : "unavailable" }); }
    finally { if (operation?.abort === this.pending) this.pending = null; }
  }
  async confirm(proofDigest: string, criteria: readonly string[]) {
    if (this.state.phase === "saving" || this.disposed) return;
    let operation: ReturnType<StudioReviewTaskCompletionController["start"]> | undefined;
    try {
      if (!this.attempt && (!this.state.context || this.state.expiresAt <= this.deps.now()
        || this.state.context.proofDigest !== proofDigest || canonicalJson(this.state.context.criteria) !== canonicalJson(criteria))) throw new Error("expired");
      operation = this.start(); const started = this.deps.now();
      this.emit({ ...this.state, phase: "saving", reason: null });
      const fresh = await this.deps.read(this.request, operation.abort.signal);
      if (!operation.valid()) return;
      if (this.deps.now() >= started + 15_000) throw new Error("expired");
      if (fresh.evidence?.current && this.attempt && fresh.evidence.receipt.requestId === this.attempt.requestId
        && fresh.evidence.receipt.completedBy === operation.owner.actorId) {
        this.emit({ phase: "completed", context: fresh, expiresAt: started + 15_000, reason: null }); return;
      }
      if (this.attempt && (this.attempt.proofDigest !== proofDigest || canonicalJson(this.attempt.confirmedCriteria) !== canonicalJson(criteria))) throw new StudioReviewTaskCompletionClientError("conflict");
      if (fresh.proofDigest !== proofDigest || canonicalJson(fresh.criteria) !== canonicalJson(criteria)) throw new StudioReviewTaskCompletionClientError("conflict");
      if (!this.attempt) this.attempt = { requestId: this.deps.createId(), baseRevision: fresh.baseRevision, proofDigest, confirmedCriteria: [...criteria] };
      try {
        const saved = await this.deps.complete(this.request, this.attempt, operation.abort.signal);
        if (!operation.valid()) return;
        if (!saved.evidence?.current || saved.evidence.receipt.requestId !== this.attempt.requestId
          || saved.evidence.receipt.completedBy !== operation.owner.actorId) throw new Error("uncertain");
        const unexpired = this.deps.now() < started + 15_000;
        this.emit({ phase: "completed", context: unexpired ? saved : null, expiresAt: started + 15_000, reason: unexpired ? null : "expired" });
      } catch (error) {
        if (!operation.valid()) return;
        if (error instanceof StudioReviewTaskCompletionClientError) { this.attempt = null; throw error; }
        // An ambiguous write is read once; no automatic second POST.
        const reconciled = await this.deps.read(this.request, operation.abort.signal).catch(() => null);
        if (!operation.valid()) return;
        const found = reconciled?.evidence?.current && reconciled.evidence.receipt.requestId === this.attempt.requestId
          && reconciled.evidence.receipt.completedBy === operation.owner.actorId;
        const unexpired = this.deps.now() < started + 15_000;
        this.emit({ phase: found ? "completed" : "uncertain", context: unexpired ? reconciled : null, expiresAt: started + 15_000, reason: !unexpired ? "expired" : found ? null : "uncertain" });
      }
    } catch (error) {
      if (!operation || operation.valid()) { if (error instanceof StudioReviewTaskCompletionClientError) this.attempt = null;
        this.emit({ ...EMPTY_COMPLETION, phase: "failed", reason: error instanceof Error ? error.message : "unavailable" }); }
    } finally { if (operation?.abort === this.pending) this.pending = null; }
  }
  checkLease() { if (this.state.context && this.state.expiresAt <= this.deps.now()) {
    if (this.state.phase !== "saving") { ++this.epoch; this.pending?.abort(); this.pending = null; }
    this.emit({ ...this.state, context: null, reason: "expired" });
  } }
  invalidate() { ++this.epoch; this.pending?.abort(); this.pending = null; this.emit({ ...EMPTY_COMPLETION, phase: "failed", reason: "context-changed" }); }
  dispose() { this.invalidate(); this.disposed = true; this.listeners.clear(); }
}
