// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createProductionDemoProject } from "./production-demo";
import { ProductionScheduleWorkspace } from "./ProductionScheduleWorkspace";

const NOW = new Date("2026-09-17T00:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ProductionScheduleWorkspace predictive risk", () => {
  it("uses the shared prediction model for summary, task badges and filtering", () => {
    render(
      <ProductionScheduleWorkspace
        aggregate={createProductionDemoProject()}
        execute={vi.fn().mockResolvedValue(undefined)}
        canEdit
      />,
    );

    expect(screen.getByRole("heading", { name: "일정·용량 작업실" })).toBeTruthy();
    expect(screen.getAllByText("예측 위험").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/현재 작업이 차단되어|마감보다 약|선행 작업/u).length).toBeGreaterThan(0);

    const filter = screen.getByLabelText("위험 필터") as HTMLSelectElement;
    fireEvent.change(filter, { target: { value: "predicted" } });
    expect(filter.value).toBe("predicted");
    expect(screen.getAllByText("예측 위험").length).toBeGreaterThan(1);
    expect(screen.queryByText("현재 필터에 맞는 작업이 없습니다.")).toBeNull();
  });
});
