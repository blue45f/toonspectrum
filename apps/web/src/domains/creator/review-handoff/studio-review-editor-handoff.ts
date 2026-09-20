import { canonicalJson, deriveStudioReviewPageMapping, validateStudioReviewSpatialAnchor,
  type ReviewAnchor, type StudioReviewMappedPage } from "@toonspectrum/studio-project-model";

import type { StudioEditorCommentTarget } from "../studio-comment-editor-selection";
import type { StudioReviewCaptureContext, StudioReviewCaptureProjection } from "../review-capture/studio-review-capture-bridge";
import type { StudioSharedDocument } from "../studio-shared-document-client";
import { parseStudioVirtualSpaceReviewSubject,
  type StudioVirtualSpaceReviewSubject } from "../virtual-space/studio-virtual-space-review-subject";

export interface StudioReviewEditorRequest { readonly subject: StudioVirtualSpaceReviewSubject; readonly commentId: string }
export interface StudioReviewEditorAuthority { readonly anchor: ReviewAnchor; readonly mapping: StudioReviewMappedPage; readonly expiresAt: number }
export interface StudioReviewEditorContext extends StudioReviewCaptureContext { readonly pageId: string }
export type StudioReviewEditorFailure = "unavailable" | "access-denied" | "unmapped" | "source-changed" | "unsaved" | "context-changed" | "navigation-rejected";
export class StudioReviewEditorError extends Error {
  constructor(readonly reason: StudioReviewEditorFailure) { super(reason); }
}
export interface StudioReviewEditorSnapshot {
  readonly phase: "idle" | "checking" | "selected" | "failed" | "cancelled";
  readonly reason: StudioReviewEditorFailure | null;
  /** Coordinates/regions can locate their exact page or explicitly named cut, never a nearby object. */
  readonly extent: "page" | "cut" | "object" | null;
}
export const EMPTY_STUDIO_REVIEW_EDITOR: StudioReviewEditorSnapshot = Object.freeze({ phase: "idle", reason: null, extent: null });
export interface StudioReviewEditorDependencies {
  getContext(): StudioReviewEditorContext;
  readAuthority(request: StudioReviewEditorRequest, signal: AbortSignal): Promise<StudioReviewEditorAuthority>;
  readSaved(workId: string, signal: AbortSignal): Promise<StudioSharedDocument>;
  projectRuntime(saved: StudioSharedDocument): StudioReviewCaptureProjection;
  digest(doc: Record<string, unknown>): Promise<string>;
  select(target: StudioEditorCommentTarget, current: () => boolean): boolean;
  now(): number;
}

export function parseStudioReviewEditorRequest(value: StudioReviewEditorRequest): StudioReviewEditorRequest | null {
  const subject = parseStudioVirtualSpaceReviewSubject(value.subject);
  return subject && typeof value.commentId === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(value.commentId)
    ? Object.freeze({ subject, commentId: value.commentId }) : null;
}

function sameContext(start: StudioReviewEditorContext, current: StudioReviewEditorContext, includePage = true) {
  return current.available && start.workId === current.workId && start.scopeKey === current.scopeKey
    && start.generation === current.generation && (!includePage || start.pageId === current.pageId);
}
function projectionMatches(saved: StudioSharedDocument, runtime: StudioReviewCaptureProjection) {
  return runtime.title === saved.document.title && runtime.description === saved.document.description
    && canonicalJson(runtime.tags) === canonicalJson(saved.document.tags)
    && runtime.titleId === saved.document.titleId && runtime.seriesId === saved.document.seriesId
    && runtime.challengeId === saved.document.challengeId && runtime.pageCount > 0;
}
function requireSaved(saved: StudioSharedDocument, request: StudioReviewEditorRequest, authority: StudioReviewEditorAuthority) {
  if (!saved.capabilities.edit || saved.access !== "edit") throw new StudioReviewEditorError("access-denied");
  if (saved.workId !== request.subject.workId || saved.document.format !== "cuttoon"
    || saved.revision !== authority.mapping.sourceServerRevision) throw new StudioReviewEditorError("source-changed");
}
function targetFor(authority: StudioReviewEditorAuthority): StudioEditorCommentTarget {
  const { anchor, mapping } = authority;
  if (mapping.status !== "mapped" || !validateStudioReviewSpatialAnchor(mapping, anchor) || !anchor.source) {
    throw new StudioReviewEditorError("unmapped");
  }
  const element = mapping.page.elements.find((item) => item.id === anchor.source?.elementId);
  return { pageId: mapping.page.id,
    ...(anchor.source.frameId ? { elementId: anchor.source.frameId, frame: true } : {}),
    ...(element ? { elementId: element.id, master: element.origin === "master" } : {}) };
}

/** Read-only handoff. No save, mutation receipt, historical restore or replayed server write exists. */
export class StudioReviewEditorHandoff {
  private snapshot = EMPTY_STUDIO_REVIEW_EDITOR;
  private listeners = new Set<() => void>();
  private epoch = 0;
  private pending: { abort: AbortController; promise: Promise<void>; requestKey: string } | null = null;
  private disposed = false;
  constructor(private readonly deps: StudioReviewEditorDependencies) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(snapshot: StudioReviewEditorSnapshot) {
    if (this.disposed) return;
    this.snapshot = Object.freeze(snapshot); this.listeners.forEach((listener) => listener());
  }
  start(raw: StudioReviewEditorRequest): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const request = parseStudioReviewEditorRequest(raw);
    if (this.pending) {
      if (request && this.pending.requestKey === canonicalJson(request)) return this.pending.promise;
      this.cancel();
    }
    const context = this.deps.getContext();
    if (!request || !context.available || context.workId !== request.subject.workId) {
      this.publish({ phase: "failed", reason: "unavailable", extent: null }); return Promise.resolve();
    }
    const epoch = ++this.epoch, abort = new AbortController();
    // Schedule after pending ownership is installed, including synchronous dependency failures.
    const promise = Promise.resolve().then(() => this.run(request, context, epoch, abort)).finally(() => {
      if (this.pending?.abort === abort) this.pending = null;
    });
    this.pending = { abort, promise, requestKey: canonicalJson(request) };
    this.publish({ phase: "checking", reason: null, extent: null });
    return promise;
  }
  private async run(request: StudioReviewEditorRequest, context: StudioReviewEditorContext, epoch: number, abort: AbortController) {
    const current = (includePage = true) => !this.disposed && epoch === this.epoch && !abort.signal.aborted
      && sameContext(context, this.deps.getContext(), includePage);
    const assert = () => { if (!current()) throw new StudioReviewEditorError("context-changed"); };
    try {
      assert();
      const [authority, saved] = await Promise.all([
        this.deps.readAuthority(request, abort.signal), this.deps.readSaved(request.subject.workId, abort.signal),
      ]);
      assert(); requireSaved(saved, request, authority);
      if (authority.anchor.artifactId !== request.subject.artifactId || authority.anchor.revisionId !== request.subject.revisionId) {
        throw new StudioReviewEditorError("source-changed");
      }
      const target = targetFor(authority), runtime = this.deps.projectRuntime(saved);
      const savedJson = canonicalJson(saved.document), runtimeJson = canonicalJson(runtime);
      const [savedDigest, runtimeDigest] = await Promise.all([
        this.deps.digest(saved.document.doc), this.deps.digest(runtime.doc),
      ]);
      assert();
      if (savedDigest !== authority.mapping.sourceContentDigest || savedDigest !== request.subject.rootGraphHash) {
        throw new StudioReviewEditorError("source-changed");
      }
      if (savedDigest !== runtimeDigest || !projectionMatches(saved, runtime)) throw new StudioReviewEditorError("unsaved");
      const runtimeMapping = deriveStudioReviewPageMapping(runtime.doc, {
        sourceServerRevision: saved.revision, sourceContentDigest: savedDigest, ordinal: authority.mapping.page.ordinal,
        renderWidth: authority.mapping.page.renderWidth, renderHeight: authority.mapping.page.renderHeight,
      });
      if (!validateStudioReviewSpatialAnchor(runtimeMapping, authority.anchor)
        || canonicalJson(runtimeMapping) !== canonicalJson(authority.mapping)) throw new StudioReviewEditorError("source-changed");
      // Renew ACL/comment/source after hashing. The final synchronous projection closes edits
      // arriving while the reads or crypto were pending, even before React publishes state.
      const [finalAuthority, finalSaved] = await Promise.all([
        this.deps.readAuthority(request, abort.signal), this.deps.readSaved(request.subject.workId, abort.signal),
      ]);
      assert(); requireSaved(finalSaved, request, finalAuthority);
      if (canonicalJson(finalSaved.document) !== savedJson || finalSaved.revision !== saved.revision
        || canonicalJson(finalAuthority.anchor) !== canonicalJson(authority.anchor)
        || canonicalJson(finalAuthority.mapping) !== canonicalJson(authority.mapping)) throw new StudioReviewEditorError("source-changed");
      // The renewed read proves both ACL and identical source. Large-document hashing may
      // outlive the first read lease; only the fresh lease can authorize the final selection.
      if (this.deps.now() >= finalAuthority.expiresAt) throw new StudioReviewEditorError("access-denied");
      if (canonicalJson(this.deps.projectRuntime(finalSaved)) !== runtimeJson) throw new StudioReviewEditorError("unsaved");
      assert();
      if (!this.deps.select(target, () => current(false))) throw new StudioReviewEditorError("navigation-rejected");
      if (!current(false)) throw new StudioReviewEditorError("context-changed");
      this.publish({ phase: "selected", reason: null, extent: target.frame ? "cut" : target.elementId ? "object" : "page" });
    } catch (error) {
      if (!this.disposed && epoch === this.epoch) this.publish({ phase: "failed", extent: null,
        reason: error instanceof StudioReviewEditorError ? error.reason : "unavailable" });
    }
  }
  cancel() {
    ++this.epoch; this.pending?.abort.abort(); this.pending = null;
    this.publish({ phase: "cancelled", reason: null, extent: null });
  }
  dispose() { this.cancel(); this.disposed = true; this.listeners.clear(); }
}
