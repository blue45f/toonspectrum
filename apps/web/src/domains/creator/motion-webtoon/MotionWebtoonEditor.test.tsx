// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MotionWebtoonEditor } from "./MotionWebtoonEditor";
import type { MotionEpisode } from "./motion-webtoon-model";

function makeEmptyEpisode(): MotionEpisode {
  return {
    id: "ep-1",
    titleKo: "",
    titleEn: "",
    characters: [],
    cuts: [],
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("MotionWebtoonEditor", () => {
  it("히어로에 핵심 액션 1개(✨ AI 자동 연출)가 강조된다", () => {
    render(<MotionWebtoonEditor initialEpisode={makeEmptyEpisode()} />);
    expect(screen.queryByText("컷이, 영상이 되는 순간")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "✨ AI 자동 연출로 완성하기" })).toBeTruthy();
  });

  it("3단계 안내 카드가 일러스트와 함께 보인다", () => {
    render(<MotionWebtoonEditor initialEpisode={makeEmptyEpisode()} />);
    expect(screen.queryByText("컷 올리기")).toBeTruthy();
    expect(screen.queryByText("AI 자동 연출")).toBeTruthy();
    expect(screen.queryByText("미리보기·공유")).toBeTruthy();
  });

  it("빈 회차에서는 다음 행동(첫 컷 추가하기)을 안내한다", () => {
    render(<MotionWebtoonEditor initialEpisode={makeEmptyEpisode()} />);
    expect(screen.queryByText("아직 컷이 없어요")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "첫 컷 추가하기" })).toBeTruthy();
  });

  it("히어로 CTA는 컷이 없을 때 샘플을 깔고 AI 연출까지 적용한다", () => {
    const onChange = vi.fn();
    render(<MotionWebtoonEditor initialEpisode={makeEmptyEpisode()} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "✨ AI 자동 연출로 완성하기" }));
    expect(onChange).toHaveBeenCalled();
    const episode = onChange.mock.calls[0]![0] as MotionEpisode;
    expect(episode.cuts.length).toBe(3);
    // AI가 BGM 분위기를 입혔다 (daily 기본값이 아님)
    expect(episode.cuts.every((c) => c.bgm.sceneMood !== "daily")).toBe(true);
    // AI 연출 완료 안내가 보인다
    expect(
      screen.queryByText("AI가 연출·BGM·음성을 입혔습니다. 각 항목을 확인하고 수정하세요."),
    ).toBeTruthy();
  });

  it("고급 설정은 details로 접혀 있다", () => {
    const onChange = vi.fn();
    const { container } = render(<MotionWebtoonEditor initialEpisode={makeEmptyEpisode()} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "✨ AI 자동 연출로 완성하기" }));
    const details = container.querySelector("details.mw-details");
    expect(details).toBeTruthy();
    expect(details!.hasAttribute("open")).toBe(false);
    expect(screen.queryByText("고급 설정")).toBeTruthy();
  });

  it("검증 이슈가 있으면 컷으로 이동 버튼이 보인다", () => {
    const episode: MotionEpisode = {
      ...makeEmptyEpisode(),
      cuts: [
        {
          id: "cut-1",
          imageUrl: "",
          altKo: "컷 1",
          altEn: "Cut 1",
          direction: { cameraMove: "static", durationSeconds: 6, intensity: 0.5 },
          transitionIn: "cut",
          bgm: { sceneMood: "daily", crossfadeSeconds: 2 },
          dialogues: [],
        },
      ],
    };
    render(<MotionWebtoonEditor initialEpisode={episode} />);
    expect(screen.queryByText(/고칠 점이 있어요/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /컷으로 이동/ })).toBeTruthy();
  });

  it("대사가 없는 컷에는 대사 빈 상태와 추가 버튼이 보인다", () => {
    const episode: MotionEpisode = {
      ...makeEmptyEpisode(),
      characters: [{ id: "char-1", nameKo: "주인공", nameEn: "Hero", presetId: "narrator" }],
      cuts: [
        {
          id: "cut-1",
          imageUrl: "https://example.com/1.png",
          altKo: "컷 1",
          altEn: "Cut 1",
          direction: { cameraMove: "static", durationSeconds: 6, intensity: 0.5 },
          transitionIn: "cut",
          bgm: { sceneMood: "daily", crossfadeSeconds: 2 },
          dialogues: [],
        },
      ],
    };
    render(<MotionWebtoonEditor initialEpisode={episode} />);
    expect(screen.queryByText("대사가 없어요")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "첫 대사 추가하기" })).toBeTruthy();
  });
});
