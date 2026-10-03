// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IntegrationCenterPage } from "./IntegrationCenterPage";
import { IntegrationLoading } from "./IntegrationUi";
import type { IntegrationCatalogResponse } from "./integration-platform-types";

const catalogState = vi.hoisted(() => ({
  value: null as IntegrationCatalogResponse | null,
}));

vi.mock("./use-integration-catalog", () => ({
  useIntegrationCatalog: () => ({
    catalog: catalogState.value,
    error: null,
    loading: false,
    refresh: vi.fn(),
  }),
}));

vi.mock("./IntegrationRuntimeWorkbench", () => ({
  IntegrationRuntimeWorkbench: () => null,
}));

const catalog: IntegrationCatalogResponse = {
  generatedAt: "2026-10-03T00:00:00.000Z",
  categories: ["storage"],
  providers: [
    {
      id: "drive",
      name: "드라이브 저장소",
      category: "storage",
      summary: "파일을 외부 저장소에 보관합니다.",
      capabilities: ["업로드"],
      connectionMode: "OAuth",
      activation: "manual",
      configured: true,
      executable: true,
      status: "ready",
      statusReason: "연결되어 있습니다.",
    },
  ],
};

beforeEach(() => {
  catalogState.value = catalog;
});

afterEach(() => cleanup());

describe("연동 센터 빈 상태와 로딩", () => {
  it("검색 결과가 없으면 빈 상태와 필터 초기화 행동을 보여주고, 초기화하면 목록이 돌아온다", () => {
    render(
      <MemoryRouter initialEntries={["/settings/integrations"]}>
        <IntegrationCenterPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("드라이브 저장소")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("이름·기능·공급자 검색"), {
      target: { value: "없는연동" },
    });
    expect(screen.getByText("조건에 맞는 연동이 없습니다.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "필터 초기화" }));
    expect(screen.getByText("드라이브 저장소")).toBeTruthy();
  });

  it("연동 로딩은 정적 텍스트가 아니라 상태 역할과 동적 표시를 함께 제공한다", () => {
    const { container } = render(<IntegrationLoading />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-label")).toBe("연동 상태를 확인하고 있습니다.");
    // 공용 LoadingState(pulse)가 실제로 내장돼 있고, 메시지는 화면에도 보인다.
    expect(container.querySelectorAll("[data-slot='loading-state']")).toHaveLength(1);
    expect(screen.getAllByText("연동 상태를 확인하고 있습니다.").length).toBeGreaterThanOrEqual(1);
  });
});
