// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MentionText,
  QuickReactionPicker,
  ReactionBar,
  ThreadStatusChip,
  TypingIndicator,
} from "./StudioCommentEnhancements";

afterEach(cleanup);

describe("TypingIndicator", () => {
  it("타이핑 중인 사용자가 없으면 아무것도 렌더링하지 않는다", () => {
    const { container } = render(<TypingIndicator users={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("한 명의 타이핑을 표시한다", () => {
    render(<TypingIndicator users={[{ userId: "u1", userName: "민준" }]} />);
    expect(screen.getByRole("status").textContent).toMatch(/민준님이 입력 중/);
  });

  it("여러 명이면 대표 이름 + 외 N명을 표시한다", () => {
    render(
      <TypingIndicator
        users={[
          { userId: "u1", userName: "민준" },
          { userId: "u2", userName: "지훈" },
        ]}
      />
    );
    expect(screen.getByRole("status").textContent).toMatch(/민준, 지훈/);
  });
});

describe("ReactionBar", () => {
  it("집계된 리액션을 보여준다", () => {
    render(
      <ReactionBar
        reactions={[
          { emoji: "👍", userId: "a" },
          { emoji: "👍", userId: "b" },
        ]}
        myUserId="me"
        onToggle={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: /👍 2개/ })).toBeTruthy();
  });

  it("내 리액션은 aria-pressed=true", () => {
    render(
      <ReactionBar
        reactions={[{ emoji: "❤️", userId: "me" }]}
        myUserId="me"
        onToggle={() => {}}
      />
    );
    expect(
      screen.getByRole("button", { name: /❤️/ }).getAttribute("aria-pressed")
    ).toBe("true");
  });

  it("클릭하면 onToggle이 호출된다", () => {
    const onToggle = vi.fn();
    render(
      <ReactionBar
        reactions={[{ emoji: "👍", userId: "a" }]}
        myUserId="me"
        onToggle={onToggle}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /👍/ }));
    expect(onToggle).toHaveBeenCalledWith("👍");
  });
});

describe("QuickReactionPicker", () => {
  it("5개 이모지를 고르면 onPick이 호출된다", () => {
    const onPick = vi.fn();
    render(<QuickReactionPicker onPick={onPick} />);
    fireEvent.click(screen.getByRole("button", { name: /👏/ }));
    expect(onPick).toHaveBeenCalledWith("👏");
  });
});

describe("MentionText", () => {
  it("멘션을 하이라이트한다", () => {
    render(<MentionText text="@민준 이거 봐줘" />);
    expect(screen.getByText("@민준")).toBeTruthy();
  });

  it("멘션이 없으면 텍스트 그대로", () => {
    const { container } = render(<MentionText text="그냥 댓글" />);
    expect(container.textContent).toBe("그냥 댓글");
  });

  it("멘션 클릭 시 콜백에 이름(조사 제거)을 전달한다", () => {
    const onMentionClick = vi.fn();
    render(
      <MentionText text="@민준이 봐줘" onMentionClick={onMentionClick} />
    );
    fireEvent.click(screen.getByRole("button", { name: "@민준이" }));
    expect(onMentionClick).toHaveBeenCalledWith("민준");
  });
});

describe("ThreadStatusChip", () => {
  it("미해결 상태를 표시한다", () => {
    render(<ThreadStatusChip resolved={false} />);
    expect(screen.getByRole("status").textContent).toContain("미해결");
  });

  it("해결됨 상태를 표시한다", () => {
    render(<ThreadStatusChip resolved={true} />);
    expect(screen.getByRole("status").textContent).toContain("해결됨");
  });

  it("onToggle이 있으면 버튼으로 동작한다", () => {
    const onToggle = vi.fn();
    render(<ThreadStatusChip resolved={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button", { name: "해결하기" }));
    expect(onToggle).toHaveBeenCalled();
  });
});
