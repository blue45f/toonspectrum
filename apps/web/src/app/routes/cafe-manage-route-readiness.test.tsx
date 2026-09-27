// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RouteStage } from "./route-stage";

import { CafeManagePage } from "@/domains/community/CafeManagePage";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  state: { userId: null as string | null, sessionToken: null as string | null },
}));

vi.mock("@/platform/api", () => ({
  api: { get: mocks.get },
  getApiErrorMessage: vi.fn(),
}));
vi.mock("@/shared/lib/store", () => ({
  useApp: (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state),
}));
vi.mock("@/shared/seo/use-document-title", () => ({ useDocumentTitle: () => undefined }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("카페 관리 비로그인 상태", () => {
  it("로그인 안내를 로딩 지연으로 바꾸거나 관리 데이터를 요청하지 않는다", async () => {
    vi.useFakeTimers();
    const pathname = "/community/cafes/test-cafe/manage";
    render(
      <MemoryRouter initialEntries={[pathname]}>
        <Routes>
          <Route path="/community/cafes/:slug/manage" element={
            <RouteStage pathname={pathname} search="" accessibleTitle="커뮤니티 운영 관리">
              <CafeManagePage />
            </RouteStage>
          } />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("로그인이 필요해요.")).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(8_100); });

    const stage = document.querySelector("[data-route-stage-key]");
    expect(stage?.getAttribute("data-route-state")).toBe("blocked");
    expect(stage?.getAttribute("data-route-readiness-source")).toBe("explicit");
    expect(document.querySelector("[data-route-recovery]")).toBeNull();
    expect(mocks.get).not.toHaveBeenCalled();
  });
});
