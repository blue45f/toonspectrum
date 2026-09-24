// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioReviewVoiceNotes } from "./StudioReviewVoiceNotes";

const io = vi.hoisted(() => ({ list: vi.fn(), upload: vi.fn(), read: vi.fn(), remove: vi.fn() }));
vi.mock("./studio-review-voice-note-client", () => ({
  listStudioReviewVoiceNotes: io.list,
  uploadStudioReviewVoiceNote: io.upload,
  readStudioReviewVoiceNote: io.read,
  deleteStudioReviewVoiceNote: io.remove,
}));
const subject = { schemaVersion: 1 as const, workId: "work", projectId: "project", artifactId: "artifact",
  reviewId: "review", revisionId: "revision", rootGraphHash: "a".repeat(64) };
const note = { contract: "studio-review-voice-note-v1" as const, id: "note", subject, authorUserId: "actor", title: "눈선 수정 설명",
  transcript: "눈선을 조금 위로 옮겨 주세요.", durationMs: 1_200, contentType: "audio/webm" as const, byteLength: 4,
  sha256: "b".repeat(64), createdAt: "2026-09-24T00:00:00.000Z", expiresAt: "2026-10-08T00:00:00.000Z", deletedAt: null };
const stop = vi.fn();
const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop }] }));

class FakeMediaRecorder {
  static isTypeSupported = () => true;
  state: RecordingState = "inactive";
  mimeType: string;
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(_stream: MediaStream, options?: MediaRecorderOptions) { this.mimeType = options?.mimeType ?? "audio/webm"; }
  start() { this.state = "recording"; }
  stopRecording() { this.stop(); }
  stop() { this.state = "inactive"; }
}

beforeEach(() => {
  vi.clearAllMocks();
  io.list.mockResolvedValue({ items: [{ note, canDelete: true }] });
  io.read.mockResolvedValue({ note, canDelete: true, signedRead: { url: "https://storage.invalid/voice", expiresAtEpochMs: Date.now() + 60_000 } });
  io.remove.mockResolvedValue({ note: { ...note, deletedAt: new Date().toISOString() }, canDelete: true, replayed: false });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
});
afterEach(() => vi.unstubAllGlobals());

describe("recorded review explanations", () => {
  it("loads text alternatives without requesting microphone access or fetching audio", async () => {
    render(<StudioReviewVoiceNotes subject={subject} canComment={false} />);
    expect(await screen.findByText("눈선 수정 설명")).toBeTruthy();
    expect(screen.getByText("눈선을 조금 위로 옮겨 주세요.")).toBeTruthy();
    expect(getUserMedia).not.toHaveBeenCalled(); expect(io.read).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "재생 준비" }));
    await waitFor(() => expect(io.read).toHaveBeenCalledWith("work", "note"));
    expect(document.querySelector("audio")).toBeTruthy();
  });

  it("requests the microphone only after an explicit recording gesture", async () => {
    render(<StudioReviewVoiceNotes subject={subject} canComment />);
    await screen.findByText("눈선 수정 설명");
    expect(getUserMedia).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "설명 녹음" })); });
    expect(getUserMedia).toHaveBeenCalledExactlyOnceWith({ audio: true, video: false });
    expect(await screen.findByRole("button", { name: "녹음 종료" })).toBeTruthy();
  });

  it("requires a second explicit click before deletion", async () => {
    render(<StudioReviewVoiceNotes subject={subject} canComment={false} />);
    await screen.findByText("눈선 수정 설명");
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect(io.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "삭제 확인" }));
    await waitFor(() => expect(io.remove).toHaveBeenCalledWith("work", "note", expect.objectContaining({ expectedSha256: note.sha256 })));
  });
});
