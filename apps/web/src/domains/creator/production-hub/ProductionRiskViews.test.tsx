// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { evaluateProductionRisks } from "@toonspectrum/core/production";

import { createProductionDemoProject } from "./production-demo";
import { ProductionRiskMatrixView } from "./ProductionRiskViews";

afterEach(cleanup);

describe("ProductionRiskMatrixView", () => {
  it("renders a complete accessible 5 by 5 matrix and supports keyboard movement", () => {
    const aggregate = createProductionDemoProject();
    const evaluation = evaluateProductionRisks(aggregate, new Date("2026-09-17T09:00:00.000Z"));
    const selectCell = vi.fn();

    render(
      <ProductionRiskMatrixView
        aggregate={aggregate}
        risks={evaluation.risks}
        selectedRiskId={null}
        onSelect={vi.fn()}
        selectedCell={null}
        onSelectCell={selectCell}
      />,
    );

    const grid = screen.getByRole("grid", { name: "위험 확률 영향도 매트릭스" });
    expect(grid.getAttribute("aria-rowcount")).toBe("6");
    expect(grid.getAttribute("aria-colcount")).toBe("6");
    expect(screen.getAllByRole("gridcell")).toHaveLength(25);

    const cells = screen.getAllByRole("button", { name: /발생 가능성/u });
    expect(cells).toHaveLength(25);
    cells[0]?.focus();
    fireEvent.keyDown(cells[0]!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(cells[1]);
    fireEvent.keyDown(cells[1]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(cells[6]);

    fireEvent.click(screen.getByRole("button", { name: /발생 가능성 3, 영향도 4/u }));
    expect(selectCell).toHaveBeenCalledWith({ probability: 3, impact: 4 });
  });
});
