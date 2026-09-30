// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DialogueSpeakHandle } from "./motion-webtoon-dialogue-speaker";
import {
  type MotionBgmPort,
  type MotionClockPort,
  type MotionPlaybackDeps,
  type MotionSpeakerPort,
} from "./motion-webtoon-playback";
import type { MotionEpisode } from "./motion-webtoon-model";
import { useMotionWebtoonPlayer } from "./useMotionWebtoonPlayer";

function makeEpisode(): MotionEpisode {
  return {
    id: "ep-1",
    titleKo: "1화",
    titleEn: "Ep 1",
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
}

function makeFakeDeps(): MotionPlaybackDeps {
  const bgm: MotionBgmPort = { playMood: () => {}, stop: vi.fn() };
  const speaker: MotionSpeakerPort = {
    speak: () => {
      const handle = new DialogueSpeakHandle();
      handle.finish();
      return handle;
    },
    stop: vi.fn(),
  };
  const clock: MotionClockPort = {
    setTimeout: (callback) => {
      callback();
      return 1;
    },
    clearTimeout: () => {},
  };
  return { bgm, speaker, clock, voiceEnabled: () => true, bgmEnabled: () => true };
}

/** matchMedia 모킹 — change 이벤트를 수동으로 발화할 수 있다. */
function mockMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<() => void>();
  const query = {
    get matches() {
      return matches;
    },
    addEventListener: vi.fn((_type: string, listener: () => void) => {
      listeners.add(listener);
    }),
    removeEventListener: vi.fn((_type: string, listener: () => void) => {
      listeners.delete(listener);
    }),
  };
  const fireChange = (next: boolean): void => {
    matches = next;
    listeners.forEach((listener) => listener());
  };
  vi.stubGlobal("matchMedia", vi.fn(() => query));
  return { fireChange, query };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useMotionWebtoonPlayer", () => {
  it("matchMedia가 없으면 reducedMotion은 false", () => {
    vi.stubGlobal("matchMedia", undefined);
    const { result } = renderHook(() =>
      useMotionWebtoonPlayer({ episode: makeEpisode(), deps: makeFakeDeps() }),
    );
    expect(result.current.reducedMotion).toBe(false);
  });

  it("OS reduced-motion 변경을 재생 중에도 따라간다", () => {
    const { fireChange } = mockMatchMedia(false);
    const { result } = renderHook(() =>
      useMotionWebtoonPlayer({ episode: makeEpisode(), deps: makeFakeDeps() }),
    );
    expect(result.current.reducedMotion).toBe(false);
    act(() => {
      fireChange(true);
    });
    expect(result.current.reducedMotion).toBe(true);
    act(() => {
      fireChange(false);
    });
    expect(result.current.reducedMotion).toBe(false);
  });

  it("언마운트 시 matchMedia 리스너를 제거한다", () => {
    const { query } = mockMatchMedia(false);
    const { unmount } = renderHook(() =>
      useMotionWebtoonPlayer({ episode: makeEpisode(), deps: makeFakeDeps() }),
    );
    expect(query.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    unmount();
    expect(query.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
