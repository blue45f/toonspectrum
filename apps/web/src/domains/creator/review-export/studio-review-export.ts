import { canonicalJson } from "@toonspectrum/studio-project-model";
import { buildStudioPackageArchiveBlob, STUDIO_PACKAGE_ARCHIVE_LIMITS } from "../studio-package-archive";
import { createStudioDownloadFileName } from "../export/studio-download-file-name";
import { verifyStudioVirtualSpaceReviewSubject, type StudioVirtualSpaceReviewVerification } from "../virtual-space/studio-virtual-space-review-invitation";
import { getStudioVirtualSpaceReviewPreview, type StudioVirtualSpaceReviewPreview, type StudioVirtualSpaceReviewPreviews } from "../virtual-space/studio-virtual-space-review-preview";
import { sameStudioVirtualSpaceReviewSubject, type StudioVirtualSpaceReviewSubject } from "../virtual-space/studio-virtual-space-review-subject";

export type StudioReviewExportReason = "not-approved" | "access-denied" | "changed" | "unavailable" | "cancelled" | "integrity";
export class StudioReviewExportError extends Error {
  constructor(readonly reason: StudioReviewExportReason) { super(reason); }
}
export interface StudioReviewExportProgress { readonly phase: "reading" | "images" | "archive" | "checking"; readonly completed: number; readonly total: number }
export interface StudioReviewExportDependencies {
  verify(subject: StudioVirtualSpaceReviewSubject): Promise<StudioVirtualSpaceReviewVerification>;
  previews(subject: StudioVirtualSpaceReviewSubject, cursor: string | null): Promise<StudioVirtualSpaceReviewPreviews>;
  bytes(preview: StudioVirtualSpaceReviewPreview, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>>;
  archive: typeof buildStudioPackageArchiveBlob;
  now(): number;
}

/** Read precisely the authorized object bytes. Never forward cookies or signed URLs to an archive. */
export async function readStudioReviewExportBytes(preview: StudioVirtualSpaceReviewPreview, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(preview.url, { signal, credentials: "omit", referrerPolicy: "no-referrer", redirect: "error", cache: "no-store" });
  if (!response.ok || !response.body || response.headers.get("content-type")?.split(";")[0]?.trim() !== preview.mediaType) throw new StudioReviewExportError("integrity");
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const value = await reader.read();
      if (value.done) break;
      length += value.value.byteLength;
      if (length > preview.byteLength || length > STUDIO_PACKAGE_ARCHIVE_LIMITS.maxEntryBytes) throw new StudioReviewExportError("integrity");
      chunks.push(value.value);
    }
    if (length !== preview.byteLength) throw new StudioReviewExportError("integrity");
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
const defaults: StudioReviewExportDependencies = {
  verify: (subject) => verifyStudioVirtualSpaceReviewSubject(subject, "view"),
  previews: getStudioVirtualSpaceReviewPreview, bytes: readStudioReviewExportBytes,
  archive: buildStudioPackageArchiveBlob, now: Date.now,
};

/** Exports a decided review's stored pixels; does not create an approved graph revision or a release. */
export async function prepareStudioReviewExport(subject: StudioVirtualSpaceReviewSubject, options: {
  readonly signal: AbortSignal;
  readonly isCurrent: () => boolean;
  readonly onProgress?: (progress: StudioReviewExportProgress) => void;
}, dependencies: StudioReviewExportDependencies = defaults) {
  const check = () => { if (options.signal.aborted || !options.isCurrent()) throw new StudioReviewExportError("cancelled"); };
  const progress = (phase: StudioReviewExportProgress["phase"], completed = 0, total = 0) => { check(); options.onProgress?.({ phase, completed, total }); };
  const verify = async () => {
    check(); const value = await dependencies.verify(subject); check();
    if (!value.ok) throw new StudioReviewExportError(value.reason === "access-denied" ? "access-denied" : "unavailable");
    if (!sameStudioVirtualSpaceReviewSubject(value.subject, subject) || value.expiresAt <= dependencies.now()
      || value.revision.id !== subject.revisionId || value.revision.rootGraphHash !== subject.rootGraphHash) throw new StudioReviewExportError("changed");
    if (!value.project.access.view) throw new StudioReviewExportError("access-denied");
    if (value.review.status !== "approved" || !value.review.decidedAt || !value.review.decidedBy
      || value.review.openRequiredCommentCount !== 0) throw new StudioReviewExportError("not-approved");
    return value;
  };
  progress("reading");
  const initial = await verify();
  const expected = initial.revision.blobRefs.filter((ref) => ref.role === "preview").sort((a, b) => a.ordinal - b.ordinal);
  if (!expected.length || expected.length + 2 > STUDIO_PACKAGE_ARCHIVE_LIMITS.maxFiles
    || new Set(expected.map((ref) => ref.ordinal)).size !== expected.length) throw new StudioReviewExportError("integrity");
  const identity = canonicalJson({ subject, decision: { at: initial.review.decidedAt, by: initial.review.decidedBy }, refs: expected });
  const readPreviews = async () => {
    const previews: StudioVirtualSpaceReviewPreview[] = [], seen = new Set<string>();
    let cursor: string | null = null;
    do {
      check(); const page = await dependencies.previews(subject, cursor); check();
      if (!page.ok) throw new StudioReviewExportError(page.reason === "access-denied" ? "access-denied" : "unavailable");
      if (!sameStudioVirtualSpaceReviewSubject(page.subject, subject) || !page.previews.length) throw new StudioReviewExportError("changed");
      for (const item of page.previews) {
        const ref = expected[previews.length];
        if (!ref || item.ordinal !== ref.ordinal || item.sha256 !== ref.sha256 || item.expiresAt <= dependencies.now()
          || item.byteLength <= 0 || item.byteLength > STUDIO_PACKAGE_ARCHIVE_LIMITS.maxEntryBytes) throw new StudioReviewExportError("integrity");
        previews.push(item);
      }
      cursor = page.nextCursor;
      if (cursor && (seen.has(cursor) || previews.length >= expected.length)) throw new StudioReviewExportError("integrity");
      if (cursor) seen.add(cursor);
    } while (cursor);
    if (previews.length !== expected.length || previews.reduce((sum, preview) => sum + preview.byteLength, 0) > STUDIO_PACKAGE_ARCHIVE_LIMITS.maxTotalBytes) throw new StudioReviewExportError("integrity");
    return previews;
  };
  const previews = await readPreviews();
  const images: { path: string; data: Uint8Array<ArrayBuffer> }[] = [];
  for (let index = 0; index < previews.length; index++) {
    let preview = previews[index]!;
    check();
    // Long downloads renew read URLs for the exact next object; they never restart completed pages.
    if (preview.expiresAt - dependencies.now() < 2_000) {
      const prior = previews[index - 1];
      const renewed = await dependencies.previews(subject, prior ? `${prior.ordinal}.${prior.sha256}` : null); check();
      if (!renewed.ok) throw new StudioReviewExportError(renewed.reason === "access-denied" ? "access-denied" : "unavailable");
      const next = renewed.previews[0];
      if (!sameStudioVirtualSpaceReviewSubject(renewed.subject, subject) || !next || next.ordinal !== preview.ordinal
        || next.sha256 !== preview.sha256 || next.byteLength !== preview.byteLength || next.mediaType !== preview.mediaType
        || next.expiresAt <= dependencies.now()) throw new StudioReviewExportError("changed");
      preview = next;
    }
    const bytes = await dependencies.bytes(preview, options.signal); check();
    const digest = await crypto.subtle.digest("SHA-256", bytes); check();
    const sha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    if (bytes.byteLength !== preview.byteLength || sha256 !== preview.sha256) throw new StudioReviewExportError("integrity");
    const extension = preview.mediaType === "image/jpeg" ? "jpg" : preview.mediaType === "image/webp" ? "webp" : "png";
    images.push({ path: `pages/${String(preview.ordinal + 1).padStart(6, "0")}.${extension}`, data: bytes });
    progress("images", images.length, previews.length);
  }
  const manifest = {
    schema: "toonstudio.approved-review-images/v1", preparedAt: new Date(dependencies.now()).toISOString(),
    subject, reviewDecision: { status: "approved", decidedAt: initial.review.decidedAt },
    content: "stored-review-images", checksum: "SHA-256",
    pages: previews.map((preview, index) => ({ ordinal: preview.ordinal, path: images[index]!.path,
      mediaType: preview.mediaType, byteLength: preview.byteLength, sha256: preview.sha256 })),
  };
  const text = new TextEncoder();
  progress("archive", 0, images.length);
  const blob = await dependencies.archive([
    { path: "manifest.json", data: text.encode(`${JSON.stringify(manifest, null, 2)}\n`) },
    { path: "README.txt", data: text.encode("ToonStudio approved review images\nOriginal stored image bytes and SHA-256 checksums.\nThis local manifest records a review decision; it is not a signed certificate, graph approval revision or public release.\nNo editable source, notes, member roster, credentials or signed URLs are included.\n") },
    ...images,
  ], { signal: options.signal, crc32ExecutionMode: "worker", mimeType: "application/zip",
    onProgress: (value) => progress("archive", Math.max(0, value.completedFiles - 2), images.length) });
  check(); progress("checking");
  // Building a large archive may outlive permissions or object ownership. Recheck both.
  const final = await verify();
  const finalRefs = final.revision.blobRefs.filter((ref) => ref.role === "preview").sort((a, b) => a.ordinal - b.ordinal);
  if (canonicalJson({ subject, decision: { at: final.review.decidedAt, by: final.review.decidedBy }, refs: finalRefs }) !== identity) throw new StudioReviewExportError("changed");
  const fresh = await readPreviews(); check();
  if (final.expiresAt <= dependencies.now() || fresh.some((preview, index) => preview.expiresAt <= dependencies.now()
    || preview.byteLength !== previews[index]!.byteLength || preview.mediaType !== previews[index]!.mediaType)) throw new StudioReviewExportError("changed");
  return { blob, manifest, fileName: createStudioDownloadFileName({ title: initial.review.title,
    fallbackTitle: "toonstudio", suffix: "approved-review", extension: "zip" }) };
}
