// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProductionActivityWorkspace } from "./ProductionActivityWorkspace";
import { createProductionDemoProject } from "./production-demo";

describe("ProductionActivityWorkspace", () => {
  it("행위자 이름과 행동 라벨로 전체 활동을 보여 준다", () => {
    const aggregate = createProductionDemoProject();
    render(
      <ProductionActivityWorkspace
        aggregate={aggregate}
        viewerUserId="demo-story"
        viewerAssignmentIds={["assignment-story"]}
      />,
    );

    expect(screen.getByText("총 8건의 변경이 기록돼 있습니다.")).toBeTruthy();
    expect(screen.getAllByText("강민서 작가").length).toBeGreaterThan(0);
    expect(screen.getAllByText("윤하림 작가").length).toBeGreaterThan(0);
    expect(screen.getByText(/프로젝트 생성/)).toBeTruthy();
  });

  it("내 관련 필터는 다른 사람이 한 무관한 변경을 숨긴다", () => {
    const aggregate = createProductionDemoProject();
    render(
      <ProductionActivityWorkspace
        aggregate={aggregate}
        viewerUserId="demo-story"
        viewerAssignmentIds={["assignment-story"]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /내 관련/ }));

    expect(screen.getAllByText("강민서 작가").length).toBeGreaterThan(0);
    expect(screen.queryByText("윤하림 작가")).toBeNull();
    expect(screen.getByText("4건 중 4건 표시")).toBeTruthy();
  });

  it("활동이 없으면 빈 상태를 안내한다", () => {
    const aggregate = { ...createProductionDemoProject(), auditEvents: [] };
    render(
      <ProductionActivityWorkspace
        aggregate={aggregate}
        viewerUserId="demo-story"
        viewerAssignmentIds={["assignment-story"]}
      />,
    );

    expect(screen.getByText("기록된 활동이 없습니다")).toBeTruthy();
  });
});
