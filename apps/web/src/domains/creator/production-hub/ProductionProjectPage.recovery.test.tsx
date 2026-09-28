// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProductionProjectPage } from "./ProductionHubPage";
import { createProductionDemoProject } from "./production-demo";
import { useApp } from "@/shared/lib/store";

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock("./production-api", async (load) => ({ ...await load<typeof import("./production-api")>(),
  getProductionProject: (...args: unknown[]) => mocks.load(...args), executeProductionCommand: (...args: unknown[]) => mocks.save(...args) }));
vi.mock("@/platform/me-client", () => ({ getMyProfile: async () => { throw new Error("profile unavailable"); } }));
const project = { aggregate: { ...createProductionDemoProject(), projectId: "actual-route-project" },
  access: { view: true, comment: true, edit: true, manage: true, owner: true, role: "owner" } };
beforeEach(() => { vi.clearAllMocks(); useApp.setState({ userId: "local-test-owner" }); mocks.load.mockResolvedValue(project); });
afterEach(() => { cleanup(); useApp.setState({ userId: null }); });
function mount() {
  return render(<MemoryRouter initialEntries={["/production/projects/actual-route-project/review"]}><Routes>
    <Route path="/production/projects/:projectId/review" element={<ProductionProjectPage surface="review" />} />
  </Routes></MemoryRouter>);
}
it("실제 검수 페이지 연결에서 저장 실패는 초안을 삭제하지 않는다", async () => {
  mocks.save.mockRejectedValue(new Error("검수 저장 서버 오류"));
  mount();
  const input = await screen.findByRole("textbox", { name: "검수 질문" });
  fireEvent.change(input, { target: { value: "서버 오류에도 남아야 하는 질문" } });
  fireEvent.click(screen.getByRole("button", { name: "질문 추가" }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("검수 저장 서버 오류"));
  expect((input as HTMLTextAreaElement).value).toBe("서버 오류에도 남아야 하는 질문");
  expect(screen.getByRole("button", { name: "최신 상태 확인" })).toBeTruthy();
});
it("계정 해제 시 실제 라우트의 비공개 원고·질문 화면을 제거한다", async () => {
  mount(); await screen.findByRole("textbox", { name: "검수 질문" });
  act(() => useApp.setState({ userId: null }));
  await waitFor(() => expect(screen.queryByRole("textbox", { name: "검수 질문" })).toBeNull());
  expect(screen.getByRole("alert").textContent).toContain("로그인");
});
it("첫 조회 실패 뒤 페이지를 떠나지 않고 다시 불러와 복구한다", async () => {
  mocks.load.mockRejectedValueOnce(new Error("일시적인 프로젝트 조회 실패"));
  mount();
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
  await screen.findByRole("textbox", { name: "검수 질문" });
  expect(screen.queryByRole("alert")).toBeNull();
  expect(mocks.load).toHaveBeenCalledTimes(2);
});
