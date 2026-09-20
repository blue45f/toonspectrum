import { z } from "zod";
import { canonicalJson, studioWorkSessionCreateSchema, studioWorkSessionCommandSchema,
  type StudioWorkSessionCreate, type StudioWorkSessionCommand, type StudioWorkSessionView } from "@toonspectrum/studio-project-model";
import { httpStatus } from "@/infrastructure/api";
import { studioWorkSessionRequestHash } from "./studio-work-session-client";
import type { StudioWorkSessionApi, StudioSessionList, StudioSessionMutation } from "./studio-work-session-client";

const pendingSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("create"), input: studioWorkSessionCreateSchema }).strict(),
  z.object({ kind: z.literal("command"), sessionId: z.string().min(1).max(160), input: studioWorkSessionCommandSchema }).strict(),
]);
type Pending = z.infer<typeof pendingSchema>;
type CommandBody<T = StudioWorkSessionCommand> = T extends StudioWorkSessionCommand ? Omit<T, "operationId" | "expectedVersion"> : never;
export type StudioWorkSessionIntent = CommandBody;
export interface StudioSessionState {
  readonly phase: "idle" | "loading" | "ready" | "saving" | "uncertain" | "failed";
  readonly view: StudioWorkSessionView | null; readonly list: StudioSessionList | null;
  readonly reason: "storage" | "unavailable" | "rejected" | "uncertain" | "conflict" | "access-denied" | null;
  readonly pending: boolean;
}
export interface StudioSessionStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
export class StudioWorkSessionController {
  private state: StudioSessionState = { phase: "idle", view: null, list: null, reason: null, pending: false };
  private readonly listeners = new Set<() => void>();
  private pending: Pending | null = null;
  private generation = 0; private stopped = false; private abort: AbortController | null = null;
  private selected: string | null = null;
  private cursor: string | null = null;
  private storageBlocked = false;
  private expiry: ReturnType<typeof setTimeout> | null = null;
  readonly storageKey: string;
  constructor(readonly workId: string, readonly actorId: string, private readonly api: StudioWorkSessionApi,
    private readonly storage: StudioSessionStorage, private readonly active: () => boolean, private readonly id: () => string = () => crypto.randomUUID()) {
    this.storageKey = `toonspectrum:work-session-pending:v1:${encodeURIComponent(actorId)}:${encodeURIComponent(workId)}`;
    try {
      const raw = storage.getItem(this.storageKey);
      if (raw) {
        if (raw.length > 300_000) throw new Error("Pending request exceeds budget");
        const pending = pendingSchema.parse(JSON.parse(raw));
        if (pending.kind === "create" && pending.input.input.workId !== workId) throw new Error("Wrong work pending request");
        this.pending = pending; this.selected = this.sessionId(pending);
        this.state = { ...this.state, phase: "uncertain", reason: "uncertain", pending: true };
      }
    } catch { this.storageBlocked = true; this.state = { ...this.state, phase: "failed", reason: "storage" }; }
  }
  readonly subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  readonly getSnapshot = () => this.state;
  private publish(next: StudioSessionState) { if (this.stopped) return; this.state = next; this.listeners.forEach((listener) => listener()); }
  private sessionId(pending: Pending) { return pending.kind === "create" ? pending.input.id : pending.sessionId; }
  private begin() {
    this.abort?.abort(); this.abort = new AbortController();
    return { generation: ++this.generation, abort: this.abort };
  }
  private current(token: ReturnType<StudioWorkSessionController["begin"]>) {
    return !this.stopped && !token.abort.signal.aborted && token.generation === this.generation && this.active();
  }
  private persist(pending: Pending) {
    try { this.storage.setItem(this.storageKey, JSON.stringify(pending)); this.pending = pending; return true; }
    catch { this.publish({ ...this.state, phase: "failed", reason: "storage" }); return false; }
  }
  private clear() {
    try { this.storage.removeItem(this.storageKey); this.pending = null; return true; }
    catch { this.publish({ ...this.state, phase: "uncertain", reason: "storage", pending: true }); return false; }
  }
  private busy() { return this.state.phase === "saving" || this.state.phase === "loading"; }
  private arm(token: ReturnType<StudioWorkSessionController["begin"]>, writing: boolean) {
    return setTimeout(() => {
      if (!this.current(token)) return;
      token.abort.abort();
      this.publish({ ...this.state, view: null, list: null, phase: writing || this.pending ? "uncertain" : "failed",
        reason: writing || this.pending ? "uncertain" : "unavailable", pending: Boolean(this.pending) });
    }, 10_000);
  }
  private renewLease() {
    if (this.expiry) clearTimeout(this.expiry);
    this.expiry = setTimeout(() => this.suspend(), 15_000);
  }
  private failure(error: unknown, writing: boolean) {
    const status = httpStatus(error);
    if (status === 401 || status === 403) {
      this.publish({ phase: "failed", view: null, list: null, reason: "access-denied", pending: Boolean(this.pending) }); return;
    }
    if (writing && status && [400, 404, 409, 410, 422].includes(status)) {
      if (!this.clear()) return;
      this.publish({ phase: "failed", view: null, list: null, reason: status === 409 ? "conflict" : "rejected", pending: false }); return;
    }
    this.publish({ ...this.state, view: null, list: null, phase: this.pending ? "uncertain" : "failed",
      reason: this.pending ? "uncertain" : "unavailable", pending: Boolean(this.pending) });
  }
  private async verified(pending: Pending, result: StudioSessionMutation) {
    const sessionId = this.sessionId(pending), receipt = result.receipt, session = result.view.session;
    const expectedVersion = pending.kind === "create" ? 0 : pending.input.expectedVersion;
    if (receipt.actorUserId !== this.actorId || receipt.workId !== this.workId || receipt.sessionId !== sessionId
      || receipt.operationId !== pending.input.operationId || receipt.previousVersion !== expectedVersion || receipt.resultVersion !== expectedVersion + 1
      || session.id !== sessionId || session.workId !== this.workId || session.version < receipt.resultVersion
      || (pending.kind === "create" && canonicalJson(session.input) !== canonicalJson(pending.input.input))
      || receipt.requestHash !== await studioWorkSessionRequestHash(this.workId, sessionId, pending.input)) throw new Error("Unexpected mutation receipt");
  }
  private accept(pending: Pending, result: StudioSessionMutation) {
    if (!this.clear()) return;
    this.selected = this.sessionId(pending); this.renewLease();
    this.publish({ phase: "ready", view: result.view, list: null, reason: null, pending: false });
  }
  readonly refresh = async (): Promise<void> => {
    if (this.stopped || !this.active() || this.busy() || this.storageBlocked) return;
    if (this.pending) { await this.reconcile(false); return; }
    const token = this.begin(), sessionId = this.selected, timeout = this.arm(token, false);
    this.publish({ ...this.state, phase: "loading", reason: null });
    try {
      const result = sessionId ? await this.api.current(this.workId, sessionId, token.abort.signal)
        : await this.api.list(this.workId, token.abort.signal, this.cursor);
      if (!this.current(token)) return;
      if (sessionId) {
        const view = result as StudioWorkSessionView;
        if (view.session.workId !== this.workId || view.session.id !== sessionId) throw new Error("Unexpected session");
        this.publish({ phase: "ready", view, list: null, reason: null, pending: false });
      } else {
        const list = result as StudioSessionList;
        if (list.items.some((item) => item.session.workId !== this.workId)) throw new Error("Unexpected session list");
        this.publish({ phase: "ready", view: null, list, reason: null, pending: false });
      }
      this.renewLease();
    } catch (error) { if (this.current(token)) this.failure(error, false); }
    finally { clearTimeout(timeout); }
  };
  readonly select = (sessionId: string | null, cursor: string | null = null) => {
    if (this.stopped || !this.active() || this.busy() || this.pending) return;
    this.selected = sessionId; this.cursor = cursor;
    this.publish({ phase: "idle", view: null, list: null, reason: null, pending: false });
    void this.refresh();
  };
  readonly create = async (input: Omit<StudioWorkSessionCreate, "id" | "operationId">) => {
    if (this.stopped || !this.active() || this.busy() || this.pending || this.storageBlocked || input.input.workId !== this.workId) return;
    const pending: Pending = { kind: "create", input: studioWorkSessionCreateSchema.parse({ ...input, id: this.id(), operationId: this.id() }) };
    await this.write(pending);
  };
  readonly command = async (intent: StudioWorkSessionIntent) => {
    const view = this.state.view;
    if (!view || this.stopped || !this.active() || this.busy() || this.pending || this.storageBlocked) return;
    const pending: Pending = { kind: "command", sessionId: view.session.id,
      input: studioWorkSessionCommandSchema.parse({ ...intent, expectedVersion: view.session.version, operationId: this.id() }) };
    await this.write(pending);
  };
  private async write(pending: Pending) {
    if (!this.active() || this.stopped || (this.pending && canonicalJson(this.pending) !== canonicalJson(pending)) || !this.persist(pending)) return;
    const token = this.begin(), timeout = this.arm(token, true);
    this.publish({ ...this.state, phase: "saving", reason: null, pending: true });
    try {
      const result = pending.kind === "create" ? await this.api.create(this.workId, pending.input, token.abort.signal)
        : await this.api.command(this.workId, pending.sessionId, pending.input, token.abort.signal);
      await this.verified(pending, result);
      if (this.current(token)) this.accept(pending, result);
    } catch (error) { if (this.current(token)) this.failure(error, true); }
    finally { clearTimeout(timeout); }
  }
  readonly reconcile = async (retry = false): Promise<void> => {
    const pending = this.pending;
    if (!pending || this.stopped || !this.active() || this.busy() || this.storageBlocked) return;
    const token = this.begin(), timeout = this.arm(token, false);
    this.publish({ ...this.state, phase: "loading", reason: "uncertain", pending: true });
    let absent: boolean;
    try {
      const result = await this.api.receipt(this.workId, this.sessionId(pending), pending.input.operationId, token.abort.signal);
      if (!this.current(token)) return;
      if (result.receipt) {
        const mutation = { view: result.view, receipt: result.receipt };
        await this.verified(pending, mutation);
        if (this.current(token)) this.accept(pending, mutation);
        return;
      }
      if (result.view.session.id !== this.sessionId(pending) || result.view.session.workId !== this.workId) throw new Error("Unexpected receipt scope");
      absent = true;
    } catch (error) {
      if (!this.current(token)) return;
      absent = httpStatus(error) === 404 && pending.kind === "create";
      if (!absent) { this.failure(error, false); return; }
    } finally { clearTimeout(timeout); }
    if (!this.current(token)) return;
    this.publish({ phase: "uncertain", view: null, list: null, reason: "uncertain", pending: true });
    // A lookup is never a write. Explicit retry reuses the identical persisted intent.
    if (absent && retry) await this.write(pending);
  };
  readonly suspend = () => {
    ++this.generation; this.abort?.abort(); this.abort = null;
    if (this.expiry) clearTimeout(this.expiry); this.expiry = null;
    this.publish({ phase: this.pending ? "uncertain" : "idle", view: null, list: null,
      reason: this.pending ? "uncertain" : null, pending: Boolean(this.pending) });
  };
  readonly dispose = () => { this.suspend(); this.stopped = true; this.listeners.clear(); };
}
