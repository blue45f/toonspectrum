// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProductionExternalReviewPage } from "./ProductionExternalReviewPage";

import type { ProductionExternalReviewView } from "./production-api";

const getProductionExternalReview = vi.fn();
const submitProductionExternalReview = vi.fn();

vi.mock("./production-api", () => ({
  getProductionExternalReview: (...args: unknown[]) => getProductionExternalReview(...args),
  submitProductionExternalReview: (...args: unknown[]) => submitProductionExternalReview(...args),
}));

const reviewView: ProductionExternalReviewView = {
  projectId: "project-1",
  projectTitle: "밤의 우편배달부",
  review: {
    id: "review-1",
    label: "편집부 최종 검수",
    watermark: true,
    permissions: ["view", "comment", "approve", "download"],
    expiresAt: "2027-09-17T00:00:00.000Z",
    responses: [],
  },
  submissions: [{
    id: "submission-1",
    status: "approved",
    submittedAt: "2026-09-17T00:00:00.000Z",
    revisionRef: {
      id: "revision-1",
      lineage: "integrated",
      revision: 4,
      digest: `sha256:${"1".repeat(64)}`,
      createdAt: "2026-09-17T00:00:00.000Z",
    },
    evidenceRefs: ["https://example.test/review.png"],
    protectedEvidenceCount: 0,
    deliverable: {
      id: "deliverable-1",
      type: "통합 웹툰 원고",
      expectedFormat: "PNG sequence",
      completionCriteria: ["오탈자 없음", "플랫폼 규격 통과"],
    },
  }],
};

afterEach(() => {
  cleanup();
  getProductionExternalReview.mockReset();
  submitProductionExternalReview.mockReset();
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/production/review/project-1/review-1?token=" + "a".repeat(64)]}>
      <Routes>
        <Route path="/production/review/:projectId/:reviewId" element={<ProductionExternalReviewPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProductionExternalReviewPage", () => {
  it("loads only the shared review package and records an approval", async () => {
    getProductionExternalReview.mockResolvedValue(reviewView);
    submitProductionExternalReview.mockResolvedValue({
      ...reviewView,
      review: {
        ...reviewView.review,
        responses: [{
          id: "response-1",
          reviewerName: "외부 편집자",
          decision: "approve",
          note: "최종 확인했습니다.",
          createdAt: "2026-09-17T01:00:00.000Z",
        }],
      },
    });

    renderPage();
    expect(await screen.findByRole("heading", { name: "편집부 최종 검수" })).toBeTruthy();
    expect(screen.getByText("밤의 우편배달부")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "통합 웹툰 원고" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /검수 자료 이미지 1 원본 열기/u }).getAttribute("href")).toBe("https://example.test/review.png");
    expect(screen.getByAltText("검수 자료 이미지 1")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("검수자 이름"), { target: { value: "외부 편집자" } });
    fireEvent.click(screen.getByLabelText("승인"));
    fireEvent.change(screen.getByLabelText("의견"), { target: { value: "최종 확인했습니다." } });
    fireEvent.click(screen.getByRole("button", { name: "승인 기록" }));

    await waitFor(() => expect(submitProductionExternalReview).toHaveBeenCalledWith(
      "project-1",
      "review-1",
      expect.objectContaining({
        reviewerName: "외부 편집자",
        decision: "approve",
        note: "최종 확인했습니다.",
      }),
    ));
    expect(await screen.findByText("승인 의견을 안전하게 기록했습니다.")).toBeTruthy();
    expect(screen.getByText("외부 편집자")).toBeTruthy();
  });

  it("깨진 검수 이미지는 빈 상자 대신 실패 안내를 그 자리에 보여준다", async () => {
    getProductionExternalReview.mockResolvedValue(reviewView);
    renderPage();
    const image = await screen.findByRole("img", { name: "검수 자료 이미지 1" });
    fireEvent.error(image);
    expect(await screen.findByText(/이미지 1을 불러오지 못했습니다/)).toBeTruthy();
  });

  it("shows a neutral invalid-link screen without leaking project data", async () => {
    getProductionExternalReview.mockRejectedValue(new Error("not found"));
    renderPage();
    expect(await screen.findByRole("heading", { name: "검수 링크를 열 수 없습니다" })).toBeTruthy();
    expect(screen.queryByText("밤의 우편배달부")).toBeNull();
  });

  it("retries loading from the error screen and recovers when the link works again", async () => {
    getProductionExternalReview
      .mockRejectedValueOnce(new Error("temporary network failure"))
      .mockResolvedValue(reviewView);
    renderPage();
    expect(await screen.findByRole("heading", { name: "검수 링크를 열 수 없습니다" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("heading", { name: "편집부 최종 검수" })).toBeTruthy();
    expect(getProductionExternalReview).toHaveBeenCalledTimes(2);
  });

  it("does not expose original evidence links without download permission", async () => {
    getProductionExternalReview.mockResolvedValue({
      ...reviewView,
      review: {
        ...reviewView.review,
        permissions: ["view", "comment", "approve"],
      },
      submissions: reviewView.submissions.map((submission) => ({
        ...submission,
        evidenceRefs: [],
        protectedEvidenceCount: 1,
      })),
    });

    renderPage();
    expect(await screen.findByRole("heading", { name: "편집부 최종 검수" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /자료 열기/u })).toBeNull();
    expect(screen.getByText(/원본 검수 자료 1개는 다운로드 권한이 없어/u)).toBeTruthy();
  });

  it("summarizes the link permission granted to the external reviewer", async () => {
    getProductionExternalReview.mockResolvedValue(reviewView);
    renderPage();
    expect(await screen.findByRole("heading", { name: "편집부 최종 검수" })).toBeTruthy();
    expect(screen.getByText(/권한 보기·댓글·승인/u)).toBeTruthy();

    cleanup();
    getProductionExternalReview.mockReset();
    getProductionExternalReview.mockResolvedValue({
      ...reviewView,
      review: { ...reviewView.review, permissions: ["view"] },
    });
    renderPage();
    expect(await screen.findByRole("heading", { name: "편집부 최종 검수" })).toBeTruthy();
    expect(screen.getByText(/권한 보기 전용/u)).toBeTruthy();
  });

  it("shows a view-only notice instead of the feedback form for view permission links", async () => {
    getProductionExternalReview.mockResolvedValue({
      ...reviewView,
      review: { ...reviewView.review, permissions: ["view"] },
    });
    renderPage();
    expect(await screen.findByRole("heading", { name: "보기 전용 링크" })).toBeTruthy();
    expect(screen.queryByLabelText("검수자 이름")).toBeNull();
    expect(screen.queryByRole("button", { name: /기록/u })).toBeNull();
  });

});
