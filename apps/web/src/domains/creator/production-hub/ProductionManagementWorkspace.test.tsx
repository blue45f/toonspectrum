// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProductionProjectAggregate, ProductionTask } from "@toonspectrum/core/production";

import { createProductionDemoProject } from "./production-demo";
import { ProductionManagementWorkspace } from "./ProductionManagementWorkspace";

const NOW = new Date("2026-09-17T00:00:00.000Z");

afterEach(() => cleanup());

function unassignLetteringTask(): {
  readonly aggregate: ProductionProjectAggregate;
  readonly task: ProductionTask;
} {
  const aggregate = createProductionDemoProject();
  const task = aggregate.tasks.find((entry) => entry.id === "task-episode-12-lettering");
  if (!task) throw new Error("demo lettering task missing");
  return {
    aggregate: {
      ...aggregate,
      tasks: aggregate.tasks.map((entry) =>
        entry.id === task.id ? { ...entry, assignmentIds: [] } : entry),
    },
    task,
  };
}

describe("ProductionManagementWorkspace assignment recommendations", () => {
  it("applies the recommended owner only after the user confirms the assignment", async () => {
    const { aggregate, task } = unassignLetteringTask();
    const execute = vi.fn().mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <ProductionManagementWorkspace
          aggregate={aggregate}
          roleLens="producer"
          execute={execute}
          canEdit
          now={NOW}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "추천 업무 배정" })).toBeTruthy();
    expect(screen.getByText("추천 정태오 · 식자")).toBeTruthy();
    expect(execute).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /12화 말풍선·효과음·식자.*정태오/u }));

    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(execute).toHaveBeenCalledWith({
      type: "upsert-task",
      task: expect.objectContaining({
        id: task.id,
        assignmentIds: ["assignment-lettering"],
      }),
    }, expect.stringContaining("정태오"));
  });

  it("keeps the recommendation read-only when the user cannot edit the project", () => {
    const { aggregate } = unassignLetteringTask();
    const execute = vi.fn().mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <ProductionManagementWorkspace
          aggregate={aggregate}
          roleLens="producer"
          execute={execute}
          canEdit={false}
          now={NOW}
        />
      </MemoryRouter>,
    );

    const button = screen.getByRole("button", { name: /12화 말풍선·효과음·식자.*정태오/u });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("ProductionManagementWorkspace predictive risk intelligence", () => {
  it("explains predictive signals and registers one only after explicit confirmation", async () => {
    const aggregate = createProductionDemoProject();
    const execute = vi.fn().mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <ProductionManagementWorkspace
          aggregate={aggregate}
          roleLens="producer"
          execute={execute}
          canEdit
          now={NOW}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "예측 리스크 레이더" })).toBeTruthy();
    expect(screen.getAllByText("왜 위험한가").length).toBeGreaterThan(0);
    expect(screen.getAllByText("권장 대응").length).toBeGreaterThan(0);
    expect(execute).not.toHaveBeenCalled();

    const register = screen.getAllByRole("button", { name: /예측 신호를 제작 위험으로 등록/u })[0];
    if (!register) throw new Error("risk registration button missing");
    fireEvent.click(register);

    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(execute).toHaveBeenCalledWith({
      type: "upsert-planning-record",
      record: {
        kind: "risk",
        value: expect.objectContaining({
          id: expect.stringMatching(/^risk-predictive-/u),
          title: expect.stringContaining("[예측]"),
          status: "open",
        }),
      },
    }, expect.stringContaining("제작 위험으로 등록"));
  });

  it("keeps predictive risk registration read-only without edit permission", () => {
    const execute = vi.fn().mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <ProductionManagementWorkspace
          aggregate={createProductionDemoProject()}
          roleLens="producer"
          execute={execute}
          canEdit={false}
          now={NOW}
        />
      </MemoryRouter>,
    );

    const register = screen.getAllByRole("button", { name: /예측 신호를 제작 위험으로 등록/u })[0];
    if (!register) throw new Error("risk registration button missing");
    expect((register as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(register);
    expect(execute).not.toHaveBeenCalled();
  });
});
