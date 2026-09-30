// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualSpacePoll } from "./StudioVirtualSpacePoll";
import { castStudioPollVote, createStudioPoll, type StudioPoll } from "./studio-virtual-space-poll";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function makePoll(): StudioPoll {
  const created = createStudioPoll({
    question: "다음 회식 메뉴는?",
    options: ["치킨", "피자", "초밥"],
    anonymous: false,
    createdBySessionId: "host:1",
    createdByName: "호스트",
    nowMs: 1_700_000_000_000,
    id: "poll-1",
  });
  if (!created.ok) throw new Error("poll 생성 실패");
  return created.poll;
}

const baseProps = {
  canCreate: true,
  canClose: true,
  voterSessionId: "voter:1",
  voterName: "유권자",
  onCreate: () => {},
  onVote: () => {},
  onClose: () => {},
};

describe("StudioVirtualSpacePoll", () => {
  it("투표가 없으면 생성 마법사를 보여준다", () => {
    render(<StudioVirtualSpacePoll poll={null} {...baseProps} />);
    expect(screen.getByRole("heading", { name: "투표 만들기" })).toBeTruthy();
    expect(screen.getByPlaceholderText(/다음 스프린트 주제/)).toBeTruthy();
  });

  it("투표 카드를 렌더링하고 선택지를 보여준다", () => {
    const poll = makePoll();
    render(<StudioVirtualSpacePoll poll={poll} {...baseProps} />);
    expect(screen.getByText("다음 회식 메뉴는?")).toBeTruthy();
    expect(screen.getByText("치킨")).toBeTruthy();
    expect(screen.getByText("피자")).toBeTruthy();
    expect(screen.getByText("초밥")).toBeTruthy();
  });

  it("선택지를 클릭하면 onVote가 호출된다", () => {
    const poll = makePoll();
    const onVote = vi.fn();
    render(<StudioVirtualSpacePoll poll={poll} {...baseProps} onVote={onVote} />);
    const options = poll.options;
    fireEvent.click(screen.getByRole("button", { name: /치킨/ }));
    expect(onVote).toHaveBeenCalledWith(options[0].id);
  });

  it("이미 투표한 사용자에게는 투표 완료 표시를 보여준다", () => {
    let poll = makePoll();
    const voted = castStudioPollVote(poll, {
      optionId: poll.options[1].id,
      voterSessionId: "voter:1",
      voterName: "유권자",
      nowMs: 1_700_000_001_000,
    });
    if (!voted.ok) throw new Error(`투표 실패: ${voted.reason}`);
    poll = voted.poll;
    render(<StudioVirtualSpacePoll poll={poll} {...baseProps} />);
    expect(screen.getByText("투표 완료")).toBeTruthy();
    // 투표 버튼은 비활성화된다
    const voteButton = screen.getByRole("button", { name: /"치킨"에 투표/ }) as HTMLButtonElement;
    expect(voteButton.disabled).toBe(true);
  });

  it("생성 권한이 없으면 일러스트와 가이드를 보여준다", () => {
    render(<StudioVirtualSpacePoll poll={null} {...baseProps} canCreate={false} />);
    expect(screen.getByText("진행 중인 투표가 없어요.")).toBeTruthy();
    expect(screen.getByText(/투표 권한이 있는 참가자/)).toBeTruthy();
  });

  it("마법사 입력 오류를 알림으로 안내하고 해결 방법을 제시한다", () => {
    render(<StudioVirtualSpacePoll poll={null} {...baseProps} />);
    const next = screen.getByRole("button", { name: "다음" }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("질문을 입력해주세요.");
    fireEvent.change(screen.getByPlaceholderText(/다음 스프린트 주제/), {
      target: { value: "점심 메뉴?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByRole("alert").textContent).toContain("빈 선택지가 있어요.");
  });

  it("마법사 단계가 질문→선택지→설정→확인 순서로 진행된다", () => {
    const onCreate = vi.fn();
    render(<StudioVirtualSpacePoll poll={null} {...baseProps} onCreate={onCreate} />);
    fireEvent.change(screen.getByPlaceholderText(/다음 스프린트 주제/), {
      target: { value: "점심 메뉴?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.change(screen.getByLabelText("선택지 1"), { target: { value: "치킨" } });
    fireEvent.change(screen.getByLabelText("선택지 2"), { target: { value: "피자" } });
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: /익명 투표/ }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByText("점심 메뉴?")).toBeTruthy();
    expect(screen.getByText("치킨")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "투표 시작" }));
    expect(onCreate).toHaveBeenCalledWith({
      question: "점심 메뉴?",
      options: ["치킨", "피자"],
      anonymous: true,
      closesInMs: 15 * 60_000,
    });
  });
});
