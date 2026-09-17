// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createProductionDemoProject } from "./production-demo";
import { ProductionRiskWorkspace } from "./ProductionRiskWorkspace";

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location-search">{location.search}</output>;
}

afterEach(cleanup);

describe("ProductionRiskWorkspace", () => {
  it("shows deadline risk evidence, impact, responses and policy controls", () => {
    const execute = vi.fn(async () => undefined);
    render(
      <MemoryRouter initialEntries={["/production/projects/sample-project/risks"]}>
        <ProductionRiskWorkspace
          aggregate={createProductionDemoProject()}
          execute={execute}
          canEdit
          canManage
          now={new Date("2026-09-17T09:00:00.000Z")}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "위험·병목" })).toBeTruthy();
    expect(screen.getByText("실제 초과")).toBeTruthy();
    expect(screen.getByText("예상 초과")).toBeTruthy();
    expect(screen.getByRole("button", { name: /다시 평가/u })).toBeTruthy();
    expect(screen.getByRole("button", { name: /위험 직접 등록/u })).toBeTruthy();
    expect(screen.getByRole("button", { name: /정책 저장/u })).toBeTruthy();

    const riskRows = screen.getAllByRole("button", { pressed: false });
    const selectable = riskRows.find((button) => button.textContent?.includes("마감"));
    expect(selectable).toBeTruthy();
    if (selectable) fireEvent.click(selectable);

    expect(screen.getByRole("tab", { name: "근거" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "대응" }));
    expect(screen.getByRole("button", { name: "작업 분할" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "일정 조정" })).toBeTruthy();

    const acceptButton = screen.getByRole("button", { name: "위험 수용" }) as HTMLButtonElement;
    expect(acceptButton.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("왜 이 대응을 선택했는지 기록하세요."), {
      target: { value: "게시 영향과 후행 작업 지연 가능성을 확인했습니다." },
    });
    expect(acceptButton.disabled).toBe(false);
  });

  it("keeps management-only actions disabled for editors", () => {
    render(
      <MemoryRouter initialEntries={["/production/projects/sample-project/risks"]}>
        <ProductionRiskWorkspace
          aggregate={createProductionDemoProject()}
          execute={vi.fn(async () => undefined)}
          canEdit
          canManage={false}
          now={new Date("2026-09-17T09:00:00.000Z")}
        />
      </MemoryRouter>,
    );

    expect((screen.getByRole("button", { name: /정책 저장/u }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps matrix, episode and owner filters in shareable URL state", () => {
    render(
      <MemoryRouter initialEntries={["/production/projects/sample-project/risks?view=matrix&episode=project&owner=unassigned"]}>
        <ProductionRiskWorkspace
          aggregate={createProductionDemoProject()}
          execute={vi.fn(async () => undefined)}
          canEdit
          canManage
          now={new Date("2026-09-17T09:00:00.000Z")}
        />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(screen.getByRole("tab", { name: "위험 매트릭스" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("grid", { name: "위험 확률 영향도 매트릭스" })).toBeTruthy();
    expect((screen.getByLabelText("회차 필터") as HTMLSelectElement).value).toBe("project");
    expect((screen.getByLabelText("위험 담당자 필터") as HTMLSelectElement).value).toBe("unassigned");

    fireEvent.click(screen.getByRole("tab", { name: "회차별" }));
    expect(screen.getByTestId("location-search").textContent).toContain("view=episode");
    expect(screen.getByTestId("location-search").textContent).toContain("episode=project");
    expect(screen.getByTestId("location-search").textContent).toContain("owner=unassigned");
    expect(screen.getByText("회차별 위험")).toBeTruthy();
  });
});
