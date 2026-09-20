import { type StudioHandoffEnvelopePrepare, type StudioHandoffEnvelopeView, type StudioHandoffEnvelopeCreate, type StudioHandoffEnvelopeAction, type StudioHandoffEnvelopeList } from "@toonspectrum/studio-project-model";
import { StudioHandoffClientError, studioHandoffClient } from "./studio-handoff-envelope-client";

interface Owner { actorId: string | null; generation: number; available: boolean }
interface Dependencies { owner(): Owner; client: typeof studioHandoffClient; now(): number; createId(): string }
type Attempt = { phase: "create"; input: StudioHandoffEnvelopeCreate } | { phase: "open" | "accept" | "cancel"; id: string; input: StudioHandoffEnvelopeAction };
export interface StudioHandoffSnapshot {
  phase: "idle" | "loading" | "ready" | "saving" | "uncertain" | "failed";
  prepared: StudioHandoffEnvelopePrepare | null; view: StudioHandoffEnvelopeView | null; list: StudioHandoffEnvelopeList | null;
  expiresAt: number; reason: string | null;
}
export const EMPTY_HANDOFF: StudioHandoffSnapshot = { phase: "idle", prepared: null, view: null, list: null, expiresAt: 0, reason: null };
/** Every mutation follows an explicit gesture. Reconciliation reads never resend writes. */
export class StudioHandoffEnvelopeController {
  private state = EMPTY_HANDOFF;
  private listeners = new Set<() => void>();
  private pending: AbortController | null = null;
  private generation = 0;
  private disposed = false;
  private selectedId: string | null = null;
  private cursor: string | null = null;
  private attempt: Attempt | null = null;
  constructor(readonly workId: string, readonly taskId: string | null, private readonly deps: Dependencies) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit(state: StudioHandoffSnapshot) { if (!this.disposed) { this.state = state; this.listeners.forEach((listener) => listener()); } }
  private start() {
    const owner = { ...this.deps.owner() };
    if (this.disposed || !owner.actorId || !owner.available) throw new StudioHandoffClientError("denied");
    this.pending?.abort(); const abort = new AbortController(), generation = ++this.generation; this.pending = abort;
    const started = this.deps.now();
    return { abort, owner, started, valid: () => { const next = this.deps.owner(); return !this.disposed && !abort.signal.aborted && generation === this.generation
      && next.available && next.actorId === owner.actorId && next.generation === owner.generation; } };
  }
  private failure(error: unknown) { this.emit({ ...EMPTY_HANDOFF, phase: this.attempt ? "uncertain" : "failed", reason: error instanceof Error ? error.message : "unavailable" }); }
  private isRecorded(attempt: Attempt, view: StudioHandoffEnvelopeView, actorId: string | null) {
    if (attempt.phase === "create") return view.envelope.id === attempt.input.envelopeId && view.envelope.senderUserId === actorId;
    const evidence = attempt.phase === "open" ? view.opened : attempt.phase === "accept" ? view.accepted : view.cancelled;
    return evidence?.actorUserId === actorId && evidence.requestId === attempt.input.requestId;
  }
  async refresh(retain = false) {
    if (this.pending) return;
    let op: ReturnType<StudioHandoffEnvelopeController["start"]> | undefined;
    try {
      op = this.start();
      const keep = retain && this.state.expiresAt > op.started;
      this.emit({ ...(keep ? this.state : EMPTY_HANDOFF), phase: keep ? this.state.phase : "loading" });
      const id = this.attempt ? this.attempt.phase === "create" ? this.attempt.input.envelopeId : this.attempt.id : this.selectedId;
      const result = id ? { view: await this.deps.client.read(this.workId, id, op.abort.signal) }
        : this.taskId ? { prepared: await this.deps.client.prepare(this.workId, this.taskId, op.abort.signal) }
          : { list: await this.deps.client.list(this.workId, this.cursor, op.abort.signal) };
      if (!op.valid()) return;
      if (this.deps.now() >= op.started + 15_000) throw new Error("expired");
      if (this.attempt && result.view && this.isRecorded(this.attempt, result.view, op.owner.actorId)) this.attempt = null;
      this.emit({ ...EMPTY_HANDOFF, ...result, phase: this.attempt ? "uncertain" : "ready", expiresAt: op.started + 15_000 });
    } catch (error) { if (!op || op.valid()) this.failure(error); }
    finally { if (op?.abort === this.pending) this.pending = null; }
  }
  async select(id: string | null, cursor: string | null = null) {
    if (this.pending || this.attempt) return;
    this.selectedId = id; this.cursor = cursor; await this.refresh();
  }
  async send(choice: { roleId: string; usageConditions: string; remainingNotes: string }) {
    if (this.pending || this.attempt) return;
    const prepared = this.state.prepared;
    const selected = prepared?.recipients.find((item) => item.roleAssignmentId === choice.roleId);
    if (!prepared || !selected || this.state.expiresAt <= this.deps.now()) { this.failure(new Error("expired")); return; }
    let op: ReturnType<StudioHandoffEnvelopeController["start"]> | undefined;
    try {
      op = this.start(); this.emit({ ...this.state, phase: "saving" });
      const fresh = await this.deps.client.prepare(this.workId, prepared.taskId, op.abort.signal);
      if (!op.valid()) return;
      if (this.deps.now() >= op.started + 15_000 || fresh.completionFingerprint !== prepared.completionFingerprint
        || !fresh.recipients.some((item) => item.roleAssignmentId === selected.roleAssignmentId && item.userId === selected.userId && item.bindingDigest === selected.bindingDigest)) throw new StudioHandoffClientError("changed");
      this.attempt = { phase: "create", input: { envelopeId: this.deps.createId(), taskId: prepared.taskId, baseRevision: fresh.baseRevision,
        completionFingerprint: fresh.completionFingerprint, recipient: { userId: selected.userId, roleAssignmentId: selected.roleAssignmentId },
        recipientBindingDigest: selected.bindingDigest, usageConditions: choice.usageConditions.trim(), remainingNotes: choice.remainingNotes.trim() } };
      await this.write(op, this.attempt);
    } catch (error) { if (!op || op.valid()) this.failure(error); }
    finally { if (op?.abort === this.pending) this.pending = null; }
  }
  async act(phase: "open" | "accept" | "cancel") {
    if (this.pending || this.attempt) return;
    const view = this.state.view;
    if (!view || this.state.expiresAt <= this.deps.now()) { this.failure(new Error("expired")); return; }
    let op: ReturnType<StudioHandoffEnvelopeController["start"]> | undefined;
    try {
      op = this.start(); this.emit({ ...this.state, phase: "saving" });
      const fresh = await this.deps.client.read(this.workId, view.envelope.id, op.abort.signal);
      if (!op.valid()) return;
      if (this.deps.now() >= op.started + 15_000 || fresh.envelopeDigest !== view.envelopeDigest
        || (phase === "accept" && !fresh.canAccept) || (phase === "cancel" && !fresh.canCancel)
        || (phase === "open" && fresh.envelope.recipient.userId !== op.owner.actorId)) throw new StudioHandoffClientError("changed");
      this.attempt = { phase, id: view.envelope.id, input: { requestId: this.deps.createId(), envelopeDigest: view.envelopeDigest } };
      await this.write(op, this.attempt);
    } catch (error) { if (!op || op.valid()) this.failure(error); }
    finally { if (op?.abort === this.pending) this.pending = null; }
  }
  private async write(op: ReturnType<StudioHandoffEnvelopeController["start"]>, attempt: Attempt) {
    const id = attempt.phase === "create" ? attempt.input.envelopeId : attempt.id;
    try {
      const result = attempt.phase === "create" ? await this.deps.client.create(this.workId, attempt.input, op.abort.signal)
        : await this.deps.client.act(this.workId, id, attempt.phase, attempt.input, op.abort.signal);
      if (!op.valid()) return;
      if (!this.isRecorded(attempt, result, op.owner.actorId)) throw new Error("uncertain");
      this.attempt = null; this.selectedId = id;
      this.emit({ ...EMPTY_HANDOFF, phase: "ready", view: this.deps.now() < op.started + 15_000 ? result : null, expiresAt: op.started + 15_000 });
    } catch (error) {
      if (!op.valid()) return;
      if (error instanceof StudioHandoffClientError) { this.attempt = null; throw error; }
      const result = await this.deps.client.read(this.workId, id, op.abort.signal).catch(() => null);
      if (!op.valid()) return;
      const found = result && this.isRecorded(attempt, result, op.owner.actorId);
      if (found) { this.attempt = null; this.selectedId = id; }
      this.emit({ ...EMPTY_HANDOFF, view: this.deps.now() < op.started + 15_000 ? result : null,
        phase: found ? "ready" : "uncertain", expiresAt: op.started + 15_000, reason: found ? null : "uncertain" });
    }
  }
  /** Explicit retry first reconciles, then sends exactly the retained request if still absent. */
  async retry() {
    if (!this.attempt || this.pending) return;
    const attempt = this.attempt;
    let op: ReturnType<StudioHandoffEnvelopeController["start"]> | undefined;
    try {
      op = this.start(); this.emit({ ...this.state, phase: "saving" });
      const id = attempt.phase === "create" ? attempt.input.envelopeId : attempt.id;
      const existing = await this.deps.client.read(this.workId, id, op.abort.signal).catch((error: unknown) => {
        if (error instanceof StudioHandoffClientError && error.reason === "missing" && attempt.phase === "create") return null; throw error;
      });
      if (!op.valid()) return;
      if (this.deps.now() >= op.started + 15_000) throw new Error("expired");
      if (existing && this.isRecorded(attempt, existing, op.owner.actorId)) { this.attempt = null; this.selectedId = id;
        this.emit({ ...EMPTY_HANDOFF, view: existing, phase: "ready", expiresAt: op.started + 15_000 }); return; }
      // No new ID, recipient, fields or automatic rebase after an uncertain write.
      await this.write(op, attempt);
    } catch (error) { if (!op || op.valid()) this.failure(error); }
    finally { if (op?.abort === this.pending) this.pending = null; }
  }
  checkLease() { if (this.state.expiresAt && this.state.expiresAt <= this.deps.now()) {
    if (this.state.phase !== "saving") { ++this.generation; this.pending?.abort(); this.pending = null; }
    this.emit({ ...EMPTY_HANDOFF, phase: this.attempt ? "uncertain" : "failed", reason: "expired" });
  } }
  invalidate() { ++this.generation; this.pending?.abort(); this.pending = null; this.emit({ ...EMPTY_HANDOFF, phase: this.attempt ? "uncertain" : "failed", reason: "context-changed" }); }
  dispose() { this.invalidate(); this.disposed = true; this.attempt = null; this.listeners.clear(); }
}
