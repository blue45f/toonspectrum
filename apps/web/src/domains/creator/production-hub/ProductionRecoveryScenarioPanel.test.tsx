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
      type: "upsert-task",
      task: expect.objectContaining({
        id: "task-episode-12-background",
        dueAt: expect.not.stringMatching(original?.dueAt ?? ""),
      })]),
      expectedTasks: expect.arrayContaining([expect.objectContaining({
        id: "task-episode-12-background",
        dueAt: original?.dueAt,
      })]),
    }, expect.stringContaining("원자적으로 적용했습니다"));

    const undo = await screen.findByRole("button", {
      name: "마감 2일 재조정 복구 시나리오 되돌리기",
    });
    fireEvent.click(undo);
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(2));
    expect(execute).toHaveBeenNthCalledWith(2, {
      type: "upsert-task",
      task: expect.objectContaining({
        id: "task-episode-12-background",
        dueAt: original?.dueAt,
      })]),
      expectedTasks: expect.arrayContaining([expect.objectContaining({
        id: "task-episode-12-background",
        dueAt: expect.not.stringMatching(original?.dueAt ?? ""),
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

  it("does not expose undo state when the guarded apply fails", async () => {
    const aggregate = createProductionDemoProject();
    const overview = deriveProductionManagementOverview(aggregate, { now: NOW });
    const execute = vi.fn().mockRejectedValue(new Error("다른 변경이 감지되었습니다."));
    render(
      <MemoryRouter>
        <ProductionRecoveryScenarioPanel
          aggregate={aggregate}
          intelligence={overview.riskIntelligence}
          execute={execute}
          canEdit
          now={NOW}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("시나리오를 비교할 위험"), {
      target: { value: "blocker:task-episode-12-background" },
    });
    fireEvent.click(await screen.findByRole("button", {
      name: "마감 2일 재조정 복구 시나리오 적용",
    }));

    expect((await screen.findByRole("alert")).textContent).toContain("다른 변경이 감지되었습니다.");
    expect(screen.queryByRole("button", {
      name: "마감 2일 재조정 복구 시나리오 되돌리기",
    })).toBeNull();
  });

  it("locks undo after a later collaborator change is observed", async () => {
    const aggregate = createProductionDemoProject();
    const execute = vi.fn().mockResolvedValue(undefined);
    const renderPanel = (value: typeof aggregate) => (
      <MemoryRouter>
        <ProductionRecoveryScenarioPanel
          aggregate={value}
          intelligence={deriveProductionManagementOverview(value, { now: NOW }).riskIntelligence}
          execute={execute}
          canEdit
          now={NOW}
        />
      </MemoryRouter>
    );
    const view = render(renderPanel(aggregate));

    fireEvent.change(screen.getByLabelText("시나리오를 비교할 위험"), {
      target: { value: "blocker:task-episode-12-background" },
    });
    fireEvent.click(await screen.findByRole("button", {
      name: "마감 2일 재조정 복구 시나리오 적용",
    }));
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));

    const command = execute.mock.calls[0]?.[0] as Extract<ProductionClientCommand, { type: "upsert-task-batch" }>;
    const applied = command.tasks[0]!;
    const externallyChanged = {
      ...aggregate,
      revision: aggregate.revision + 2,
      tasks: aggregate.tasks.map((task) => task.id === applied.id
        ? { ...applied, status: "paused" as const }
        : task),
    };
    view.rerender(renderPanel(externallyChanged));

    const undo = screen.getByRole("button", {
      name: "마감 2일 재조정 복구 시나리오 되돌리기",
    });
    expect((undo as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("추가 변경으로 잠김")).toBeTruthy();
    expect(screen.getByText(/같은 업무 1개가 이후 변경되어/u)).toBeTruthy();
  });

});
