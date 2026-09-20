// @vitest-environment node
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildStudioPackageArchiveBlob } from "../studio-package-archive";
import { readStudioZipArchive } from "../studio-zip-reader";
import { reviewProductionFixture } from "../review-production/studio-review-production-test-fixture";
import { prepareStudioReviewExport, readStudioReviewExportBytes, type StudioReviewExportDependencies } from "./studio-review-export";

const now = Date.parse("2026-09-20T03:00:00Z");
function fixture() {
  const verified = reviewProductionFixture(now).verified;
  const bytes = [new TextEncoder().encode("exact first stored PNG bytes"), new TextEncoder().encode("exact second stored PNG bytes")];
  const previews = bytes.map((value, ordinal) => ({ ordinal, sha256: createHash("sha256").update(value).digest("hex"),
    byteLength: value.byteLength, mediaType: "image/png" as const, url: `https://private.example/image-${ordinal}?credential=secret`,
    expiresAt: now + 30_000, mapping: { status: "unmapped" as const, reason: "legacy-review" as const } }));
  const approved = { ...verified, review: { ...verified.review, status: "approved" as const, decidedAt: "2026-09-20T02:00:00Z", decidedBy: "actor", openRequiredCommentCount: 0 },
    revision: { ...verified.revision, blobRefs: previews.map(({ ordinal, sha256 }) => ({ ordinal, sha256, role: "preview" as const })) } };
  const verify = vi.fn<StudioReviewExportDependencies["verify"]>(async () => approved);
  const read = vi.fn(async (_subject, cursor) => ({ ok: true as const, subject: verified.subject,
    previews: [previews[cursor ? 1 : 0]!], nextCursor: cursor ? null : `0.${previews[0]!.sha256}` }));
  const deps: StudioReviewExportDependencies = { verify, previews: read,
    bytes: vi.fn(async (preview) => bytes[preview.ordinal]!), now: () => now,
    archive: vi.fn((entries, options) => buildStudioPackageArchiveBlob(entries, { ...options, crc32ExecutionMode: "direct-headless" })) };
  const controller = new AbortController();
  const options = { signal: controller.signal, isCurrent: () => true };
  return { approved, bytes, previews, verify, read, deps, options, controller, subject: verified.subject };
}
afterEach(() => vi.unstubAllGlobals());
describe("approved review image export", () => {
  it("packages every exact stored page and pin, even after a newer editable head, without private URLs or notes", async () => {
    const f = fixture(), result = await prepareStudioReviewExport(f.subject, f.options, f.deps);
    const archive = await readStudioZipArchive(new Uint8Array(await result.blob.arrayBuffer()));
    expect(archive.entries.map((entry) => entry.path)).toEqual(["manifest.json", "README.txt", "pages/000001.png", "pages/000002.png"]);
    expect(await archive.readEntry("pages/000001.png")).toEqual(f.bytes[0]);
    expect(await archive.readEntry("pages/000002.png")).toEqual(f.bytes[1]);
    const text = new TextDecoder().decode(await archive.readEntry("manifest.json"));
    expect(JSON.parse(text)).toMatchObject({ subject: f.subject, reviewDecision: { status: "approved" }, pages: [{ sha256: f.previews[0]!.sha256 }, { sha256: f.previews[1]!.sha256 }] });
    for (const forbidden of ["credential", "private.example", "손의 방향", "editor", "decidedBy", "access", "latest"]) expect(text).not.toContain(forbidden);
    expect(f.verify).toHaveBeenCalledTimes(2); expect(f.read).toHaveBeenCalledTimes(4);
  });
  it.each(["open", "changes-requested", "rejected", "cancelled"] as const)("refuses %s and does not fetch images", async (status) => {
    const f = fixture(); f.verify.mockResolvedValue({ ...f.approved, review: { ...f.approved.review, status } });
    await expect(prepareStudioReviewExport(f.subject, f.options, f.deps)).rejects.toMatchObject({ reason: "not-approved" });
    expect(f.deps.bytes).not.toHaveBeenCalled(); expect(f.deps.archive).not.toHaveBeenCalled();
  });
  it("rejects a missing final page and a duplicated ordinal", async () => {
    const f = fixture(); f.read.mockResolvedValueOnce({ ok: true, subject: f.subject, previews: [f.previews[0]!], nextCursor: null });
    await expect(prepareStudioReviewExport(f.subject, f.options, f.deps)).rejects.toMatchObject({ reason: "integrity" });
    const g = fixture(); g.read.mockResolvedValueOnce({ ok: true, subject: g.subject, previews: [g.previews[0]!, g.previews[0]!], nextCursor: null });
    await expect(prepareStudioReviewExport(g.subject, g.options, g.deps)).rejects.toMatchObject({ reason: "integrity" });
  });
  it("refuses same-sized corrupt image bytes before archiving", async () => {
    const f = fixture(); vi.mocked(f.deps.bytes).mockResolvedValueOnce(new Uint8Array(f.bytes[0]!.length));
    await expect(prepareStudioReviewExport(f.subject, f.options, f.deps)).rejects.toMatchObject({ reason: "integrity" });
    expect(f.deps.archive).not.toHaveBeenCalled();
  });
  it("discards the archive if current access is revoked during packing", async () => {
    const f = fixture(); f.deps.verify = vi.fn().mockResolvedValueOnce(f.approved).mockResolvedValueOnce({ ok: false, reason: "access-denied" });
    await expect(prepareStudioReviewExport(f.subject, f.options, f.deps)).rejects.toMatchObject({ reason: "access-denied" });
    expect(f.deps.archive).toHaveBeenCalledOnce();
  });
  it("rechecks private object ownership after packing and refuses deleted previews", async () => {
    const f = fixture(); const original = f.deps.previews;
    f.deps.previews = vi.fn<StudioReviewExportDependencies["previews"]>(async (subject, cursor) => f.read.mock.calls.length < 2 ? original(subject, cursor) : { ok: false, reason: "preview-unavailable" });
    await expect(prepareStudioReviewExport(f.subject, f.options, f.deps)).rejects.toMatchObject({ reason: "unavailable" });
    expect(f.deps.archive).toHaveBeenCalledOnce();
  });
  it("fences cancellation, actor replacement and hidden late reads without releasing a ZIP", async () => {
    const f = fixture(); f.verify.mockImplementationOnce(async () => { f.controller.abort(); return f.approved; });
    await expect(prepareStudioReviewExport(f.subject, f.options, f.deps)).rejects.toMatchObject({ reason: "cancelled" });
    expect(f.read).not.toHaveBeenCalled();
    const g = fixture(); let current = true;
    vi.mocked(g.deps.bytes).mockImplementationOnce(async () => { current = false; return g.bytes[0]!; });
    await expect(prepareStudioReviewExport(g.subject, { ...g.options, isCurrent: () => current }, g.deps)).rejects.toMatchObject({ reason: "cancelled" });
    expect(g.deps.archive).not.toHaveBeenCalled();
  });
  it("refuses final approval identity or immutable reference changes", async () => {
    const f = fixture(); f.verify.mockResolvedValueOnce(f.approved).mockResolvedValueOnce({ ...f.approved, review: { ...f.approved.review, decidedBy: "changed-actor" } });
    await expect(prepareStudioReviewExport(f.subject, f.options, f.deps)).rejects.toMatchObject({ reason: "changed" });
  });
  it("does not release a completed archive after its final verification expires", async () => {
    const f = fixture(); let time = now;
    f.deps.now = () => time;
    const original = f.deps.previews;
    f.deps.previews = async (subject, cursor) => { const page = await original(subject, cursor); if (f.read.mock.calls.length === 4) time = now + 16_000; return page; };
    await expect(prepareStudioReviewExport(f.subject, f.options, f.deps)).rejects.toMatchObject({ reason: "changed" });
  });
  it("renews an expired later page URL without downloading completed pages again", async () => {
    const f = fixture(); let time = now;
    f.deps.now = () => time;
    f.verify.mockImplementation(async () => ({ ...f.approved, expiresAt: time + 15_000 }));
    const original = f.deps.previews;
    f.deps.previews = async (subject, cursor) => { const page = await original(subject, cursor); return page.ok
      ? { ...page, previews: page.previews.map((preview) => ({ ...preview, expiresAt: time + 30_000 })) } : page; };
    vi.mocked(f.deps.bytes).mockImplementation(async (preview) => { if (preview.ordinal === 0) time += 31_000; return f.bytes[preview.ordinal]!; });
    const result = await prepareStudioReviewExport(f.subject, f.options, f.deps);
    expect(result.manifest.pages).toHaveLength(2);
    expect(f.deps.bytes).toHaveBeenCalledTimes(2);
    expect(f.read).toHaveBeenCalledTimes(5);
    expect(f.read.mock.calls[2]![1]).toBe(`0.${f.previews[0]!.sha256}`);
  });
});
describe("authorized preview byte reader", () => {
  it("preserves bytes and sends no credentials or referrer", async () => {
    const f = fixture(), fetch = vi.fn(async () => new Response(f.bytes[0], { headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", fetch);
    expect(await readStudioReviewExportBytes(f.previews[0]!, f.options.signal)).toEqual(f.bytes[0]);
    expect(fetch).toHaveBeenCalledWith(f.previews[0]!.url, expect.objectContaining({ credentials: "omit", referrerPolicy: "no-referrer", redirect: "error", cache: "no-store" }));
  });
  it.each(["type", "oversized", "truncated"])("rejects a %s response", async (kind) => {
    const f = fixture(), body = kind === "oversized" ? new Uint8Array(f.bytes[0]!.length + 1) : kind === "truncated" ? new Uint8Array(1) : f.bytes[0]!;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { headers: { "content-type": kind === "type" ? "text/html" : "image/png" } })));
    await expect(readStudioReviewExportBytes(f.previews[0]!, f.options.signal)).rejects.toMatchObject({ reason: "integrity" });
  });
});
