// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FeedbackThread } from "./FeedbackThread";

import type { FeedbackComment } from "@toonspectrum/core/feedback";

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

vi.mock("@/infrastructure/api", () => ({
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
