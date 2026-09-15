// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThreadedCommentSection } from "./threaded-comment-section";

import type { ThreadedCommentRecord } from "./threaded-comment-model";

function comment(
  id: string,
  text: string,
  overrides: Partial<ThreadedCommentRecord> = {},
): ThreadedCommentRecord {
  return {
    id,
    parentId: null,
    author: { id: "viewer-1", name: "작성자" },
    text,
    deleted: false,
    likes: 0,
    viewerLiked: false,
    createdAt: "2026-09-16T00:00:00.000Z",
    updatedAt: "2026-09-16T00:00:00.000Z",
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

interface HarnessProps {
  initial?: ThreadedCommentRecord[];
  onCreate: (text: string, parentId: string | null) => Promise<ThreadedCommentRecord>;
  onUpdate?: (commentId: string, text: string) => Promise<ThreadedCommentRecord>;
  onDelete?: (commentId: string) => Promise<{ deleted: true; soft: boolean; removedIds: string[] }>;
  onToggleLike?: (commentId: string) => Promise<{ liked: boolean; likes: number }>;
}

function Harness({
  initial = [],
  onCreate,
  onUpdate = async (commentId, text) => comment(commentId, text),
  onDelete = async (commentId) => ({ deleted: true, soft: false, removedIds: [commentId] }),
  onToggleLike = async () => ({ liked: true, likes: 1 }),
}: HarnessProps) {
  const [comments, setComments] = useState(initial);
  return (
    <ThreadedCommentSection
      comments={comments}
      setComments={setComments}
      viewerId="viewer-1"
      onCreate={onCreate}
      onUpdate={onUpdate}
      onDelete={onDelete}
      onToggleLike={onToggleLike}
      placeholder="댓글 입력"
      draftStorageKey="threaded-comment-test-draft"
    />
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ThreadedCommentSection interactions", () => {
  it("deduplicates rapid submissions before React rerenders the disabled state", async () => {
    const gate = deferred<ThreadedCommentRecord>();
    const create = vi.fn(() => gate.promise);
    render(<Harness onCreate={create} />);

    fireEvent.change(screen.getByLabelText("댓글 입력"), {
      target: { value: "첫 댓글" },
    });
    const submit = screen.getByRole("button", { name: "등록" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith("첫 댓글", null);
    await act(async () => gate.resolve(comment("comment-1", "첫 댓글")));
    expect(await screen.findByText("첫 댓글")).toBeTruthy();
  });

  it("updates, reacts to, and deletes an owned comment without a full reload", async () => {
    const update = vi.fn(async (commentId: string, text: string) =>
      comment(commentId, text, { updatedAt: "2026-09-16T00:01:00.000Z" }));
    const toggleLike = vi.fn(async () => ({ liked: true, likes: 1 }));
    const remove = vi.fn(async (commentId: string) => ({
      deleted: true as const,
      soft: false,
      removedIds: [commentId],
    }));
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <Harness
        initial={[comment("comment-1", "수정 전")]}
        onCreate={async () => comment("unused", "unused")}
        onUpdate={update}
        onDelete={remove}
        onToggleLike={toggleLike}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "수정" }));
    fireEvent.change(screen.getByLabelText("댓글 수정"), {
      target: { value: "수정 후" },
    });
    fireEvent.click(screen.getByRole("button", { name: "수정 저장" }));
    expect(await screen.findByText("수정 후")).toBeTruthy();
    expect(update).toHaveBeenCalledWith("comment-1", "수정 후");

    fireEvent.click(screen.getByRole("button", { name: /공감 0/ }));
    await waitFor(() => expect(toggleLike).toHaveBeenCalledWith("comment-1"));
    expect(screen.getByRole("button", { name: /공감 1/ }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("comment-1"));
    expect(screen.queryByText("수정 후")).toBeNull();
  });
});
