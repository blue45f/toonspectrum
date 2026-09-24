import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteStudioReviewVoiceNote,
  listStudioReviewVoiceNotes,
  readStudioReviewVoiceNote,
  uploadStudioReviewVoiceNote,
} from "./studio-review-voice-note-client";

const io = vi.hoisted(() => ({ post: vi.fn(), rawPost: vi.fn(), json: vi.fn() }));
vi.mock("@/infrastructure/api", () => ({
  api: { post: io.post, raw: { post: io.rawPost } },
  apiPath: (value: string) => `/api${value}`,
}));
const subject = { schemaVersion: 1 as const, workId: "work", projectId: "project", artifactId: "artifact",
  reviewId: "review", revisionId: "revision", rootGraphHash: "a".repeat(64) };
const note = { contract: "studio-review-voice-note-v1" as const, id: "note", subject, authorUserId: "actor", title: "Context",
  transcript: "Move the eye line upward.", durationMs: 1_200, contentType: "audio/webm" as const, byteLength: 4,
  sha256: "b".repeat(64), createdAt: "2026-09-24T00:00:00.000Z", expiresAt: "2026-10-08T00:00:00.000Z", deletedAt: null };
const view = { note, canDelete: true };

beforeEach(() => {
  vi.clearAllMocks();
  io.rawPost.mockReturnValue({ json: io.json });
});

describe("review voice-note client", () => {
  it("queries only the exact pinned review identity", async () => {
    io.post.mockResolvedValue({ items: [view] });
    expect(await listStudioReviewVoiceNotes(subject)).toEqual({ items: [view] });
    expect(io.post).toHaveBeenCalledExactlyOnceWith("/studio-project-graph/works/work/review-voice-notes/query", { subject },
      { signal: undefined, retry: 0, cache: "no-store" });
  });

  it("uploads multipart audio with immutable metadata and no automatic retry", async () => {
    io.json.mockResolvedValue({ view, replayed: false });
    const blob = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], { type: "audio/webm" });
    const input = { operationId: "operation", noteId: "note", subject, title: "Context", transcript: note.transcript, durationMs: 1_200, retentionDays: 14 };
    expect(await uploadStudioReviewVoiceNote(input, blob)).toEqual({ view, replayed: false });
    const options = io.rawPost.mock.calls[0]?.[1] as { body: FormData; retry: number };
    expect(io.rawPost).toHaveBeenCalledOnce(); expect(io.rawPost.mock.calls[0]?.[0]).toBe("/api/studio-project-graph/works/work/review-voice-notes");
    expect(options.retry).toBe(0); expect(JSON.parse(String(options.body.get("metadata")))).toEqual(input);
    expect(options.body.get("file")).toBeInstanceOf(Blob);
  });

  it("obtains a signed URL only after explicit playback preparation", async () => {
    io.post.mockResolvedValue({ ...view, signedRead: { url: "https://storage.invalid/voice", expiresAtEpochMs: Date.now() + 60_000 } });
    const result = await readStudioReviewVoiceNote("work", "note");
    expect(result.signedRead.url).toBe("https://storage.invalid/voice");
    expect(io.post).toHaveBeenCalledWith("/studio-project-graph/works/work/review-voice-notes/note/read", {}, expect.objectContaining({ retry: 0 }));
  });

  it("deletes with an explicit operation identity and exact hash", async () => {
    io.post.mockResolvedValue({ ...view, note: { ...note, deletedAt: "2026-09-24T01:00:00.000Z" }, replayed: false });
    const input = { operationId: "delete-op", expectedSha256: note.sha256 };
    await deleteStudioReviewVoiceNote("work", "note", input);
    expect(io.post).toHaveBeenCalledWith("/studio-project-graph/works/work/review-voice-notes/note/delete", input, expect.objectContaining({ retry: 0 }));
  });
});
