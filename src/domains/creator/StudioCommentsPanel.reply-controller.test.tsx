// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addStudioCommentThread,
  createEmptyStudioCommentsDocument,
  resolveStudioCommentThread,
} from "./studio-comments";
import { StudioCommentsPanel } from "./StudioCommentsPanel";

import type { StudioCommentsPanelProps } from "./StudioCommentsPanel";

const ACTOR = { id: "user-1", displayName: "하린" };
const ANCHOR = { type: "page", pageId: "page-1" } as const;
const DOCUMENT = addStudioCommentThread(createEmptyStudioCommentsDocument(), {
  id: "thread-1",
  anchor: ANCHOR,
  author: { id: "user-2", displayName: "민호" },
  body: "말풍선 위치를 확인해 주세요.",
}, new Date("2025-01-01T01:00:00.000Z"));

function panelProps(
  overrides: Partial<StudioCommentsPanelProps> = {}
): StudioCommentsPanelProps {
  return {
    open: true,
    onClose: vi.fn(),
    document: DOCUMENT,
    onChange: vi.fn(async () => true),
    activeAnchor: ANCHOR,
    currentActor: ACTOR,
    ...overrides,
  };
}

afterEach(() => cleanup());

describe("StudioCommentsPanel shared reply controller", () => {
  it("renders a parent-owned draft, delegates changes with its stable ID, and fences same-tick submit", async () => {
    let settle!: (accepted: boolean) => void;
    const onSubmit = vi.fn(() => new Promise<boolean>((resolve) => {
      settle = resolve;
    }));
    const onBodyChange = vi.fn();
    const sharedReply = {
      threadId: "thread-1",
      body: "팝오버에서 작성한 초안",
      mutationId: "reply-stable-1",
      submitting: false,
      onThreadChange: vi.fn(),
      onBodyChange,
      onDiscard: vi.fn(),
      onSubmit,
    };
    const props = panelProps({ sharedReply });
    const view = render(<StudioCommentsPanel {...props} />);

    const textarea = await screen.findByRole<HTMLTextAreaElement>("textbox", {
      name: "민호에게 답글",
    });
    expect(textarea.value).toBe("팝오버에서 작성한 초안");
    fireEvent.change(textarea, { target: { value: "검토함에서 이어 쓴 초안" } });
    expect(onBodyChange).toHaveBeenCalledWith("thread-1", "검토함에서 이어 쓴 초안");

    const updatedSharedReply = { ...sharedReply, body: "검토함에서 이어 쓴 초안" };
    view.rerender(<StudioCommentsPanel {...props} sharedReply={updatedSharedReply} />);
    const updatedTextarea = screen.getByRole<HTMLTextAreaElement>("textbox", {
      name: "민호에게 답글",
    });
    const form = updatedTextarea.closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    fireEvent.submit(form!);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      threadId: "thread-1",
      body: "검토함에서 이어 쓴 초안",
      mutationId: "reply-stable-1",
    });
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(sharedReply.onDiscard).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "민호에게 답글" })).toBeTruthy();

    view.rerender(
      <StudioCommentsPanel {...props} open={false} sharedReply={updatedSharedReply} />
    );
    expect(screen.queryByRole("textbox", { name: "민호에게 답글" })).toBeNull();
    view.rerender(
      <StudioCommentsPanel {...props} open sharedReply={updatedSharedReply} />
    );
    expect((await screen.findByRole<HTMLTextAreaElement>("textbox", {
      name: "민호에게 답글",
    })).value).toBe("검토함에서 이어 쓴 초안");

    settle(true);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(sharedReply.onDiscard).toHaveBeenCalledWith("thread-1");
  });

  it("keeps the original uncontrolled draft across close and reopen", async () => {
    const props = panelProps();
    const view = render(<StudioCommentsPanel {...props} />);

    fireEvent.click(await screen.findByRole("button", { name: "답글" }));
    const textarea = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "민호에게 답글" });
    fireEvent.change(textarea, { target: { value: "레일 내부 초안" } });
    view.rerender(<StudioCommentsPanel {...props} open={false} />);
    await waitFor(() => {
      expect(screen.queryByRole("textbox", { name: "민호에게 답글" })).toBeNull();
    });
    view.rerender(<StudioCommentsPanel {...props} open />);

    const restored = await screen.findByRole<HTMLTextAreaElement>("textbox", {
      name: "민호에게 답글",
    });
    expect(restored.value).toBe("레일 내부 초안");
  });

  it("keeps a shared draft visible across mode switches, rail close, and a different anchor", async () => {
    const onClose = vi.fn();
    const onChange = vi.fn(async () => true);
    const onDiscard = vi.fn();
    const sharedReply = {
      threadId: "thread-1",
      body: "사라지면 안 되는 공유 초안",
      mutationId: "reply-protected-1",
      submitting: false,
      onThreadChange: vi.fn(),
      onBodyChange: vi.fn(),
      onDiscard,
      onSubmit: vi.fn(async () => true),
    };
    const props = panelProps({ onClose, onChange, sharedReply });
    const view = render(<StudioCommentsPanel {...props} />);

    const replyEditor = await screen.findByRole<HTMLTextAreaElement>("textbox", {
      name: "민호에게 답글",
    });
    fireEvent.click(screen.getByRole("button", { name: "답글" }));
    expect(replyEditor.isConnected).toBe(true);
    expect(onDiscard).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "담당자 지정" }));
    fireEvent.click(screen.getByRole("button", { name: "민호의 댓글 해결 처리" }));
    fireEvent.click(screen.getByRole("button", { name: "검토 댓글 닫기" }));
    expect(onDiscard).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert").textContent).toContain("작성 중인 답글");
    expect(screen.getByRole("textbox", { name: "민호에게 답글" })).toBeTruthy();

    view.rerender(<StudioCommentsPanel {...props} open={false} />);
    view.rerender(
      <StudioCommentsPanel
        {...props}
        activeAnchor={{ type: "page", pageId: "page-2" }}
        document={resolveStudioCommentThread(DOCUMENT, "thread-1", ACTOR)}
        open
      />
    );
    expect((await screen.findByRole<HTMLTextAreaElement>("textbox", {
      name: "민호에게 답글",
    })).value).toBe("사라지면 안 되는 공유 초안");
    expect(screen.queryByRole("textbox", { name: "댓글 위치" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(onDiscard).toHaveBeenCalledWith("thread-1");
  });

  it("fences same-tick double submit in the original uncontrolled path", async () => {
    let settle!: (accepted: boolean) => void;
    const onChange = vi.fn(() => new Promise<boolean>((resolve) => {
      settle = resolve;
    }));
    render(<StudioCommentsPanel {...panelProps({ onChange })} />);

    fireEvent.click(await screen.findByRole("button", { name: "답글" }));
    const textarea = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "민호에게 답글" });
    fireEvent.change(textarea, { target: { value: "한 번만 제출할 초안" } });
    const form = textarea.closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    fireEvent.submit(form!);
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));

    settle(true);
    await waitFor(() => {
      expect(screen.queryByRole("textbox", { name: "민호에게 답글" })).toBeNull();
    });
  });
});
