// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { createProductionDemoProject } from "./production-demo";
import { ProductionRoleWorkspace } from "./ProductionRoleWorkspace";

describe("ProductionRoleWorkspace deep link", () => {
  it("opens a task from the task query even when it is outside the default role lens", async () => {
    const aggregate = createProductionDemoProject();
    render(
      <MemoryRouter initialEntries={["/production/projects/sample-project/production?task=task-episode-12-color"]}>
        <ProductionRoleWorkspace
          aggregate={aggregate}
          roleLens="story"
          canEdit
          execute={vi.fn(async () => undefined)}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      const selected = screen.getByRole("button", { name: /12화 밑색·명암·이펙트/u });
      expect(selected.getAttribute("aria-pressed")).toBe("true");
    });
    expect(screen.getAllByRole("heading", { name: "12화 밑색·명암·이펙트" }).length)
      .toBeGreaterThan(0);
  });
});
