// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MotionWebtoonPlayer } from "./MotionWebtoonPlayer";
import type { MotionEpisode } from "./motion-webtoon-model";

function makeEpisode(): MotionEpisode {
  return {
    id: "ep-1",
    titleKo: "테스트 회차",
    titleEn: "Test episode",
    characters: [{ id: "char-1", nameKo: "주인공", nameEn: "Hero", presetId: "narrator" }],
    cuts: [
      {
        id: "cut-1",
        imageUrl: "https://example.com/1.png",
        altKo: "컷 1",
        altEn: "Cut 1",
        direction: { cameraMove: "zoom-in", durationSeconds: 6, intensity: 0.5 },
        transitionIn: "fade",
        bgm: { sceneMood: "battle", crossfadeSeconds: 2 },
        dialogues: [{ id: "dlg-1", text: "가자!", characterId: "char-1", startOffsetSeconds: 1 }],
      },
      {
        id: "cut-2",
        imageUrl: "https://example.com/2.png",
        altKo: "컷 2",
        altEn: "Cut 2",
        direction: { cameraMove: "static", durationSeconds: 4, intensity: 0.5 },
        transitionIn: "cut",
        bgm: { sceneMood: "daily", crossfadeSeconds: 2 },
        dialogues: [],
      },
    ],
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("MotionWebtoonPlayer", () => {
  it("빈 회차에서는 빈 상태 안내를 보여준다", () => {
    const empty: MotionEpisode = { ...makeEpisode(), cuts: [] };
    render(<MotionWebtoonPlayer episode={empty} />);
    expect(screen.queryByText("컷을 추가해 모션 웹툰을 만들어 보세요.")).toBeTruthy();
  });

  it("idle 상태에서는 스플래시와 핵심 액션(지금 재생하기) 하나를 보여준다", () => {
    render(<MotionWebtoonPlayer episode={makeEpisode()} />);
    expect(screen.queryByText("테스트 회차")).toBeTruthy();
    expect(screen.queryByText("▶ 지금 재생하기")).toBeTruthy();
    expect(screen.queryByText(/컷 2개/)).toBeTruthy();
  });

  it("재생 버튼 클릭 후에도 크래시 없이 렌더된다", () => {
    const { container } = render(<MotionWebtoonPlayer episode={makeEpisode()} />);
    const splashPlay = container.querySelector(".mw-play-big") as HTMLButtonElement;
    expect(splashPlay).toBeTruthy();
    fireEvent.click(splashPlay);
    expect(container.querySelector(".mw-stage")).toBeTruthy();
  });

  it("BGM·음성 토글과 공유 버튼이 노출된다", () => {
    const onBgm = vi.fn();
    const onVoice = vi.fn();
    render(
      <MotionWebtoonPlayer episode={makeEpisode()} onBgmEnabledChange={onBgm} onVoiceEnabledChange={onVoice} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /BGM 끄기/ }));
    expect(onBgm).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole("button", { name: /음성 끄기/ }));
    expect(onVoice).toHaveBeenCalledWith(false);
    expect(screen.queryByRole("button", { name: "공유 링크 복사" })).toBeTruthy();
  });

  it("컷 도트로 컷을 점프할 수 있다", () => {
    render(<MotionWebtoonPlayer episode={makeEpisode()} />);
    const dots = screen.getAllByRole("tab");
    expect(dots).toHaveLength(2);
    fireEvent.click(dots[1]!);
    expect(dots[1]!.getAttribute("aria-selected")).toBe("true");
  });

  it("reduced-motion에서는 카메라 애니메이션 클래스가 static이다", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string) =>
        ({
          matches: query === "(prefers-reduced-motion: reduce)",
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    });
    const { container } = render(<MotionWebtoonPlayer episode={makeEpisode()} />);
    const splashPlay = container.querySelector(".mw-play-big") as HTMLButtonElement;
    fireEvent.click(splashPlay);
    expect(container.querySelector(".mw-cam-static")).toBeTruthy();
  });
});
