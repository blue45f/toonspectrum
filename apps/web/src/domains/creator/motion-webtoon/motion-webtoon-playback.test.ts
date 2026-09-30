import { describe, expect, it, vi } from "vitest";

import {
  MotionPlaybackController,
  type MotionBgmPort,
  type MotionClockPort,
  type MotionPlaybackDeps,
  type MotionPlaybackEvent,
  type MotionSpeakerPort,
} from "./motion-webtoon-playback";
import { DialogueSpeakHandle, type DialogueSpeakRequest } from "./motion-webtoon-dialogue-speaker";
import type { BgmMood } from "@/shared/bgm/bgm-engine";
import type { MotionEpisode } from "./motion-webtoon-model";

/** 가짜 타이머 — 수동으로 시간을 흐르게 한다. */
function makeFakeClock() {
  let now = 0;
  let nextId = 1;
  const tasks = new Map<number, { at: number; callback: () => void }>();
  const clock: MotionClockPort = {
    setTimeout: (callback, ms) => {
      const id = nextId++;
      tasks.set(id, { at: now + ms, callback });
      return id;
    },
    clearTimeout: (id) => {
      tasks.delete(id);
    },
  };
  const advance = (ms: number) => {
    const target = now + ms;
    while (true) {
      let earliest: { id: number; at: number; callback: () => void } | null = null;
      for (const [id, task] of tasks) {
        if (task.at <= target && (!earliest || task.at < earliest.at)) {
          earliest = { id, ...task };
        }
      }
      if (!earliest) break;
      tasks.delete(earliest.id);
      now = earliest.at;
      earliest.callback();
    }
    now = target;
  };
  return { clock, advance, pendingCount: () => tasks.size };
}

function makeDeps(clock: MotionClockPort, overrides?: Partial<MotionPlaybackDeps>) {
  const moods: BgmMood[] = [];
  const spoken: DialogueSpeakRequest[] = [];
  const bgm: MotionBgmPort = {
    playMood: (mood) => {
      moods.push(mood);
    },
    stop: vi.fn(),
  };
  const speaker: MotionSpeakerPort = {
    speak: (request) => {
      spoken.push(request);
      const handle = new DialogueSpeakHandle();
      handle.finish();
      return handle;
    },
    stop: vi.fn(),
  };
  const deps: MotionPlaybackDeps = {
    bgm,
    speaker,
    clock,
    voiceEnabled: () => true,
    bgmEnabled: () => true,
    ...overrides,
  };
  return { deps, moods, spoken, bgm, speaker };
}

function makeEpisode(): MotionEpisode {
  return {
    id: "ep-1",
    titleKo: "1화",
    titleEn: "Ep 1",
    characters: [
      { id: "char-1", nameKo: "주인공", nameEn: "Hero", presetId: "narrator" },
    ],
    cuts: [
      {
        id: "cut-1",
        imageUrl: "https://example.com/1.png",
        altKo: "컷 1",
        altEn: "Cut 1",
        direction: { cameraMove: "zoom-in", durationSeconds: 6, intensity: 0.5 },
        transitionIn: "fade",
        bgm: { sceneMood: "battle", crossfadeSeconds: 2 },
        dialogues: [
          { id: "dlg-1", text: "가자!", characterId: "char-1", startOffsetSeconds: 1 },
        ],
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

describe("MotionPlaybackController", () => {
  it("play → 컷 진입 → BGM → 대사 → 다음 컷 순서로 진행된다", () => {
    const { clock, advance } = makeFakeClock();
    const { deps, moods, spoken } = makeDeps(clock);
    const events: MotionPlaybackEvent[] = [];
    const controller = new MotionPlaybackController(deps);
    controller.onEvent((e) => events.push(e));
    controller.load(makeEpisode());

    controller.play();
    expect(controller.playbackState).toBe("playing");
    expect(controller.currentCutIndex).toBe(0);
    // battle → virtual 매핑
    expect(moods).toEqual(["virtual"]);

    // 1초 후 대사 시작
    advance(1000);
    expect(spoken).toHaveLength(1);
    expect(spoken[0]?.text).toBe("가자!");
    expect(controller.activeDialogueLine?.id).toBe("dlg-1");

    // 6초 후 다음 컷
    advance(5000);
    expect(controller.currentCutIndex).toBe(1);
    expect(moods).toEqual(["virtual", "material"]);

    // 4초 후 종료
    advance(4000);
    expect(controller.playbackState).toBe("ended");
  });

  it("pause하면 타이머가 멈춘다", () => {
    const { clock, advance } = makeFakeClock();
    const { deps, spoken } = makeDeps(clock);
    const controller = new MotionPlaybackController(deps);
    controller.load(makeEpisode());
    controller.play();
    controller.pause();
    expect(controller.playbackState).toBe("paused");
    advance(20000);
    expect(spoken).toHaveLength(0);
    expect(controller.currentCutIndex).toBe(0);
  });

  it("stop하면 BGM·음성이 멈추고 idle로 돌아간다", () => {
    const { clock } = makeFakeClock();
    const { deps, bgm, speaker } = makeDeps(clock);
    const controller = new MotionPlaybackController(deps);
    controller.load(makeEpisode());
    controller.play();
    controller.stop();
    expect(controller.playbackState).toBe("idle");
    expect(bgm.stop).toHaveBeenCalled();
    expect(speaker.stop).toHaveBeenCalled();
  });

  it("BGM이 꺼져 있으면 playMood를 호출하지 않는다", () => {
    const { clock } = makeFakeClock();
    const { deps, moods } = makeDeps(clock, { bgmEnabled: () => false });
    const controller = new MotionPlaybackController(deps);
    controller.load(makeEpisode());
    controller.play();
    expect(moods).toHaveLength(0);
  });

  it("음성이 꺼져 있으면 대사를 발화하지 않는다", () => {
    const { clock, advance } = makeFakeClock();
    const { deps, spoken } = makeDeps(clock, { voiceEnabled: () => false });
    const controller = new MotionPlaybackController(deps);
    controller.load(makeEpisode());
    controller.play();
    advance(10000);
    expect(spoken).toHaveLength(0);
  });

  it("seekCut으로 컷을 점프한다", () => {
    const { clock } = makeFakeClock();
    const { deps } = makeDeps(clock);
    const controller = new MotionPlaybackController(deps);
    controller.load(makeEpisode());
    controller.play();
    controller.seekCut(1);
    expect(controller.currentCutIndex).toBe(1);
  });

  it("빈 회차에서는 play해도 아무 일도 일어나지 않는다", () => {
    const { clock } = makeFakeClock();
    const { deps } = makeDeps(clock);
    const controller = new MotionPlaybackController(deps);
    controller.load({ ...makeEpisode(), cuts: [] });
    controller.play();
    expect(controller.playbackState).toBe("idle");
  });
});
