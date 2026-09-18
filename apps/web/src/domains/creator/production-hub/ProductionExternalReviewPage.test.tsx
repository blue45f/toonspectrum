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
    permissions: ["view", "comment", "approve"],
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
    expect(screen.getByRole("link", { name: /자료 열기/u }).getAttribute("href")).toBe("https://example.test/review.png");

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

  it("shows a neutral invalid-link screen without leaking project data", async () => {
    getProductionExternalReview.mockRejectedValue(new Error("not found"));
    renderPage();
    expect(await screen.findByRole("heading", { name: "검수 링크를 열 수 없습니다" })).toBeTruthy();
    expect(screen.queryByText("밤의 우편배달부")).toBeNull();
  });
});
