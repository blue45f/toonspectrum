import { describe, expect, it } from "vitest";

import {
  STUDIO_NPC_ROLE_EMOTES,
  STUDIO_NPC_CHATTER_MAX_GAP_MS,
  STUDIO_NPC_SPEECH_MIN_FRAMES,
  STUDIO_NPC_SPEECH_MS,
  StudioNpcChatterScheduler,
  studioNpcChatterLine,
  studioNpcChatterLines,
  studioNpcGreetingLine,
  type StudioNpcChatterActor,
} from "./studio-virtual-space-npc-chatter";
import type { StudioNpcRole } from "./studio-virtual-space-npc-director";

const ROLES: readonly StudioNpcRole[] = ["guide", "producer", "editor", "writer", "artist", "librarian", "cafe", "security", "host", "resident"];

const actor = (id: string, overrides: Partial<StudioNpcChatterActor> = {}): StudioNpcChatterActor => ({
  id, role: "cafe", point: { x: 100, y: 100 }, phase: "work", visible: true, greeting: false, ...overrides,
});

/** 말풍선(대사)과 말 대신 띄운 이모트를 시간 순으로 모은다. 이모트는 "npc:@emote"로 적는다. */
function run(scheduler: StudioNpcChatterScheduler, actors: readonly StudioNpcChatterActor[], until: number, options: { quiet?: boolean; reducedMotion?: boolean } = {}) {
  const spoken: string[] = [];
  for (let time = 0; time <= until; time += 100) {
    for (const bubble of scheduler.step({ time, actors, quiet: options.quiet ?? false, reducedMotion: options.reducedMotion ?? false })) {
      const key = `${bubble.npcId}:${bubble.text.ko}`;
      if (spoken.at(-1) !== key) spoken.push(key);
    }
    for (const response of scheduler.dueResponses(time)) spoken.push(`${response.npcId}:@${response.emote}`);
  }
  return spoken;
}

describe("NPC 말풍선 스케줄", () => {
  it("같은 시드·시각이면 같은 대사", () => {
    expect(studioNpcChatterLine("cafe", "seed-a", 3)).toEqual(studioNpcChatterLine("cafe", "seed-a", 3));
    const actors = [actor("npc-a"), actor("npc-b", { role: "host", point: { x: 400, y: 100 } })];
    expect(run(new StudioNpcChatterScheduler("seed-a"), actors, 60_000)).toEqual(run(new StudioNpcChatterScheduler("seed-a"), actors, 60_000));
    const lines = new Set(Array.from({ length: 40 }, (_, slot) => studioNpcChatterLine("cafe", "seed-a", slot).ko));
    expect(lines.size).toBeGreaterThan(1);
  });

  it("8~14초 간격으로 화면 안 NPC 한 명씩 말하고, 모션 줄이기는 빈도를 절반으로 줄인다", () => {
    const actors = [actor("npc-a"), actor("npc-b", { point: { x: 500, y: 100 } })];
    const normal = run(new StudioNpcChatterScheduler("gap"), actors, 120_000);
    const reduced = run(new StudioNpcChatterScheduler("gap"), actors, 120_000, { reducedMotion: true });
    expect(normal.length).toBeGreaterThanOrEqual(120_000 / STUDIO_NPC_CHATTER_MAX_GAP_MS - 1);
    expect(reduced.length).toBeLessThan(normal.length);
    expect(reduced.length).toBeGreaterThan(0);
    // 화면 밖 NPC는 말하지 않는다.
    expect(run(new StudioNpcChatterScheduler("gap"), [actor("hidden", { visible: false })], 60_000)).toEqual([]);
  });

  it("focus 분위기에서는 말풍선 없음", () => {
    const scheduler = new StudioNpcChatterScheduler("quiet");
    const actors = [actor("npc-a", { greeting: true, role: "guide" })];
    expect(run(scheduler, actors, 60_000, { quiet: true })).toEqual([]);
    // 조용한 상태에서 돌아오면 다시 말한다.
    expect(run(scheduler, actors, 30_000).length).toBeGreaterThan(0);
  });

  it("대사 한국어 18자 이하·영문 병기", () => {
    for (const role of ROLES) {
      for (const text of [...studioNpcChatterLines(role), studioNpcGreetingLine(role)]) {
        expect([...text.ko].length, text.ko).toBeLessThanOrEqual(18);
        expect(/[가-힣]/u.test(text.ko)).toBe(true);
        expect(/^[A-Za-z]/u.test(text.en), text.en).toBe(true);
      }
    }
    const all = ROLES.flatMap((role) => studioNpcChatterLines(role).map((text) => text.ko));
    for (const phrase of ["어서오세요!", "커피 한잔 할까요?", "함께 만들어요!", "재밌는 이야기네요!", "멋진 공간이에요!"]) {
      expect(all).toContain(phrase);
    }
  });

  it("인사 단계의 안내 NPC는 '어서오세요!'를 한 번 말한다", () => {
    const scheduler = new StudioNpcChatterScheduler("greet");
    const guide = actor("guide", { role: "guide", greeting: true });
    const first = scheduler.step({ time: 0, actors: [guide], quiet: false, reducedMotion: false });
    expect(first.map((bubble) => bubble.text.ko)).toEqual(["어서오세요!"]);
    expect(first[0]?.until).toBe(STUDIO_NPC_SPEECH_MS);
    // 느린 기기: 만료 뒤에도 최소 프레임 수만큼은 보인 뒤 사라진다.
    const frames = Array.from({ length: 5 }, (_, index) =>
      scheduler.step({ time: STUDIO_NPC_SPEECH_MS + 10 + index, actors: [guide], quiet: false, reducedMotion: false }).length);
    expect(frames.slice(0, STUDIO_NPC_SPEECH_MIN_FRAMES - 1).every((count) => count === 1)).toBe(true);
    expect(frames.at(-1)).toBe(0);
  });

  it("쉬는 중 70px 안의 NPC 두 명은 번갈아 두 줄로 대화한다", () => {
    const scheduler = new StudioNpcChatterScheduler("talk");
    const actors = [actor("a", { phase: "rest" }), actor("b", { phase: "rest", point: { x: 150, y: 120 } })];
    const spoken = run(scheduler, actors, 20_000).filter((entry) => !entry.includes(":@"));
    expect(spoken.length).toBeGreaterThanOrEqual(2);
    const speakers = spoken.slice(0, 2).map((entry) => entry.split(":")[0]);
    expect(new Set(speakers).size).toBe(2);
  });

  it("플레이어 wave에 근처 NPC가 wave로 반응 예약", () => {
    const scheduler = new StudioNpcChatterScheduler("react");
    const near = actor("near", { point: { x: 120, y: 100 } });
    const far = actor("far", { point: { x: 600, y: 100 } });
    const scheduled = scheduler.reactToPlayerEmote("wave", 1_000, { x: 100, y: 100 }, [near, far], false);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]).toMatchObject({ npcId: "near", emote: "wave" });
    expect(scheduled[0]?.at).toBeGreaterThanOrEqual(1_400);
    expect(scheduled[0]?.at).toBeLessThanOrEqual(1_900);
    expect(scheduler.dueResponses(1_300)).toEqual([]);
    expect(scheduler.dueResponses(2_000)).toEqual(scheduled);
    expect(scheduler.dueResponses(2_100)).toEqual([]);
    expect(scheduler.reactToPlayerEmote("dance", 3_000, { x: 100, y: 100 }, [near], false)[0]?.emote).toBe("clap");
    expect(scheduler.reactToPlayerEmote("laugh", 3_000, { x: 100, y: 100 }, [near], false)[0]?.emote).toBe("laugh");
    expect(scheduler.reactToPlayerEmote("heart", 3_000, { x: 100, y: 100 }, [near], true)).toEqual([]);
    expect(scheduler.reactToPlayerEmote("sleep", 3_000, { x: 100, y: 100 }, [near], false)).toEqual([]);
  });

  it("세 번 중 한 번쯤은 말 대신 역할에 맞는 이모트를 띄우고, 짧은 대화 뒤에는 먼저 말한 NPC가 웃는다", () => {
    const scheduler = new StudioNpcChatterScheduler("moods");
    const actors = [actor("cafe-npc", { role: "cafe" })];
    const emotes: string[] = [];
    for (let time = 0; time <= 180_000; time += 100) {
      scheduler.step({ time, actors, quiet: false, reducedMotion: false });
      for (const response of scheduler.dueResponses(time)) emotes.push(response.emote);
    }
    expect(emotes.length).toBeGreaterThan(0);
    expect(new Set(emotes)).toEqual(new Set([STUDIO_NPC_ROLE_EMOTES.cafe]));

    const talk = new StudioNpcChatterScheduler("talk");
    const pair = [actor("a", { phase: "rest" }), actor("b", { phase: "rest", point: { x: 150, y: 120 } })];
    const laughs: string[] = [];
    for (let time = 0; time <= 20_000; time += 100) {
      talk.step({ time, actors: pair, quiet: false, reducedMotion: false });
      for (const response of talk.dueResponses(time)) laughs.push(`${response.npcId}:${response.emote}`);
    }
    expect(laughs.some((entry) => entry.endsWith(":laugh"))).toBe(true);
  });
});
