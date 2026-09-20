import type { StudioSharedDocument } from "../studio-shared-document-client";
import type {
  StudioReviewCaptureInput,
  StudioReviewCaptureIntent,
} from "../virtual-space/studio-virtual-space-review-producer";
import type { StudioVirtualSpaceReviewSubject } from "../virtual-space/studio-virtual-space-review-subject";

export interface StudioReviewCaptureContext {
  readonly workId: string | null;
  /** Auth, document and access generations; never a bearer token. */
  readonly scopeKey: string;
  readonly generation: number | string;
  readonly available: boolean;
}
export interface StudioReviewCaptureProjection {
  readonly doc: Record<string, unknown>;
  readonly title: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly titleId: string | null;
  readonly seriesId: string | null;
  readonly challengeId: string | null;
  readonly pageCount: number;
}
export type StudioReviewCapturePhase = "idle" | "checking" | "needs-save" | "saving"
  | "preparing" | "capturing" | "uploading" | "uncertain" | "failed"
  | "cancelling" | "cancel-uncertain" | "cleanup-pending" | "cancelled" | "completed";
export interface StudioReviewCaptureSnapshot {
  readonly phase: StudioReviewCapturePhase;
  readonly reason: "unavailable" | "not-saved" | "changed" | "request-failed" | "image-rejected" | null;
  readonly title: string | null;
  readonly sourceRevision: number | null;
  readonly pageCount: number | null;
  readonly completedPages: number;
  readonly canRetry: boolean;
  readonly subject: StudioVirtualSpaceReviewSubject | null;
}
export const EMPTY_STUDIO_REVIEW_CAPTURE: StudioReviewCaptureSnapshot = Object.freeze({
  phase: "idle", reason: null, title: null, sourceRevision: null, pageCount: null,
  completedPages: 0, canRetry: false, subject: null,
});

export interface StudioReviewCaptureBridgeDependencies {
  getContext(): StudioReviewCaptureContext;
  readSaved(workId: string, signal: AbortSignal): Promise<StudioSharedDocument>;
  projectRuntime(saved: StudioSharedDocument): Promise<StudioReviewCaptureProjection>;
  digest(doc: Record<string, unknown>): Promise<string>;
  save(status: "draft" | "published"): Promise<void>;
  captureAll(): Promise<readonly HTMLCanvasElement[]>;
  encodePng(canvas: HTMLCanvasElement): Promise<Blob>;
  makeInputId(): string;
  getDeviceId(): string;
  now(): string;
  prepare(input: StudioReviewCaptureInput, signal: AbortSignal): Promise<StudioReviewCaptureIntent>;
  produce(intent: StudioReviewCaptureIntent, pages: readonly Blob[], signal: AbortSignal,
    progress: (completed: number) => void): Promise<StudioVirtualSpaceReviewSubject>;
  cancelRemote(input: StudioReviewCaptureInput | StudioReviewCaptureIntent): Promise<
    { status: "cancelled"; cleanupPending?: boolean }
    | { status: "completed"; subject: StudioVirtualSpaceReviewSubject }>;
}

interface SourcePin {
  readonly context: StudioReviewCaptureContext;
  readonly saved: StudioSharedDocument;
  readonly digest: string;
  readonly pageCount: number;
  readonly matches: boolean;
}
class CaptureChangedError extends Error {}
class CaptureUnavailableError extends Error {}

function sameContext(a: StudioReviewCaptureContext, b: StudioReviewCaptureContext) {
  return b.available && a.workId === b.workId && a.scopeKey === b.scopeKey
    && a.generation === b.generation;
}
function retryableRequest(error: unknown) {
  return typeof error === "object" && error !== null
    && (Reflect.get(error, "retryable") === true || Reflect.get(error, "ambiguous") === true);
}

/** One explicit capture intent. Unknown writes retain the exact ID, head pin and PNG objects. */
export class StudioReviewCaptureBridge {
  private snapshot = EMPTY_STUDIO_REVIEW_CAPTURE;
  private listeners = new Set<() => void>();
  private epoch = 0;
  private busy = false;
  private abort: AbortController | null = null;
  private pin: SourcePin | null = null;
  private input: StudioReviewCaptureInput | null = null;
  private intent: StudioReviewCaptureIntent | null = null;
  private pages: readonly Blob[] | null = null;
  private disposed = false;

  constructor(private readonly dependencies: StudioReviewCaptureBridgeDependencies) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private update(patch: Partial<StudioReviewCaptureSnapshot>) {
    this.snapshot = Object.freeze({ ...this.snapshot, ...patch });
    if (!this.disposed) this.listeners.forEach((listener) => listener());
  }
  private assertCurrent(epoch: number, context?: StudioReviewCaptureContext) {
    if (this.disposed || epoch !== this.epoch || this.abort?.signal.aborted
      || (context && !sameContext(context, this.dependencies.getContext()))) {
      throw new CaptureChangedError();
    }
  }
  private async readPin(epoch: number, signal: AbortSignal): Promise<SourcePin> {
    const context = this.dependencies.getContext();
    if (!context.available || !context.workId) throw new CaptureUnavailableError();
    const saved = await this.dependencies.readSaved(context.workId, signal);
    this.assertCurrent(epoch, context);
    if (saved.workId !== context.workId || !saved.capabilities.edit
      || saved.document.format !== "cuttoon") throw new CaptureUnavailableError();
    const runtime = await this.dependencies.projectRuntime(saved);
    this.assertCurrent(epoch, context);
    const [digest, runtimeDigest] = await Promise.all([
      this.dependencies.digest(saved.document.doc), this.dependencies.digest(runtime.doc),
    ]);
    this.assertCurrent(epoch, context);
    const savedPages = saved.document.doc.pagesList;
    const matches = digest === runtimeDigest && runtime.title === saved.document.title
      && runtime.description === saved.document.description
      && JSON.stringify(runtime.tags) === JSON.stringify(saved.document.tags)
      && runtime.titleId === saved.document.titleId && runtime.seriesId === saved.document.seriesId
      && runtime.challengeId === saved.document.challengeId
      && Array.isArray(savedPages) && runtime.pageCount === savedPages.length
      && runtime.pageCount > 0;
    return { context, saved, digest, pageCount: runtime.pageCount, matches };
  }
  private samePin(a: SourcePin, b: SourcePin) {
    return b.matches && sameContext(a.context, b.context)
      && a.saved.revision === b.saved.revision && a.digest === b.digest
      && a.pageCount === b.pageCount;
  }

  start = () => this.run(false);
  saveAndStart = () => this.run(true);
  private async run(saveFirst: boolean) {
    if (this.disposed || this.busy || this.input || this.snapshot.subject) return;
    const epoch = ++this.epoch;
    this.busy = true;
    const abort = new AbortController();
    this.abort = abort;
    this.update({ phase: "checking", reason: null, canRetry: false });
    try {
      if (!this.dependencies.getContext().workId) {
        // A local-only editor must keep its existing destination/permission flow. Its resolved
        // Promise is not evidence of a server save and never authorizes a capture or upload.
        if (saveFirst) await this.dependencies.save("draft");
        this.assertCurrent(epoch);
        this.update({ phase: "needs-save", reason: "unavailable" });
        return;
      }
      let pin = await this.readPin(epoch, abort.signal);
      this.update({ title: pin.saved.document.title, sourceRevision: pin.saved.revision,
        pageCount: pin.pageCount });
      if (!pin.matches && saveFirst) {
        const scope = pin.context.scopeKey;
        this.update({ phase: "saving" });
        await this.dependencies.save(pin.saved.role === "owner"
          ? pin.saved.document.status : "draft");
        this.assertCurrent(epoch);
        if (this.dependencies.getContext().scopeKey !== scope) throw new CaptureChangedError();
        pin = await this.readPin(epoch, abort.signal);
      }
      if (!pin.matches) {
        this.update({ phase: "needs-save", reason: "not-saved" });
        return;
      }
      this.pin = pin;
      this.input = Object.freeze({
        intentId: this.dependencies.makeInputId(), workId: pin.saved.workId,
        sourceServerRevision: pin.saved.revision, sourceContentDigest: pin.digest,
        pageCount: pin.pageCount, title: pin.saved.document.title,
        deviceId: this.dependencies.getDeviceId(), createdAt: this.dependencies.now(),
      });
      this.update({ sourceRevision: pin.saved.revision, title: pin.saved.document.title });
      await this.continueCapture(epoch, abort.signal);
    } catch (error) {
      await this.failed(error, epoch);
    } finally {
      if (epoch === this.epoch) this.busy = false;
    }
  }

  private async continueCapture(epoch: number, signal: AbortSignal) {
    if (!this.input || !this.pin) throw new CaptureUnavailableError();
    this.assertCurrent(epoch, this.pin.context);
    if (!this.intent) {
      this.update({ phase: "preparing", reason: null, canRetry: false });
      this.intent = await this.dependencies.prepare(this.input, signal);
      this.assertCurrent(epoch, this.pin.context);
    }
    if (!this.pages) {
      this.update({ phase: "capturing" });
      const canvases = await this.dependencies.captureAll();
      this.assertCurrent(epoch, this.pin.context);
      if (canvases.length !== this.pin.pageCount) throw new CaptureChangedError();
      const pages: Blob[] = [];
      for (const canvas of canvases) {
        const page = await this.dependencies.encodePng(canvas);
        this.assertCurrent(epoch, this.pin.context);
        if (page.type !== "image/png" || !page.size) throw new CaptureUnavailableError();
        pages.push(page);
      }
      this.pages = Object.freeze(pages);
      const afterCapture = await this.readPin(epoch, signal);
      if (!this.samePin(this.pin, afterCapture)) throw new CaptureChangedError();
    }
    this.assertCurrent(epoch, this.pin.context);
    this.update({ phase: "uploading", reason: null, canRetry: false });
    const subject = await this.dependencies.produce(this.intent, this.pages, signal, (completed) => {
      if (epoch === this.epoch && !this.disposed) this.update({ completedPages: completed });
    });
    this.assertCurrent(epoch, this.pin.context);
    this.pages = null;
    this.update({ phase: "completed", subject, completedPages: this.pin.pageCount });
  }
  private async failed(error: unknown, epoch: number) {
    if (epoch !== this.epoch || this.disposed) return;
    if (error instanceof CaptureChangedError) {
      await this.cancel("changed");
    } else if (this.input && retryableRequest(error)) {
      this.update({ phase: "uncertain", reason: "request-failed", canRetry: true });
    } else if (this.input) {
      const code = typeof error === "object" && error !== null ? Reflect.get(error, "code") : null;
      const imageRejected = typeof code === "string" && ["preview-pages-invalid", "preview-page-invalid",
        "preview-byte-budget-exceeded", "preview-pixel-budget-exceeded", "preview-pixel-format-unsupported",
        "preview-color-profile-unsupported", "preview-png-invalid", "preview-png-required"].includes(code);
      await this.cancel(imageRejected ? "image-rejected"
        : error instanceof CaptureUnavailableError ? "unavailable" : "request-failed");
    } else {
      this.update({ phase: "failed", reason: error instanceof CaptureUnavailableError
        ? "unavailable" : "request-failed", canRetry: true });
    }
  }
  retry = async () => {
    if (this.disposed || this.busy || !this.snapshot.canRetry) return;
    if (["cancel-uncertain", "cleanup-pending"].includes(this.snapshot.phase)) {
      await this.cancel(this.snapshot.reason); return;
    }
    if (!this.input) { await this.run(false); return; }
    // A changed editor may reconcile a completed operation through cancel, but cannot resume
    // uploads or create new bytes under the old consent/intent identity.
    if (!this.pin || !sameContext(this.pin.context, this.dependencies.getContext())) {
      await this.cancel("changed"); return;
    }
    const epoch = ++this.epoch;
    this.busy = true;
    this.abort = new AbortController();
    try { await this.continueCapture(epoch, this.abort.signal); }
    catch (error) { await this.failed(error, epoch); }
    finally { if (epoch === this.epoch) this.busy = false; }
  };
  cancel = async (reason: StudioReviewCaptureSnapshot["reason"] = null) => {
    if (this.snapshot.phase === "completed" || this.snapshot.phase === "cancelling"
      || this.snapshot.phase === "cancelled") return;
    const cancellationConfirmed = this.snapshot.phase === "cleanup-pending";
    ++this.epoch;
    this.abort?.abort();
    this.busy = false;
    if (!this.input) { this.update({ phase: "cancelled", reason, canRetry: false }); return; }
    this.update({ phase: "cancelling", reason, canRetry: false });
    try {
      const result = await this.dependencies.cancelRemote(this.intent ?? this.input);
      if (result.status === "completed") {
        this.pages = null;
        this.update({ phase: "completed", subject: result.subject,
          reason: null, canRetry: false, completedPages: this.input.pageCount });
      }
      else {
        this.pages = null;
        this.update({ phase: result.cleanupPending ? "cleanup-pending" : "cancelled",
          reason, canRetry: result.cleanupPending === true });
      }
    } catch {
      this.update({ phase: cancellationConfirmed ? "cleanup-pending" : "cancel-uncertain", reason, canRetry: true });
    }
  };
  /** Host also invokes this on document/access changes while an asynchronous request is pending. */
  checkScope = () => {
    if (this.pin && !sameContext(this.pin.context, this.dependencies.getContext())
      && !["cancelled", "cancelling", "cancel-uncertain", "cleanup-pending", "completed"].includes(this.snapshot.phase)) {
      void this.cancel("changed");
    }
  };
  dispose = () => {
    this.disposed = true;
    this.listeners.clear();
    void this.cancel("changed");
  };
}

export function encodeStudioReviewCapturePng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (canvas.width <= 0 || canvas.height <= 0) { reject(new CaptureUnavailableError()); return; }
    canvas.toBlob((blob) => blob?.type === "image/png" && blob.size > 0
      ? resolve(blob) : reject(new CaptureUnavailableError()), "image/png");
  });
}
