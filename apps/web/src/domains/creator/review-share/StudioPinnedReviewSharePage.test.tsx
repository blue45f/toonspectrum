// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PinnedShareView } from "@toonspectrum/studio-project-model/pinned-review-share";

import { StudioPinnedReviewSharePage } from "./StudioPinnedReviewSharePage";

const mocks = vi.hoisted(() => ({ view: vi.fn(), image: vi.fn(), feedback: vi.fn() }));
vi.mock("./studio-pinned-review-share-client", () => ({
  viewPinnedReviewShare: mocks.view,
  loadPinnedReviewSharePage: mocks.image,
  submitPinnedReviewShareFeedback: mocks.feedback,
}));

const TOKEN = "A".repeat(43);
const SHARE_ID = "11111111-1111-4111-8111-111111111111";
const pages = [
  { ordinal: 0, sha256: "a".repeat(64), byteLength: 4, mediaType: "image/png" as const, width: 800, height: 1200 },
  { ordinal: 2, sha256: "b".repeat(64), byteLength: 5, mediaType: "image/webp" as const, width: 900, height: 1300 },
];
function shareView(role: PinnedShareView["role"] = "commenter", feedback: PinnedShareView["feedback"] = []): PinnedShareView {
  return {
    id: SHARE_ID, title: "외부 콘티 검토", instructions: "두 페이지의 컷 호흡을 확인해 주세요.",
    purpose: "external-review", role, watermark: true, rightsStatement: "",
    revisionFingerprint: "c".repeat(64), expiresAt: "2030-09-23T00:00:00.000Z",
    leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(), pages, feedback,
  };
}
function Harness({ initial = `/production/pinned-review#token=${TOKEN}` }: { initial?: string }) {
  return <MemoryRouter initialEntries={[initial]}><Routes>
    <Route path="/production/pinned-review" element={<StudioPinnedReviewSharePage />} />
    <Route path="/showcase/reviews/:shareId" element={<StudioPinnedReviewSharePage />} />
  </Routes></MemoryRouter>;
}

const originalCreate = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
const originalRevoke = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
const createUrl = vi.fn((blob: Blob) => `blob:review-${blob.size}`);
const revokeUrl = vi.fn();
beforeAll(() => {
  Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: createUrl });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: revokeUrl });
});
afterAll(() => {
  if (originalCreate) Object.defineProperty(URL, "createObjectURL", originalCreate); else Reflect.deleteProperty(URL, "createObjectURL");
  if (originalRevoke) Object.defineProperty(URL, "revokeObjectURL", originalRevoke); else Reflect.deleteProperty(URL, "revokeObjectURL");
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.view.mockResolvedValue(shareView());
  mocks.image.mockImplementation(async (_access: unknown, ordinal: number) => new Blob([`page-${ordinal}`], { type: "image/png" }));
  mocks.feedback.mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222", pageOrdinal: 0, reviewerName: "멘토", body: "첫 컷을 조금 더 길게 보여 주세요.", createdAt: "2026-09-23T00:00:00.000Z" });
  vi.spyOn(crypto, "randomUUID").mockReturnValue("22222222-2222-4222-8222-222222222222");
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("external immutable review page", () => {
  it("opens only the token-scoped immutable pages and changes images by exact ordinal", async () => {
    render(<Harness />);
    expect(await screen.findByRole("heading", { name: "외부 콘티 검토" })).toBeTruthy();
    await waitFor(() => expect(mocks.view).toHaveBeenCalledWith({ token: TOKEN }));
    await waitFor(() => expect(mocks.image).toHaveBeenCalledWith({ token: TOKEN }, 0, expect.any(AbortSignal)));
    expect(screen.getByRole("img", { name: "1페이지 고정 검수 이미지" }).getAttribute("src")).toBe("blob:review-6");
    fireEvent.click(screen.getByRole("button", { name: "다음 페이지" }));
    await waitFor(() => expect(mocks.image).toHaveBeenCalledWith({ token: TOKEN }, 2, expect.any(AbortSignal)));
    expect(await screen.findByRole("img", { name: "3페이지 고정 검수 이미지" })).toBeTruthy();
    expect(screen.getByText(/현재 원고가 아닌 고정 검수 이미지/)).toBeTruthy();
  });

  it("records a comment against only the selected immutable page and refreshes authority", async () => {
    const recorded = { id: "22222222-2222-4222-8222-222222222222", pageOrdinal: 0, reviewerName: "멘토", body: "첫 컷을 조금 더 길게 보여 주세요.", createdAt: "2026-09-23T00:00:00.000Z" };
    mocks.feedback.mockResolvedValue(recorded);
    mocks.view.mockResolvedValueOnce(shareView()).mockResolvedValueOnce(shareView("commenter", [recorded]));
    render(<Harness />);
    await screen.findByRole("heading", { name: "외부 콘티 검토" });
    fireEvent.change(screen.getByLabelText("검토자 이름"), { target: { value: "멘토" } });
    fireEvent.change(screen.getByLabelText("의견"), { target: { value: recorded.body } });
    fireEvent.click(screen.getByRole("button", { name: "의견 기록" }));
    await waitFor(() => expect(mocks.feedback).toHaveBeenCalledWith({ token: TOKEN }, expect.objectContaining({ pageOrdinal: 0, reviewerName: "멘토", body: recorded.body })));
    expect(await screen.findByText(recorded.body)).toBeTruthy();
    expect(mocks.view).toHaveBeenCalledTimes(2);
  });

  it("reuses the same feedback id when an uncertain response is retried", async () => {
    const recorded = { id: "22222222-2222-4222-8222-222222222222", pageOrdinal: 0, reviewerName: "멘토", body: "응답 유실 뒤에도 한 번만 남아야 합니다.", createdAt: "2026-09-23T00:00:00.000Z" };
    mocks.feedback.mockRejectedValueOnce(new Error("uncertain")).mockResolvedValueOnce(recorded);
    mocks.view.mockResolvedValueOnce(shareView()).mockResolvedValueOnce(shareView("commenter", [recorded]));
    render(<Harness />);
    await screen.findByRole("heading", { name: "외부 콘티 검토" });
    fireEvent.change(screen.getByLabelText("검토자 이름"), { target: { value: recorded.reviewerName } });
    fireEvent.change(screen.getByLabelText("의견"), { target: { value: recorded.body } });
    const submit = screen.getByRole("button", { name: "의견 기록" });
    fireEvent.click(submit);
    expect(await screen.findByText(/같은 내용으로 다시 시도하면 중복 의견을 만들지 않습니다/)).toBeTruthy();
    fireEvent.click(submit);
    await waitFor(() => expect(mocks.feedback).toHaveBeenCalledTimes(2));
    const first = mocks.feedback.mock.calls[0]![1];
    const second = mocks.feedback.mock.calls[1]![1];
    expect(second.id).toBe(first.id);
    expect(second).toMatchObject({ pageOrdinal: 0, reviewerName: recorded.reviewerName, body: recorded.body });
    expect(await screen.findByText(recorded.body)).toBeTruthy();
  });

  it("renders public showcase shares without a private token and keeps them read-only", async () => {
    mocks.view.mockResolvedValue({ ...shareView("viewer"), purpose: "showcase" as const, rightsStatement: "작가의 공개 동의를 확인했습니다." });
    render(<Harness initial={`/showcase/reviews/${SHARE_ID}`} />);
    expect(await screen.findByText((_, element) => element?.textContent === "ToonStudio · 공개 전시본")).toBeTruthy();
    expect(mocks.view).toHaveBeenCalledWith({ publicId: SHARE_ID });
    expect(screen.getByRole("heading", { name: "열람 전용 링크" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "의견 기록" })).toBeNull();
    expect(screen.getByText("작가의 공개 동의를 확인했습니다.")).toBeTruthy();
  });

  it("rejects an ambiguous URL that contains both a public id and private token", async () => {
    render(<Harness initial={`/showcase/reviews/${SHARE_ID}#token=${TOKEN}`} />);
    expect(await screen.findByRole("heading", { name: "고정 검수본을 열 수 없습니다" })).toBeTruthy();
    expect(screen.getByText("검토 링크가 올바르지 않습니다.")).toBeTruthy();
    expect(mocks.view).not.toHaveBeenCalled();
  });
});
