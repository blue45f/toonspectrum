// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createProductionDemoProject } from "./production-demo";
import { deriveProductionManagementOverview } from "./production-management-overview";
import { ProductionRecoveryScenarioPanel } from "./ProductionRecoveryScenarioPanel";

const NOW = new Date("2026-09-17T00:00:00.000Z");

afterEach(() => cleanup());

function setup(canEdit = true) {
  const aggregate = createProductionDemoProject();
  const overview = deriveProductionManagementOverview(aggregate, { now: NOW });
  const execute = vi.fn().mockResolvedValue(undefined);
  render(
    <MemoryRouter>
      <ProductionRecoveryScenarioPanel
        aggregate={aggregate}
        intelligence={overview.riskIntelligence}
        execute={execute}
        canEdit={canEdit}
        now={NOW}
      />
    </MemoryRouter>,
  );
  return { aggregate, execute };
}

describe("ProductionRecoveryScenarioPanel", () => {
  it("compares recovery outcomes and applies a reversible schedule change only after a click", async () => {
    const { aggregate, execute } = setup();

    expect(screen.getByRole("heading", { name: "복구 시나리오 비교" })).toBeTruthy();
    expect(screen.getAllByText("위험 점수").length).toBeGreaterThan(0);
    expect(screen.getAllByText("예상 개선").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/원본 데이터에 적용하지 않고/u).length).toBeGreaterThan(0);
    expect(execute).not.toHaveBeenCalled();

    const select = screen.getByLabelText("시나리오를 비교할 위험");
    fireEvent.change(select, { target: { value: "blocker:task-episode-12-background" } });
    const apply = await screen.findByRole("button", {
      name: "마감 2일 재조정 복구 시나리오 적용",
    });
    fireEvent.click(apply);

    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    const original = aggregate.tasks.find((task) => task.id === "task-episode-12-background");
    expect(execute).toHaveBeenNthCalledWith(1, {
      type: "upsert-task-batch",
      tasks: expect.arrayContaining([expect.objectContaining({
        id: "task-episode-12-background",
        dueAt: expect.not.stringMatching(original?.dueAt ?? ""),
      })]),
    }, expect.stringContaining("원자적으로 적용했습니다"));

    const undo = await screen.findByRole("button", {
      name: "마감 2일 재조정 복구 시나리오 되돌리기",
    });
    fireEvent.click(undo);
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(2));
    expect(execute).toHaveBeenNthCalledWith(2, {
      type: "upsert-task-batch",
      tasks: expect.arrayContaining([expect.objectContaining({
        id: "task-episode-12-background",
        dueAt: original?.dueAt,
      })]),
    }, expect.stringContaining("원자적으로 되돌렸습니다"));
  });

  it("keeps unsafe scenarios preview-only and direct changes disabled without edit permission", () => {
    const { execute } = setup(false);
    const select = screen.getByLabelText("시나리오를 비교할 위험");
    fireEvent.change(select, { target: { value: "blocker:task-episode-12-background" } });

    expect(screen.getAllByText("미리보기 전용").length).toBeGreaterThan(0);
    const apply = screen.getByRole("button", {
      name: "마감 2일 재조정 복구 시나리오 적용",
    });
    expect((apply as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(apply);
    expect(execute).not.toHaveBeenCalled();
  });
});
