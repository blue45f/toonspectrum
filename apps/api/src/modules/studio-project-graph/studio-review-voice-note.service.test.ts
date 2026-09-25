import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrivateObjectStoragePort } from "../../infrastructure/private-object-storage/private-object-storage.port";
import { StudioReviewVoiceNoteRepositoryError, type StudioReviewVoiceNoteRepository } from "./studio-review-voice-note.repository";
import { StudioReviewVoiceNoteService } from "./studio-review-voice-note.service";

const subject = { schemaVersion: 1 as const, workId: "work", projectId: "project", artifactId: "artifact",
  reviewId: "review", revisionId: "revision", rootGraphHash: "a".repeat(64) };
const bytes = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x86, 0x81, 0x01]);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const object = { contractVersion: "toonspectrum.private-object-storage.v2" as const, providerId: "cloudflare-r2" as const,
  purpose: "derived" as const, digest: `sha256:${sha256}`, objectPath: `sha256/${sha256.slice(0, 2)}/${sha256}`,
  byteLength: bytes.length, contentType: "audio/webm" };
const note = { contract: "studio-review-voice-note-v1" as const, id: "note", subject, authorUserId: "actor", title: "Context",
  transcript: "The eye line should move slightly upward.", durationMs: 1_500, contentType: "audio/webm" as const,
  byteLength: bytes.length, sha256, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), deletedAt: null };
const input = { operationId: "operation", noteId: "note", subject, title: "Context", transcript: note.transcript, durationMs: 1_500, retentionDays: 14 };
const authorizeCreate = vi.fn(), create = vi.fn(), list = vi.fn(), read = vi.fn(), remove = vi.fn(), claimExpired = vi.fn(), objectReferenced = vi.fn();
const repository = { authorizeCreate, create, list, read, delete: remove, claimExpired, objectReferenced } as unknown as StudioReviewVoiceNoteRepository;
const uploadImmutable = vi.fn(), createSignedReadUrl = vi.fn(), deleteGeneratedObject = vi.fn(), verifyPrivatePurposeBuckets = vi.fn();
const storage = { uploadImmutable, createSignedReadUrl, deleteGeneratedObject, verifyPrivatePurposeBuckets } as unknown as PrivateObjectStoragePort;
let service: StudioReviewVoiceNoteService;

beforeEach(() => {
  vi.resetAllMocks();
  authorizeCreate.mockResolvedValue(undefined);
  uploadImmutable.mockResolvedValue(object);
  verifyPrivatePurposeBuckets.mockResolvedValue({ ready: true, privatePurposeBuckets: 1 });
  create.mockResolvedValue({ view: { note, canDelete: true }, replayed: false });
  list.mockResolvedValue({ items: [{ note, canDelete: true }] });
  read.mockResolvedValue({ view: { note, canDelete: true }, object });
  remove.mockResolvedValue({ view: { note: { ...note, deletedAt: new Date().toISOString() }, canDelete: true }, object, deleteObject: true, replayed: false });
  claimExpired.mockResolvedValue([]); objectReferenced.mockResolvedValue(false); deleteGeneratedObject.mockResolvedValue({ deleted: true });
  createSignedReadUrl.mockResolvedValue({ url: "https://storage.invalid/voice?sig=private", expiresAtEpochMs: Date.now() + 300_000 });
  service = new StudioReviewVoiceNoteService(repository, storage);
});

describe("review voice-note service", () => {
  it("uploads an explicit bounded recording and pins it to the supplied review identity", async () => {
    const result = await service.create("actor", "work", input, { buffer: bytes, size: bytes.length, mimetype: "audio/webm" });
    expect(result.view.note.subject).toEqual(subject);
    expect(authorizeCreate).toHaveBeenCalledWith("actor", "work", subject);
    expect(uploadImmutable).toHaveBeenCalledWith(expect.objectContaining({ purpose: "derived", contentType: "audio/webm",
      controlMetadata: expect.objectContaining({ documentId: "work", operationId: "operation" }) }));
    expect(create).toHaveBeenCalledWith("actor", "work", input, expect.objectContaining({ sha256, object }));
  });

  it.each([
    ["audio/webm", Buffer.from("not-webm")],
    ["audio/wav", Buffer.from("RIFFnot-wave")],
    ["text/plain", bytes],
  ])("rejects a mismatched or unsupported %s payload before storage", async (mimetype, buffer) => {
    await expect(service.create("actor", "work", input, { buffer, size: buffer.length, mimetype })).rejects.toThrow();
    expect(uploadImmutable).not.toHaveBeenCalled();
  });


  it("checks upload authority and exact review identity before allocating private storage", async () => {
    authorizeCreate.mockRejectedValueOnce(new StudioReviewVoiceNoteRepositoryError("forbidden"));
    await expect(service.create("actor", "work", input, { buffer: bytes, size: bytes.length, mimetype: "audio/webm" })).rejects.toHaveProperty("status", 403);
    expect(uploadImmutable).not.toHaveBeenCalled();
  });

  it("fails closed without private object storage", async () => {
    await expect(new StudioReviewVoiceNoteService(repository).create("actor", "work", input,
      { buffer: bytes, size: bytes.length, mimetype: "audio/webm" })).rejects.toHaveProperty("status", 503);
  });

  it("compensates an unreferenced object after the authoritative record fails", async () => {
    create.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(service.create("actor", "work", input, { buffer: bytes, size: bytes.length, mimetype: "audio/webm" })).rejects.toHaveProperty("status", 503);
    expect(objectReferenced).toHaveBeenCalledWith(object); expect(deleteGeneratedObject).toHaveBeenCalledWith({ object });
  });

  it("returns only a short-lived signed read after rechecking review access", async () => {
    const result = await service.signedRead("actor", "work", "note");
    expect(read).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenCalledWith("actor", "work", "note");
    expect(result.signedRead.url).toMatch(/^https:\/\/storage\.invalid/u);
    expect(result).not.toHaveProperty("object");
  });

  it("deletes immutable bytes only after the last active note reference is removed", async () => {
    await service.delete("actor", "work", "note", { operationId: "delete-op", expectedSha256: sha256 });
    expect(deleteGeneratedObject).toHaveBeenCalledWith({ object });
    remove.mockResolvedValueOnce({ view: { note, canDelete: true }, object, deleteObject: false, replayed: false });
    await service.delete("actor", "work", "note", { operationId: "delete-two", expectedSha256: sha256 });
    expect(deleteGeneratedObject).toHaveBeenCalledTimes(1);
  });
});
