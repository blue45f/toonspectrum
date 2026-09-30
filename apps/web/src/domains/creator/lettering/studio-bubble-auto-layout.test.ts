import { describe, it, expect } from "vitest";

import {
  autoLayoutBalloons,
  estimateBalloonSize,
  BUBBLE_AUTO_LAYOUT_MARGIN,
  BUBBLE_TAIL_CHANNEL_MIN_WIDTH,
  type AutoLayoutPanel,
} from "./studio-bubble-auto-layout";

const PANEL: AutoLayoutPanel = { x: 0, y: 0, w: 800, h: 1200 };

describe("estimateBalloonSize", () => {
  it("빈 텍스트도 최소 크기를 반환한다", () => {
    const s = estimateBalloonSize("", 24);
    expect(s.width).toBeGreaterThan(0);
    expect(s.height).toBeGreaterThan(0);
  });

  it("텍스트가 길수록 말풍선이 커진다", () => {
    const short = estimateBalloonSize("안녕", 24);
    const long = estimateBalloonSize(
      "안녕하세요 정말 반갑습니다 오늘 날씨가 정말 좋네요",
      24
    );
    expect(long.width * long.height).toBeGreaterThan(
      short.width * short.height
    );
  });

  it("폰트 크기가 크면 말풍선도 커진다", () => {
    const small = estimateBalloonSize("안녕하세요", 16);
    const big = estimateBalloonSize("안녕하세요", 32);
    expect(big.width).toBeGreaterThan(small.width);
  });
});

describe("autoLayoutBalloons — 기본 배치", () => {
  it("단일 말풍선을 패널 안에 배치한다", () => {
    const r = autoLayoutBalloons(
      [{ id: "b1", text: "안녕하세요" }],
      [],
      PANEL
    );
    expect(r.balloons).toHaveLength(1);
    expect(r.unplaced).toHaveLength(0);
    const b = r.balloons[0];
    expect(b.x).toBeGreaterThanOrEqual(PANEL.x);
    expect(b.y).toBeGreaterThanOrEqual(PANEL.y);
    expect(b.x + b.width).toBeLessThanOrEqual(PANEL.x + PANEL.w);
    expect(b.y + b.height).toBeLessThanOrEqual(PANEL.y + PANEL.h);
  });

  it("화자가 있으면 화자 근처에 배치한다", () => {
    const r = autoLayoutBalloons(
      [{ id: "b1", speakerId: "s1", text: "안녕" }],
      [
        {
          id: "s1",
          point: { x: 400, y: 900 },
          bounds: { x: 350, y: 800, w: 100, h: 200 },
        },
      ],
      PANEL
    );
    expect(r.balloons).toHaveLength(1);
    const b = r.balloons[0];
    // 화자 바운즈와 겹치지 않는다.
    expect(
      b.x < 450 && b.x + b.width > 350 && b.y < 1000 && b.y + b.height > 800
    ).toBe(false);
    // 꼬리 채널이 화자 x를 포함한다.
    expect(b.tailChannel.left).toBeLessThanOrEqual(400);
    expect(b.tailChannel.right).toBeGreaterThanOrEqual(400);
    expect(b.channelCoversSpeaker).toBe(true);
  });

  it("여러 말풍선이 서로 겹치지 않는다", () => {
    const r = autoLayoutBalloons(
      [
        { id: "b1", speakerId: "s1", text: "첫 번째 대사입니다", order: 0 },
        { id: "b2", speakerId: "s2", text: "두 번째 대사입니다", order: 1 },
        { id: "b3", speakerId: "s1", text: "세 번째 대사입니다", order: 2 },
      ],
      [
        {
          id: "s1",
          point: { x: 200, y: 900 },
          bounds: { x: 150, y: 800, w: 100, h: 200 },
        },
        {
          id: "s2",
          point: { x: 600, y: 900 },
          bounds: { x: 550, y: 800, w: 100, h: 200 },
        },
      ],
      PANEL
    );
    expect(r.balloons).toHaveLength(3);
    // 쌍별 겹침 검사.
    for (let i = 0; i < r.balloons.length; i++) {
      for (let j = i + 1; j < r.balloons.length; j++) {
        const a = r.balloons[i];
        const b = r.balloons[j];
        const overlap =
          a.x - BUBBLE_AUTO_LAYOUT_MARGIN < b.x + b.width &&
          a.x + a.width + BUBBLE_AUTO_LAYOUT_MARGIN > b.x &&
          a.y - BUBBLE_AUTO_LAYOUT_MARGIN < b.y + b.height &&
          a.y + a.height + BUBBLE_AUTO_LAYOUT_MARGIN > b.y;
        expect(overlap).toBe(false);
      }
    }
  });

  it("읽기 순서를 유지한다 (위→아래)", () => {
    const r = autoLayoutBalloons(
      [
        { id: "b1", text: "첫째", order: 0 },
        { id: "b2", text: "둘째", order: 1 },
      ],
      [],
      PANEL
    );
    expect(r.balloons).toHaveLength(2);
    expect(r.balloons[0].id).toBe("b1");
    expect(r.balloons[1].id).toBe("b2");
  });

  it("같은 시드로 결정적 결과를 낸다", () => {
    const req = [
      { id: "b1", speakerId: "s1", text: "안녕하세요 반갑습니다", order: 0 },
      { id: "b2", speakerId: "s2", text: "네 반갑습니다", order: 1 },
    ];
    const speakers = [
      {
        id: "s1",
        point: { x: 200, y: 900 },
        bounds: { x: 150, y: 800, w: 100, h: 200 },
      },
      {
        id: "s2",
        point: { x: 600, y: 900 },
        bounds: { x: 550, y: 800, w: 100, h: 200 },
      },
    ];
    const a = autoLayoutBalloons(req, speakers, PANEL, [], { seed: 42 });
    const b = autoLayoutBalloons(req, speakers, PANEL, [], { seed: 42 });
    expect(a).toEqual(b);
  });

  it("장애물을 피해서 배치한다", () => {
    const obstacle = { x: 300, y: 100, w: 200, h: 200 };
    const r = autoLayoutBalloons(
      [{ id: "b1", text: "안녕하세요" }],
      [],
      PANEL,
      [obstacle]
    );
    expect(r.balloons).toHaveLength(1);
    const b = r.balloons[0];
    const overlap =
      b.x - BUBBLE_AUTO_LAYOUT_MARGIN < obstacle.x + obstacle.w &&
      b.x + b.width + BUBBLE_AUTO_LAYOUT_MARGIN > obstacle.x &&
      b.y - BUBBLE_AUTO_LAYOUT_MARGIN < obstacle.y + obstacle.h &&
      b.y + b.height + BUBBLE_AUTO_LAYOUT_MARGIN > obstacle.y;
    expect(overlap).toBe(false);
  });

  it("꼬리 채널 최소 너비 상수를 노출한다", () => {
    expect(BUBBLE_TAIL_CHANNEL_MIN_WIDTH).toBeGreaterThan(0);
  });
});
