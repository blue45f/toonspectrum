// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createProductionDemoProject } from "./production-demo";
import { ProductionOperationsControlWorkspace } from "./ProductionOperationsControlWorkspace";

import type { ExternalReviewAccess } from "@toonstudio/core/production";
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
    expect(execute).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: "표시된 업무와 알림만 저장하는 것을 확인했습니다." }));
    fireEvent.click(screen.getByRole("button", { name: "미리보기 확인 후 적용" }));

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

  it("creates a link with the chosen permission preset and expiry preset", async () => {
    const execute = renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: /외부 검수/u }));
    const permissionSelects = screen.getAllByLabelText("권한");
    fireEvent.change(permissionSelects[0]!, { target: { value: "viewer" } });
    fireEvent.click(screen.getByRole("button", { name: "30일", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "외부 검수 링크 만들기" }));

    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "upsert-operations-record",
        record: expect.objectContaining({
          kind: "external-review-access",
          value: expect.objectContaining({ permissions: ["view"] }),
        }),
      }),
      expect.any(String),
    ));
    const [, message] = execute.mock.calls[0] as [ProductionClientCommand, string];
    expect(message).toContain("외부 검수 링크를 만들었습니다.");
    const command = execute.mock.calls[0]![0] as Extract<ProductionClientCommand, { type: "upsert-operations-record" }>;
    const value = (command.record as { value: { expiresAt: string } }).value;
    const days = (Date.parse(value.expiresAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThan(31);
  });

  it("changes an active link's permissions and extends its expiry", async () => {
    const execute = vi.fn(async (_command: ProductionClientCommand, _message: string) => undefined);
    const demo = createProductionDemoProject();
    const access: ExternalReviewAccess = {
      id: "external-review-1",
      projectId: demo.projectId,
      scope: { kind: "project", id: demo.projectId, ancestors: [] },
      label: "편집부 최종 검수",
      tokenDigest: "digest",
      submissionIds: ["submission-1"],
      permissions: ["view", "comment", "approve"],
      watermark: true,
      expiresAt: "2026-10-06T00:00:00.000Z",
      status: "active",
      createdByAssignmentId: "assignment-producer",
      createdAt: "2026-09-29T00:00:00.000Z",
      lastAccessedAt: null,
      responses: [],
    };
    render(
      <ProductionOperationsControlWorkspace
        aggregate={{ ...demo, externalReviewAccesses: [access] }}
        execute={execute}
        canEdit
        canManage
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /외부 검수/u }));
    expect(screen.getByText("편집부 최종 검수")).toBeTruthy();
    const permissionSelects = screen.getAllByLabelText("권한");
    expect(permissionSelects).toHaveLength(2);
    fireEvent.change(permissionSelects[1]!, { target: { value: "viewer" } });
    fireEvent.click(screen.getByRole("button", { name: "7일 연장" }));
    fireEvent.click(screen.getByRole("button", { name: "변경 저장" }));

    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "upsert-operations-record",
        record: expect.objectContaining({
          kind: "external-review-access",
          value: expect.objectContaining({ id: "external-review-1", permissions: ["view"] }),
        }),
      }),
      expect.stringContaining("설정을 변경했습니다."),
    ));
    const command = execute.mock.calls[0]![0] as Extract<ProductionClientCommand, { type: "upsert-operations-record" }>;
    const value = (command.record as { value: { expiresAt: string } }).value;
    expect(Date.parse(value.expiresAt)).toBeGreaterThan(Date.parse("2026-10-06T00:00:00.000Z"));
  });

  it("revokes an active external review link", async () => {
    const execute = vi.fn(async (_command: ProductionClientCommand, _message: string) => undefined);
    const demo = createProductionDemoProject();
    const access: ExternalReviewAccess = {
      id: "external-review-1",
      projectId: demo.projectId,
      scope: { kind: "project", id: demo.projectId, ancestors: [] },
      label: "편집부 최종 검수",
      tokenDigest: "digest",
      submissionIds: ["submission-1"],
      permissions: ["view"],
      watermark: true,
      expiresAt: "2026-10-06T00:00:00.000Z",
      status: "active",
      createdByAssignmentId: "assignment-producer",
      createdAt: "2026-09-29T00:00:00.000Z",
      lastAccessedAt: null,
      responses: [],
    };
    render(
      <ProductionOperationsControlWorkspace
        aggregate={{ ...demo, externalReviewAccesses: [access] }}
        execute={execute}
        canEdit
        canManage
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /외부 검수/u }));
    fireEvent.click(screen.getByRole("button", { name: "접근 즉시 회수" }));

    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "upsert-operations-record",
        record: expect.objectContaining({
          kind: "external-review-access",
          value: expect.objectContaining({ id: "external-review-1", status: "revoked" }),
        }),
      }),
      expect.any(String),
    ));
  });

});
