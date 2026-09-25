// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PromotionEditorPage } from "./PromotionEditorPage";
import { initialPromotionDraft, readPromotionDraft, savePromotionDraft } from "./promotion-draft";

const mocks = vi.hoisted(() => ({ state: { userId: "artist" }, create: vi.fn(), update: vi.fn(), detail: vi.fn() }));
vi.mock("@/shared/lib/store", () => ({
  useApp: Object.assign((selector: (state: { userId: string }) => unknown) => selector(mocks.state), { getState: () => mocks.state }),
  useHydrated: () => true,
}));
vi.mock("@/hooks/use-document-title", () => ({ useDocumentTitle: () => undefined }));
vi.mock("@/platform/promotion-client", () => ({ promotionClient: mocks }));
vi.mock("@/platform/api", () => ({ getApiErrorMessage: async () => "등록 실패: 입력 내용이 유지됩니다." }));
function view() {
  return render(<MemoryRouter initialEntries={["/community/promote/new"]}><Routes>
    <Route path="/community/promote/new" element={<PromotionEditorPage />} />
    <Route path="/community/promote/:id" element={<div>공개 결과</div>} />
  </Routes></MemoryRouter>);
}
const draft = () => ({ ...initialPromotionDraft(), title: "새 작품을 소개합니다", seriesTitle: "별의 여행", description: "첫 번째 웹툰의 이야기를 소개합니다. 새로운 세계의 모험을 함께해 주세요.", rightsConfirmed: true });
beforeEach(() => { sessionStorage.clear(); mocks.state.userId = "artist"; vi.clearAllMocks(); });
afterEach(cleanup);
describe("promotion authoring recovery", () => {
  it("restores text, resets consent, and saves last input on refresh", async () => {
    savePromotionDraft("artist", { draft: draft(), tags: "첫연재" });
    view();
    expect((screen.getByLabelText("작품명") as HTMLInputElement).value).toBe("별의 여행");
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
    fireEvent.change(screen.getByLabelText("소개 제목"), { target: { value: "새로 작성한 소개 제목" } });
    fireEvent(window, new Event("pagehide"));
    await waitFor(() => expect(readPromotionDraft("artist")).toMatchObject({ status: "restored", value: { draft: { title: "새로 작성한 소개 제목" } } }));
  });
  it("retains the draft when publishing fails", async () => {
    savePromotionDraft("artist", { draft: draft(), tags: "첫연재" });
    mocks.create.mockRejectedValueOnce(new Error("unavailable"));
    const rendered = view();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.submit(rendered.container.querySelector("form")!);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("등록 실패"));
    expect(readPromotionDraft("artist").status).toBe("restored");
    expect((screen.getByLabelText("작품명") as HTMLInputElement).value).toBe("별의 여행");
  });
  it("clears only the publishing account's draft after success", async () => {
    savePromotionDraft("artist", { draft: draft(), tags: "" });
    savePromotionDraft("other", { draft: draft(), tags: "다른 계정" });
    mocks.create.mockResolvedValueOnce({ id: "11111111-1111-4111-8111-111111111111" });
    const rendered = view();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.submit(rendered.container.querySelector("form")!);
    await screen.findByText("공개 결과");
    expect(readPromotionDraft("artist").status).toBe("empty");
    expect(readPromotionDraft("other").status).toBe("restored");
  });
});
