// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FeedbackThread } from "./FeedbackThread";

import type { FeedbackComment } from "@toonstudio/core/feedback";

const mocks = vi.hoisted(() => ({
  state: { userId: "reader-1" as string | null },
  get: vi.fn(),
  post: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/shared/lib/store", () => ({
  useApp: Object.assign(
    (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state),
    { getState: () => mocks.state },
  ),
}));

vi.mock("@/platform/api", () => ({
  api: { get: mocks.get, post: mocks.post },
  getApiErrorMessage: mocks.error,
}));

function reply(
  id: string,
  parentId: string | null,
  text: string,
  children: FeedbackComment[] = [],
): FeedbackComment {
  return {
    id,
    postId: "post-1",
    parentId,
    text,
    isOfficial: false,
    author: { id: `author-${id}`, name: id === "root-1" ? "앨리스" : id, avatar: "" },
    createdAt: "2026-09-16T00:00:00.000Z",
    children,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  mocks.state.userId = "reader-1";
  mocks.error.mockImplementation(async (cause: unknown, fallback: string) =>
    cause instanceof Error ? cause.message : fallback);
});

afterEach(cleanup);

describe("FeedbackThread nested replies", () => {
  it("posts a reply with parentId and inserts it into the visible thread", async () => {
    const root = reply("root-1", null, "첫 댓글");
    const created = reply("child-1", root.id, "새 대댓글");
    mocks.get.mockResolvedValueOnce([root]);
    mocks.post.mockResolvedValueOnce(created);
    const onAdded = vi.fn();

    render(
      <FeedbackThread
        postId="post-1"
        userId="reader-1"
        revision={1}
        onAdded={onAdded}
      />,
    );

    await screen.findByText("첫 댓글");
    fireEvent.click(screen.getByRole("button", { name: "답글" }));
    const composer = screen.getByRole("form", { name: "앨리스님에게 답글 작성" });
    fireEvent.change(within(composer).getByLabelText("앨리스님에게 답글"), {
      target: { value: "새 대댓글" },
    });
    fireEvent.submit(composer);

    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith(
      "/feedback/posts/post-1/replies",
      { text: "새 대댓글", parentId: "root-1" },
      { timeout: 30_000, referrerPolicy: "no-referrer" },
    ));
    expect(await screen.findByText("새 대댓글")).toBeTruthy();
    expect(onAdded).toHaveBeenCalledWith(created);
    expect(screen.getByRole("status").textContent).toContain("답글이 등록되었습니다.");
  });

  it("keeps failed reply text and prevents replies beyond the supported depth", async () => {
    const depth4 = reply("depth-4", "depth-3", "깊이 4");
    const depth3 = reply("depth-3", "depth-2", "깊이 3", [depth4]);
    const depth2 = reply("depth-2", "depth-1", "깊이 2", [depth3]);
    const depth1 = reply("depth-1", "root-1", "깊이 1", [depth2]);
    const root = reply("root-1", null, "첫 댓글", [depth1]);
    mocks.get.mockResolvedValueOnce([root]);
    mocks.post.mockRejectedValueOnce(new Error("등록 실패"));

    render(
      <FeedbackThread
        postId="post-1"
        userId="reader-1"
        revision={5}
        onAdded={vi.fn()}
      />,
    );

    await screen.findByText("깊이 4");
    const deepest = screen.getByText("깊이 4").closest("li");
    expect(deepest).toBeTruthy();
    expect(within(deepest as HTMLElement).queryByRole("button", { name: "답글" })).toBeNull();

    fireEvent.click(screen.getAllByRole("button", { name: "답글" })[0]!);
    const textarea = screen.getByLabelText("앨리스님에게 답글") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "유지할 내용" } });
    fireEvent.submit(screen.getByRole("form", { name: "앨리스님에게 답글 작성" }));

    expect((await screen.findByRole("alert")).textContent).toContain("등록 실패");
    expect(textarea.value).toBe("유지할 내용");
  });
});

describe("댓글 실패 후 초안과 쓰기 경계", () => {
  it("목록 확인 전에는 폼과 단축키 전송을 막고 동일한 초안 입력을 복구 후 전송한다", async () => {
    mocks.get.mockResolvedValueOnce([]);
    const onAdded = vi.fn();
    const { rerender } = render(
      <FeedbackThread postId="post-1" userId="reader-1" revision={0} readOnly onAdded={onAdded} />,
    );
    await screen.findByText("아직 댓글이 없어요.", { exact: false });
    const textarea = screen.getByRole("textbox", { name: /^공개 댓글$/u });
    const form = screen.getByRole("form", { name: "공개 댓글 작성" });
    fireEvent.change(textarea, { target: { value: "읽기 복구 전에도 유지할 초안" } });
    expect(screen.getByRole("button", { name: /^댓글 등록$/u }).hasAttribute("disabled")).toBe(true);
    fireEvent.submit(form);
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });
    expect(mocks.post).not.toHaveBeenCalled();

    rerender(<FeedbackThread postId="post-1" userId="reader-1" revision={0} onAdded={onAdded} />);
    expect(screen.getByRole("textbox", { name: /^공개 댓글$/u })).toBe(textarea);
    expect(screen.getByDisplayValue("읽기 복구 전에도 유지할 초안")).toBe(textarea);
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(mocks.post).not.toHaveBeenCalled();

    const created = reply("recovered-comment", null, "읽기 복구 전에도 유지할 초안");
    mocks.post.mockResolvedValueOnce(created);
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(created));
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue("")).toBe(textarea);
    expect(await screen.findByText("댓글이 등록되었습니다.")).toBeTruthy();
  });

  it("안전한 전송 오류를 표시하고 초안을 보존하며 사용자 재시도 성공 후에만 비운다", async () => {
    mocks.get.mockResolvedValueOnce([]);
    const failure = new Error("백엔드 원문 노출 금지");
    const safeMessage = "요청을 처리하지 못했습니다.";
    mocks.post.mockRejectedValueOnce(failure);
    mocks.error.mockResolvedValueOnce(safeMessage);
    const onAdded = vi.fn();
    render(<FeedbackThread postId="post-1" userId="reader-1" revision={0} onAdded={onAdded} />);
    await screen.findByText("아직 댓글이 없어요.", { exact: false });
    const textarea = screen.getByRole("textbox", { name: /^공개 댓글$/u });
    const form = screen.getByRole("form", { name: "공개 댓글 작성" });
    fireEvent.change(textarea, { target: { value: "실패해도 보존할 내용" } });
    fireEvent.submit(form);

    expect((await screen.findByRole("alert")).textContent).toBe(safeMessage);
    expect(mocks.error).toHaveBeenCalledWith(failure, "댓글을 보내지 못했어요. 입력 내용은 유지됩니다.");
    expect(screen.queryByText(failure.message)).toBeNull();
    expect(screen.getByDisplayValue("실패해도 보존할 내용")).toBe(textarea);
    expect(onAdded).not.toHaveBeenCalled();
    expect(mocks.post).toHaveBeenCalledTimes(1);

    const created = reply("retried-comment", null, "실패해도 보존할 내용");
    mocks.post.mockResolvedValueOnce(created);
    fireEvent.submit(form);
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(created));
    expect(mocks.post).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByDisplayValue("")).toBe(textarea);
    expect(await screen.findByText("실패해도 보존할 내용")).toBeTruthy();
  });

  it("댓글 조회 실패를 빈 대화로 오인하지 않고 명시적인 다시 불러오기로 복구한다", async () => {
    mocks.get.mockRejectedValueOnce(new Error("원시 조회 실패"));
    mocks.error.mockResolvedValueOnce("댓글을 불러오지 못했어요.");
    render(<FeedbackThread postId="post-1" userId="reader-1" revision={0} onAdded={vi.fn()} />);
    expect((await screen.findByRole("alert")).textContent).toContain("댓글을 불러오지 못했어요.");
    expect(screen.queryByText("아직 댓글이 없어요.", { exact: false })).toBeNull();
    expect(mocks.post).not.toHaveBeenCalled();
    mocks.get.mockResolvedValueOnce([]);
    fireEvent.click(screen.getByRole("button", { name: "댓글 다시 불러오기" }));
    await screen.findByText("아직 댓글이 없어요.", { exact: false });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mocks.get).toHaveBeenCalledTimes(2);
    expect(mocks.post).not.toHaveBeenCalled();
  });
});
