// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FanPostReplySection } from "./fan-cafe-reply-section";
import { ReviewReplies } from "./review-replies";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(), state: { userId: "member-a" as string | null, sessionToken: null },
}));
vi.mock("@/platform/api", () => ({ apiFetch: mocks.fetch }));
vi.mock("@/shared/lib/store", () => ({ useApp: (select: (value: typeof mocks.state) => unknown) => select(mocks.state) }));
vi.mock("@/shared/lib/csrf", () => ({ withCsrfProtection: (init: RequestInit) => init }));
vi.mock("@/shared/hooks/use-celebrate", () => ({ useCelebrate: () => vi.fn() }));
const reply = { id: "reply-a", text: "저장된 답글", createdAt: new Date().toISOString(),
  author: { id: "member-a", name: "작성자", avatar: "#556677" }, children: [], spoiler: false };
function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error("검증용 Promise가 아직 초기화되지 않았습니다."); };
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => {
  mocks.fetch.mockReset();
  mocks.state.userId = "member-a";
  mocks.fetch.mockImplementation(() => Promise.resolve(Response.json([])));
});
afterEach(cleanup);
for (const mode of ["fan", "review"] as const) {
  const inputLabel = mode === "fan" ? "댓글 작성" : "리뷰에 답글 남기기";
  function element(id = "post-a") {
    return mode === "fan" ? <FanPostReplySection postId={id} /> : <ReviewReplies reviewId={id} />;
  }
  async function open() {
    const view = render(element());
    if (mode === "review") fireEvent.click(screen.getByRole("button", { name: "답글 보기" }));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
    await screen.findByText(mode === "fan" ? "첫 댓글을 남겨 대화를 시작하세요." : "첫 답글을 남겨 대화를 이어가세요.");
    return view;
  }
  describe(`${mode} 댓글 회복력`, () => {
    it("연속 클릭을 막고 전송 중 새로 작성한 초안을 보존한다", async () => {
      await open();
      const pending = deferred<Response>();
      mocks.fetch.mockImplementation((_url: string, init?: RequestInit) => init?.method === "POST" ? pending.promise : Promise.resolve(Response.json([])));
      const input = screen.getByRole("textbox", { name: inputLabel });
      fireEvent.change(input, { target: { value: "첫 번째 내용" } });
      const button = screen.getByRole("button", { name: "등록" });
      fireEvent.click(button);
      fireEvent.click(button);
      expect(mocks.fetch.mock.calls.filter((call) => call[1]?.method === "POST")).toHaveLength(1);
      expect((button as HTMLButtonElement).disabled).toBe(true);
      fireEvent.change(input, { target: { value: "새로 입력한 내용" } });
      await act(async () => { pending.resolve(Response.json(reply)); });
      expect((input as HTMLTextAreaElement).value).toBe("새로 입력한 내용");
      expect(screen.getByText(reply.text)).toBeTruthy();
    });
    it("실패한 입력을 유지하고 다시 등록할 수 있다", async () => {
      await open();
      mocks.fetch.mockRejectedValueOnce(new Error("network unavailable"));
      fireEvent.change(screen.getByRole("textbox", { name: inputLabel }), { target: { value: "보존할 입력" } });
      fireEvent.click(screen.getByRole("button", { name: "등록" }));
      expect((await screen.findByRole("alert")).textContent).toContain("입력 내용은 유지됩니다");
      expect((screen.getByRole("textbox", { name: inputLabel }) as HTMLTextAreaElement).value).toBe("보존할 입력");
      mocks.fetch.mockResolvedValueOnce(Response.json(reply));
      fireEvent.click(screen.getByRole("button", { name: "등록" }));
      await screen.findByText(reply.text);
      expect((screen.getByRole("textbox", { name: inputLabel }) as HTMLTextAreaElement).value).toBe("");
    });
    it("계정이 바뀌면 이전 계정 초안을 노출하지 않는다", async () => {
      const view = await open();
      fireEvent.change(screen.getByRole("textbox", { name: inputLabel }), { target: { value: "이전 계정 초안" } });
      mocks.state.userId = "member-b";
      view.rerender(element());
      if (mode === "review") fireEvent.click(screen.getByRole("button", { name: "답글 보기" }));
      expect((screen.getByRole("textbox", { name: inputLabel }) as HTMLTextAreaElement).value).toBe("");
    });
    it("다른 게시글로 이동하면 이전 글의 초안을 가져가지 않는다", async () => {
      const view = await open();
      fireEvent.change(screen.getByRole("textbox", { name: inputLabel }), { target: { value: "이전 글 초안" } });
      view.rerender(element("post-b"));
      if (mode === "review") fireEvent.click(screen.getByRole("button", { name: "답글 보기" }));
      expect((screen.getByRole("textbox", { name: inputLabel }) as HTMLTextAreaElement).value).toBe("");
    });
    it("잘못된 응답을 빈 목록으로 표시하지 않는다", async () => {
      mocks.fetch.mockResolvedValueOnce(Response.json({ error: "invalid" }));
      render(element());
      if (mode === "review") fireEvent.click(screen.getByRole("button", { name: "답글 보기" }));
      await screen.findByRole("alert");
      expect(screen.queryByText(/첫 (댓글|답글)을 남겨/)).toBeNull();
    });
    it("새로고침 실패 후에도 이미 보던 대화를 유지한다", async () => {
      mocks.fetch.mockResolvedValueOnce(Response.json([reply]));
      render(element());
      if (mode === "review") fireEvent.click(screen.getByRole("button", { name: "답글 보기" }));
      await screen.findByText(reply.text);
      mocks.fetch.mockRejectedValueOnce(new Error("offline"));
      fireEvent.click(screen.getByRole("button", { name: mode === "review" ? "답글 새로고침" : "새로고침" }));
      await screen.findByRole("alert");
      expect(screen.getByText(reply.text)).toBeTruthy();
    });
  });
}
