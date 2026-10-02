/**
 * 컷츠 리워드 펀드 테스트 — 유효 조회 가드·리믹스 배분·풀 정산 검증.
 */

import { describe, expect, it } from "vitest";

import { buildCutsClip } from "./cuts-clip-builder";
import { buildRemixClip } from "./cuts-remix";
import {
  countQualifiedViews,
  createLocalCutsRewardsApi,
  formatKrw,
  formatSharePercent,
  isWithinPeriod,
  monthlyRewardPeriod,
  rewardPeriodIdForDate,
  selectRecipientSettlement,
  settleRewardPeriod,
  type CutsViewEvent,
  type RewardPeriod,
} from "./cuts-rewards";
import { DEMO_EPISODES } from "./cuts-seed";
import type { CutsClip } from "./cuts-types";

const NOW = new Date("2026-10-02T05:00:00.000Z");
const PERIOD: RewardPeriod = monthlyRewardPeriod(2026, 9, 1_000_000, NOW);

function baseClip(): CutsClip {
  const clip = buildCutsClip(DEMO_EPISODES[0], "seed");
  if (!clip) throw new Error("시드 클립 생성 실패");
  return clip;
}

function clipWith(overrides: Partial<CutsClip>): CutsClip {
  return { ...baseClip(), ...overrides };
}

function viewEvent(
  clipId: string,
  viewerKey: string,
  watchedMs: number,
  viewedAt: string,
  durationMs = 10_000,
): CutsViewEvent {
  return { clipId, viewerKey, watchedMs, durationMs, viewedAt };
}

/** 전부 유효한 조회 이벤트 n개 (서로 다른 시청자). */
function qualifiedEvents(clipId: string, count: number, day = "2026-09-10"): CutsViewEvent[] {
  return Array.from({ length: count }, (_, index) =>
    viewEvent(clipId, `viewer-${index}`, 9_000, `${day}T0${index % 10}:00:00.000Z`),
  );
}

describe("기간", () => {
  it("날짜에서 월 기간 ID를 만든다", () => {
    expect(rewardPeriodIdForDate(new Date("2026-10-02T00:00:00Z"))).toBe("2026-10");
    expect(rewardPeriodIdForDate(new Date("2026-01-31T23:59:59Z"))).toBe("2026-01");
  });

  it("진행 중인 달은 open, 지난 달은 closed다", () => {
    expect(monthlyRewardPeriod(2026, 10, 100, NOW).status).toBe("open");
    expect(monthlyRewardPeriod(2026, 9, 100, NOW).status).toBe("closed");
    expect(PERIOD.startsAt).toBe("2026-09-01T00:00:00.000Z");
    expect(PERIOD.endsAt).toBe("2026-10-01T00:00:00.000Z");
  });

  it("기간 경계는 시작 포함·끝 제외다", () => {
    expect(isWithinPeriod("2026-09-01T00:00:00.000Z", PERIOD)).toBe(true);
    expect(isWithinPeriod("2026-09-30T23:59:59.999Z", PERIOD)).toBe(true);
    expect(isWithinPeriod("2026-10-01T00:00:00.000Z", PERIOD)).toBe(false);
    expect(isWithinPeriod("2026-08-31T23:59:59.999Z", PERIOD)).toBe(false);
  });
});

describe("유효 조회 가드", () => {
  const clip = clipWith({ id: "clip-a" });

  it("절반 미만만 본 조회는 세지 않는다", () => {
    const events = [
      viewEvent(clip.id, "v1", 4_999, "2026-09-10T00:00:00.000Z"),
      viewEvent(clip.id, "v2", 5_000, "2026-09-10T01:00:00.000Z"),
    ];
    expect(countQualifiedViews(events, [clip], PERIOD).get(clip.id)).toBe(1);
  });

  it("같은 시청자가 같은 날 같은 클립을 반복해서 봐도 1회만 센다", () => {
    const events = [
      viewEvent(clip.id, "v1", 9_000, "2026-09-10T00:00:00.000Z"),
      viewEvent(clip.id, "v1", 9_000, "2026-09-10T05:00:00.000Z"),
      viewEvent(clip.id, "v1", 9_000, "2026-09-11T00:00:00.000Z"),
    ];
    expect(countQualifiedViews(events, [clip], PERIOD).get(clip.id)).toBe(2);
  });

  it("한 시청자의 하루 유효 조회는 100회를 넘지 않는다", () => {
    const clips = Array.from({ length: 105 }, (_, index) =>
      clipWith({ id: `clip-${index}` }),
    );
    const events = clips.map((target) =>
      viewEvent(target.id, "farmer", 9_000, "2026-09-10T00:00:00.000Z"),
    );
    const counts = countQualifiedViews(events, clips, PERIOD);
    const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
    expect(total).toBe(100);
  });

  it("기간 밖·미등록 클립·길이 0 이벤트는 버린다", () => {
    const events = [
      viewEvent(clip.id, "v1", 9_000, "2026-08-15T00:00:00.000Z"),
      viewEvent("ghost-clip", "v1", 9_000, "2026-09-10T00:00:00.000Z"),
      viewEvent(clip.id, "v1", 9_000, "2026-09-10T00:00:00.000Z", 0),
    ];
    expect(countQualifiedViews(events, [clip], PERIOD).size).toBe(0);
  });
});

describe("정산 배분", () => {
  it("풀을 유효 조회 비율로 나누고 합이 풀과 정확히 같다", () => {
    const clipA = clipWith({ id: "clip-a", author: "작가A" });
    const clipB = clipWith({ id: "clip-b", author: "작가B" });
    const events = [...qualifiedEvents(clipA.id, 60), ...qualifiedEvents(clipB.id, 40)];
    const settlement = settleRewardPeriod(PERIOD, [clipA, clipB], events);
    expect(settlement.totalQualifiedViews).toBe(100);
    expect(selectRecipientSettlement(settlement, "author:작가A")?.amountKrw).toBe(600_000);
    expect(selectRecipientSettlement(settlement, "author:작가B")?.amountKrw).toBe(400_000);
    expect(settlement.unallocatedKrw).toBe(0);
  });

  it("원 단위 잔돈은 소수부가 큰 쪽부터 채워 합을 맞춘다", () => {
    const period: RewardPeriod = { ...PERIOD, poolKrw: 100 };
    const clips = ["작가A", "작가B", "작가C"].map((author, index) =>
      clipWith({ id: `clip-${index}`, author }),
    );
    const events = clips.flatMap((clip) => qualifiedEvents(clip.id, 1));
    const settlement = settleRewardPeriod(period, clips, events);
    const amounts = settlement.entries.map((entry) => entry.amountKrw).sort((a, b) => b - a);
    expect(amounts).toEqual([34, 33, 33]);
    expect(settlement.unallocatedKrw).toBe(0);
  });

  it("유효 조회가 없으면 전액 미배분으로 남는다", () => {
    const settlement = settleRewardPeriod(PERIOD, [clipWith({ id: "clip-a" })], []);
    expect(settlement.entries).toEqual([]);
    expect(settlement.unallocatedKrw).toBe(PERIOD.poolKrw);
  });

  it("팬 리믹스 조회는 원작자 30%·팬 70%로 갈린다", () => {
    const episode = DEMO_EPISODES[1];
    const original = buildCutsClip(episode, "seed");
    const remix = original ? buildRemixClip(episode, "fan-1", original.id) : null;
    if (!original || !remix) throw new Error("리믹스 클립 생성 실패");
    const events = qualifiedEvents(remix.id, 100);
    const settlement = settleRewardPeriod(PERIOD, [original, remix], events);
    const authorEntry = selectRecipientSettlement(settlement, `author:${episode.author}`);
    const fanEntry = selectRecipientSettlement(settlement, "creator:fan-1");
    expect(authorEntry?.amountKrw).toBe(300_000);
    expect(authorEntry?.clips[0].role).toBe("remix-original");
    expect(fanEntry?.amountKrw).toBe(700_000);
    expect(fanEntry?.clips[0].role).toBe("remix-creator");
    expect(settlement.unallocatedKrw).toBe(0);
  });

  it("클립별 내역 금액의 합은 수령자 금액과 같다", () => {
    const clipA = clipWith({ id: "clip-a", author: "작가A", title: "작품1" });
    const clipB = clipWith({ id: "clip-b", author: "작가A", title: "작품2" });
    const events = [...qualifiedEvents(clipA.id, 7), ...qualifiedEvents(clipB.id, 3)];
    const settlement = settleRewardPeriod(PERIOD, [clipA, clipB], events);
    const entry = selectRecipientSettlement(settlement, "author:작가A");
    expect(entry?.amountKrw).toBe(1_000_000);
    expect(entry?.clips.reduce((sum, row) => sum + row.amountKrw, 0)).toBe(entry?.amountKrw);
    expect(entry?.clips.map((row) => row.qualifiedViews)).toEqual([7, 3]);
  });
});

describe("포맷", () => {
  it("금액은 천 단위 콤마와 원 표기로 나온다", () => {
    expect(formatKrw(1_234_000)).toBe("1,234,000원");
    expect(formatKrw(0)).toBe("0원");
    expect(formatKrw(Number.NaN)).toBe("0원");
  });

  it("비율은 소수 1자리 퍼센트다", () => {
    expect(formatSharePercent(0.5)).toBe("50%");
    expect(formatSharePercent(0.123)).toBe("12.3%");
    expect(formatSharePercent(0)).toBe("0%");
  });
});

describe("로컬 정산 어댑터", () => {
  it("이번 달(open)과 지난달(closed) 두 기간을 돌려준다", async () => {
    const api = createLocalCutsRewardsApi({ clips: [baseClip()], userEvents: [], now: NOW });
    const periods = await api.listPeriods();
    expect(periods.map((period) => period.id)).toEqual(["2026-10", "2026-09"]);
    expect(periods[0].status).toBe("open");
    expect(periods[1].status).toBe("closed");
  });

  it("데모 원장만으로도 정산이 계산되고 배분 합이 풀과 같다", async () => {
    const clips = DEMO_EPISODES.map((episode) => buildCutsClip(episode, "seed")).filter(
      (clip): clip is CutsClip => clip !== null,
    );
    const api = createLocalCutsRewardsApi({ clips, userEvents: [], now: NOW });
    const settlement = await api.getSettlement("2026-10");
    expect(settlement.totalQualifiedViews).toBeGreaterThan(0);
    const allocated = settlement.entries.reduce((sum, entry) => sum + entry.amountKrw, 0);
    expect(allocated + settlement.unallocatedKrw).toBe(settlement.period.poolKrw);
  });

  it("모르는 기간은 오류를 던진다 (페이지 오류 상태용)", async () => {
    const api = createLocalCutsRewardsApi({ clips: [], userEvents: [], now: NOW });
    await expect(api.getSettlement("1999-01")).rejects.toThrow();
  });
});
