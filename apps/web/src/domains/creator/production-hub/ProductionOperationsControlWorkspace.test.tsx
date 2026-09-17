// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createProductionDemoProject } from "./production-demo";
import { ProductionOperationsControlWorkspace } from "./ProductionOperationsControlWorkspace";

import type { ProductionClientCommand } from "./production-api";

afterEach(() => cleanup());

function renderWorkspace() {
  const execute = vi.fn(async (_command: ProductionClientCommand, _message: string) => undefined);
  render(
    <ProductionOperationsControlWorkspace
      aggregate={createProductionDemoProject()}
      execute={execute}
      canEdit
      canManage
    />,
  );
  return execute;
}

describe("ProductionOperationsControlWorkspace", () => {
  it("exposes the complete production operations toolset", () => {
    renderWorkspace();
    expect(screen.getByRole("heading", { name: "제작 운영 완성도 센터" })).toBeTruthy();
    for (const label of [
      "일정 회복",
      "개인 작업함",
      "근무 캘린더",
      "컷 분배",
      "연재 계획",
      "외부 검수",
      "자동화·알림",
      "분석·예산",
      "저장된 보기",
    ]) {
      expect(screen.getByRole("button", { name: new RegExp(label, "u") })).toBeTruthy();
    }
    expect(screen.getByRole("heading", { name: "일정 회복 시나리오" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "임계경로와 여유시간" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /분석·예산/u }));
    expect(screen.getByRole("heading", { name: "공정 병목 분석" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "예산·정산 전망" })).toBeTruthy();
  });

  it("persists calendar, automation and saved-view records through guarded commands", async () => {
    const execute = renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: /근무 캘린더/u }));
    fireEvent.change(screen.getByLabelText("주간 가용 시간"), { target: { value: "32" } });
    fireEvent.click(screen.getByRole("button", { name: "근무 캘린더 저장" }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "upsert-operations-record",
        record: expect.objectContaining({ kind: "resource-calendar" }),
      }),
      expect.any(String),
    ));

    fireEvent.click(screen.getByRole("button", { name: /자동화·알림/u }));
    fireEvent.click(screen.getByRole("button", { name: "규칙 저장" }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "upsert-operations-record",
        record: expect.objectContaining({ kind: "automation-rule" }),
      }),
      expect.any(String),
    ));

    fireEvent.click(screen.getByRole("button", { name: /저장된 보기/u }));
    fireEvent.click(screen.getByRole("button", { name: "현재 보기 저장" }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "upsert-operations-record",
        record: expect.objectContaining({ kind: "saved-view" }),
      }),
      expect.any(String),
    ));
  });

  it("keeps all management mutations disabled for read-only users", () => {
    render(
      <ProductionOperationsControlWorkspace
        aggregate={createProductionDemoProject()}
        execute={vi.fn(async () => undefined)}
        canEdit={false}
        canManage={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /근무 캘린더/u }));
    expect((screen.getByRole("button", { name: "근무 캘린더 저장" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /자동화·알림/u }));
    expect((screen.getByRole("button", { name: "규칙 저장" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("submits automation outputs as one atomic production command", async () => {
    const base = createProductionDemoProject();
    const assignmentId = base.assignments[0]!.id;
    const aggregate = {
      ...base,
      automationRules: [{
        id: "automation-rule-atomic-ui",
        projectId: base.projectId,
        name: "마감 경과 알림",
        trigger: "due-passed" as const,
        conditions: [],
        actions: [{
          type: "notify" as const,
          assignmentIds: [assignmentId],
          urgency: "critical" as const,
          message: "마감이 지났습니다.",
        }],
        failurePolicy: "require-review" as const,
        enabled: true,
        revision: 1,
        lastEvaluatedAt: null,
        createdByAssignmentId: assignmentId,
        updatedAt: "2026-09-17T00:00:00.000Z",
      }],
    };
    const execute = vi.fn(async (_command: ProductionClientCommand, _message: string) => undefined);
    render(
      <ProductionOperationsControlWorkspace
        aggregate={aggregate}
        execute={execute}
        canEdit
        canManage
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /자동화·알림/u }));
    fireEvent.click(screen.getByRole("button", { name: "활성 규칙 실행" }));

    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "apply-automation-execution",
        evaluatedRules: expect.arrayContaining([
          expect.objectContaining({ id: "automation-rule-atomic-ui", revision: 2 }),
        ]),
        notifications: expect.any(Array),
        tasks: expect.any(Array),
      }),
      expect.stringContaining("하나의 변경"),
    ));
  });


  it("requires an explicit opt-in before exposing original review evidence links", async () => {
    const execute = renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: /외부 검수/u }));
    const allowDownload = screen.getByLabelText(/원본 자료 링크 허용/u);
    expect((allowDownload as HTMLInputElement).checked).toBe(false);
    fireEvent.click(allowDownload);
    fireEvent.click(screen.getByRole("button", { name: "외부 검수 링크 만들기" }));

    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "upsert-operations-record",
        record: expect.objectContaining({
          kind: "external-review-access",
          value: expect.objectContaining({
            permissions: expect.arrayContaining(["view", "comment", "approve", "download"]),
          }),
        }),
      }),
      expect.any(String),
    ));
  });

});
