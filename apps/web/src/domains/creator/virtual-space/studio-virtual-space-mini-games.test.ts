import { describe, expect, it } from "vitest";
import {
  answerStudioMiniGameRound,
  createStudioMiniGameRound,
  STUDIO_MINI_GAME_TRIGGER_ZONES,
  studioMiniGameInviteText,
  studioMiniGameZoneAt,
} from "./studio-virtual-space-mini-games";
import { STUDIO_TOWN_MINI_GAMES } from "./studio-virtual-space-town-program";

describe("미니게임 트리거 존", () => {
  it("6종의 미니게임 트리거 존이 모두 등록된다", () => {
    expect(STUDIO_MINI_GAME_TRIGGER_ZONES.length).toBe(STUDIO_TOWN_MINI_GAMES.length);
    const ids = new Set(STUDIO_MINI_GAME_TRIGGER_ZONES.map((zone) => zone.id));
    for (const game of STUDIO_TOWN_MINI_GAMES) {
      expect(ids.has(game.id)).toBe(true);
    }
  });

  it("존 내부 위치에서 게임 id를 찾는다", () => {
    const zone = studioMiniGameZoneAt({ x: 200, y: 500 });
    expect(zone?.id).toBe("panel-order");
  });

  it("존 밖에서는 null이다", () => {
    expect(studioMiniGameZoneAt({ x: 0, y: 0 })).toBeNull();
  });

  it("입장 초대 문구는 ko/en 쌍이다", () => {
    const game = STUDIO_TOWN_MINI_GAMES[0];
    const invite = studioMiniGameInviteText(game);
    expect(invite.ko).toContain(game.labelKo);
    expect(invite.en).toContain(game.labelEn);
  });
});

describe("미니게임 라운드", () => {
  it("라운드를 시작하고 정답을 판정한다", () => {
    const round = createStudioMiniGameRound("panel-order", "seed-1", 1000);
    expect(round.gameId).toBe("panel-order");
    const result = answerStudioMiniGameRound(round, round.correctIndex, round.startedAt + 5000);
    expect(result.correct).toBe(true);
    expect(result.score).toBeGreaterThan(0);
  });

  it("오답은 0점이다", () => {
    const round = createStudioMiniGameRound("palette-match", "seed-2", 1000);
    const wrong = (round.correctIndex + 1) % round.choices.length;
    const result = answerStudioMiniGameRound(round, wrong, round.startedAt + 1000);
    expect(result.correct).toBe(false);
    expect(result.score).toBe(0);
  });
});
