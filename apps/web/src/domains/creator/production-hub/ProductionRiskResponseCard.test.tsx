// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProductionRiskResponse } from "@toonspectrum/core/production";

import { createProductionDemoProject } from "./production-demo";
import { ProductionRiskResponseCard } from "./ProductionRiskResponseCard";

afterEach(cleanup);

function response(status: ProductionRiskResponse["status"]): ProductionRiskResponse {
  return {
    id: "risk-response:test",
    projectId: "sample-project",
    riskId: "risk:test",
    revision: 3,
    strategy: "mitigate",
    actionType: "split-task",
    title: "작업 분할",
    description: "선화 작업을 두 묶음으로 나눕니다.",
    ownerAssignmentId: null,
    dueAt: "2026-09-18T09:00:00.000Z",
    linkedTaskId: null,
    linkedChangeRequestId: null,
    linkedChangeOrderId: null,
    expectedEffect: "예상 지연 8시간 감소",
    actualEffect: null,
    cancellationReason: null,
    status,
    approvedAt: null,
    startedAt: status === "in-progress" ? "2026-09-17T10:00:00.000Z" : null,
    completedAt: null,
    cancelledAt: null,
    createdAt: "2026-09-17T09:00:00.000Z",
    updatedAt: "2026-09-17T10:00:00.000Z",
  };
}

describe("ProductionRiskResponseCard", () => {
  it("requires a cancellation reason and exposes approval only to managers", async () => {
    const execute = vi.fn(async () => undefined);
    render(
      <ProductionRiskResponseCard
        aggregate={createProductionDemoProject()}
        response={response("proposed")}
        execute={execute}
        canEdit
        canManage
      />,
    );

    expect(screen.getByRole("button", { name: "승인" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "대응 시작" })).toBeNull();
    const cancel = screen.getByRole("button", { name: "취소" }) as HTMLButtonElement;
    expect(cancel.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(/완료 효과나 취소 사유/u), {
      target: { value: "일정 재기준화로 별도 대응이 필요하지 않습니다." },
    });
    expect(cancel.disabled).toBe(false);
    fireEvent.click(cancel);

    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "transition-risk-response",
        toStatus: "cancelled",
        actualEffect: null,
        reason: "일정 재기준화로 별도 대응이 필요하지 않습니다.",
        expectedResponseRevision: 3,
      }),
      expect.any(String),
    ));
  });

  it("records completion evidence and surfaces transition failures", async () => {
    const execute = vi.fn(async () => {
      throw new Error("다른 사용자가 먼저 변경했습니다.");
    });
    render(
      <ProductionRiskResponseCard
        aggregate={createProductionDemoProject()}
        response={response("in-progress")}
        execute={execute}
        canEdit
        canManage={false}
      />,
    );

    const complete = screen.getByRole("button", { name: "완료 처리" }) as HTMLButtonElement;
    expect(complete.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(/완료 효과나 취소 사유/u), {
      target: { value: "실제 지연을 6시간 줄였습니다." },
    });
    expect(complete.disabled).toBe(false);
    fireEvent.click(complete);

    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "transition-risk-response",
        toStatus: "completed",
        actualEffect: "실제 지연을 6시간 줄였습니다.",
        reason: null,
        expectedResponseRevision: 3,
      }),
      expect.any(String),
    ));
    expect((await screen.findByRole("alert")).textContent).toContain("다른 사용자가 먼저 변경했습니다.");
  });
});
