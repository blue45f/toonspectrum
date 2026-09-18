// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  evaluateProductionRisks,
  type ProductionRisk,
} from "@toonspectrum/core/production";

import { createProductionDemoProject } from "./production-demo";
import { ProductionRiskEditorDialog } from "./ProductionRiskEditorDialog";

afterEach(cleanup);

describe("ProductionRiskEditorDialog", () => {
  it("creates a complete manual risk from the operator form", async () => {
    const aggregate = createProductionDemoProject();
    const ownerAssignmentId = aggregate.assignments.find(
      (assignment) => assignment.roleType === "producer" && assignment.status === "active",
    )?.id ?? null;
    const onSave = vi.fn(async (_risk: ProductionRisk) => undefined);

    render(
      <ProductionRiskEditorDialog
        open
        aggregate={aggregate}
        risk={null}
        defaultOwnerAssignmentId={ownerAssignmentId}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );
    fireEvent.change(screen.getByLabelText("위험 제목"), {
      target: { value: "14화 채색 일정 초과 가능성" },
    });
    fireEvent.change(screen.getByLabelText("원인과 예상 영향"), {
      target: { value: "채색 잔여 공수가 가용 시간을 넘어 게시 일정에 영향을 줄 수 있습니다." },
    });
    fireEvent.change(screen.getByLabelText("발생 가능성"), {
      target: { value: "4" },
    });
    fireEvent.change(screen.getByLabelText("영향도"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByLabelText("발생 조건·트리거"), {
      target: { value: "마감 24시간 전 진척률 70% 미만" },
    });
    fireEvent.click(screen.getByRole("button", { name: "위험 등록" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0]?.[0];
    expect(saved).toMatchObject({
      source: "manual",
      title: "14화 채색 일정 초과 가능성",
      probability: 4,
      impact: 5,
      exposureScore: 20,
      priorityScore: 80,
      severity: "high",
      ownerAssignmentId,
      trigger: "마감 24시간 전 진척률 70% 미만",
    });
  });

  it("keeps automatic evidence fields read-only while allowing response ownership edits", async () => {
    const aggregate = createProductionDemoProject();
    const risk = evaluateProductionRisks(
      aggregate,
      new Date("2026-09-17T09:00:00.000Z"),
    ).risks.find((entry) => entry.source === "automatic");
    expect(risk).toBeTruthy();
    if (!risk) return;
    const onSave = vi.fn(async (_risk: ProductionRisk) => undefined);

    render(
      <ProductionRiskEditorDialog
        open
        aggregate={aggregate}
        risk={risk}
        defaultOwnerAssignmentId={null}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    expect((screen.getByLabelText("위험 제목") as HTMLInputElement).disabled).toBe(true);
    const mitigation = screen.getByLabelText("대응 계획");
    fireEvent.change(mitigation, { target: { value: "공동 담당자를 추가하고 후행 검수를 병렬화합니다." } });
    fireEvent.click(screen.getByRole("button", { name: "변경 저장" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0]?.[0];
    expect(saved.title).toBe(risk.title);
    expect(saved.signalIds).toEqual(risk.signalIds);
    expect(saved.revision).toBe(risk.revision + 1);
    expect(saved.mitigation).toContain("공동 담당자");
  });
});
