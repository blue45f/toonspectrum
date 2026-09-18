// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  it("shows deadline risk evidence, impact, responses and policy controls", async () => {
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

    expect(screen.getByRole("tab", { name: "근거" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "대응" }));
    expect(await screen.findByRole("button", { name: "작업 분할" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "일정 조정" })).toBeTruthy();

    const acceptButton = screen.getByRole("button", { name: "위험 수용" }) as HTMLButtonElement;
    expect(acceptButton.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("위험 상태 판단 사유"), {
      target: { value: "게시 영향과 후행 작업 지연 가능성을 확인했습니다." },
    });
    expect(acceptButton.disabled).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "작업 분할" }));
    expect(screen.getByRole("heading", { name: "대응안 작성" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("예상 효과"), {
      target: { value: "선화 병렬화로 예상 지연 8시간 축소" },
    });
    fireEvent.click(screen.getByRole("button", { name: "대응안 제안" }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "upsert-risk-response",
        response: expect.objectContaining({
          revision: 1,
          actionType: "split-task",
          expectedEffect: "선화 병렬화로 예상 지연 8시간 축소",
        }),
      }),
      expect.any(String),
    ));
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
    expect(screen.getByLabelText("회차 필터").textContent).toContain("1개 선택");
    expect(screen.getByLabelText("담당자 필터").textContent).toContain("1개 선택");

    const episodeGroup = screen.getByRole("group", { name: "회차 다중 선택" });
    const nextEpisode = within(episodeGroup).getAllByRole("checkbox")
      .find((checkbox) => !(checkbox as HTMLInputElement).checked) as HTMLInputElement;
    fireEvent.click(nextEpisode);
    const episodeParams = new URLSearchParams(screen.getByTestId("location-search").textContent ?? "");
    expect(episodeParams.get("episode")?.split(",")).toEqual(expect.arrayContaining([
      "project",
      nextEpisode.value,
    ]));

    const ownerGroup = screen.getByRole("group", { name: "담당자 다중 선택" });
    const nextOwner = within(ownerGroup).getAllByRole("checkbox")
      .find((checkbox) => !(checkbox as HTMLInputElement).checked) as HTMLInputElement;
    fireEvent.click(nextOwner);
    const ownerParams = new URLSearchParams(screen.getByTestId("location-search").textContent ?? "");
    expect(ownerParams.get("owner")?.split(",")).toEqual(expect.arrayContaining([
      "unassigned",
      nextOwner.value,
    ]));

    const firstCell = screen.getByRole("button", {
      name: /발생 가능성 1, 영향도 5, 위험/u,
    });
    const secondCell = screen.getByRole("button", {
      name: /발생 가능성 2, 영향도 5, 위험/u,
    });
    firstCell.focus();
    fireEvent.keyDown(firstCell, { key: "ArrowRight" });
    expect(document.activeElement).toBe(secondCell);

    fireEvent.click(screen.getByRole("button", {
      name: /발생 가능성 5, 영향도 5, 위험/u,
    }));
    expect(screen.getByTestId("location-search").textContent).toContain("matrix=5-5");

    fireEvent.click(screen.getByRole("tab", { name: "회차별" }));
    expect(screen.getByTestId("location-search").textContent).toContain("view=episode");
    expect(screen.getByTestId("location-search").textContent).toContain("episode=project");
    expect(screen.getByTestId("location-search").textContent).toContain("owner=unassigned");
    expect(screen.getByText("회차별 위험")).toBeTruthy();
  });
});
