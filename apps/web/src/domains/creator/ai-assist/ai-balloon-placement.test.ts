import { describe, expect, it } from "vitest";

import {
  estimateBalloonSize,
  guessBalloonKind,
  recommendBalloonPlacement,
} from "./ai-balloon-placement";

describe("estimateBalloonSize", () => {
  it("긴 대사는 더 큰 말풍선이 된다", () => {
    const short = estimateBalloonSize("안녕", "speech");
    const long = estimateBalloonSize("안녕하세요 반갑습니다 오늘 날씨가 정말 좋네요", "speech");
    expect(long.width).toBeGreaterThanOrEqual(short.width);
    expect(long.height).toBeGreaterThanOrEqual(short.height);
  });

  it("외침은 크게, 속삭임은 작게", () => {
    const base = estimateBalloonSize("안녕하세요", "speech");
    const shout = estimateBalloonSize("안녕하세요", "shout");
    const whisper = estimateBalloonSize("안녕하세요", "whisper");
    expect(shout.width).toBeGreaterThan(base.width);
    expect(whisper.width).toBeLessThan(base.width);
  });
});

describe("recommendBalloonPlacement", () => {
  const base = {
    text: "안녕하세요",
    speaker: { x: 400, y: 400 },
    canvasWidth: 800,
    canvasHeight: 600,
    existing: [],
    kind: "speech" as const,
  };

  it("화자 위에 배치된다", () => {
    const placement = recommendBalloonPlacement(base);
    // 말풍선 하단이 화자 머리보다 위에 있어야 함
    expect(placement.y + placement.height).toBeLessThan(base.speaker.y);
  });

  it("캔버스 경계를 벗어나지 않는다", () => {
    const placement = recommendBalloonPlacement({
      ...base,
      speaker: { x: 10, y: 10 },
    });
    expect(placement.x).toBeGreaterThanOrEqual(8);
    expect(placement.y).toBeGreaterThanOrEqual(8);
    expect(placement.x + placement.width).toBeLessThanOrEqual(800 - 8 + 1);
  });

  it("기존 말풍선과 겹치지 않게 배치된다", () => {
    const first = recommendBalloonPlacement(base);
    const second = recommendBalloonPlacement({
      ...base,
      existing: [first],
    });
    // 두 말풍선이 겹치지 않아야 함 (12px 패딩 고려)
    const overlap =
      second.x < first.x + first.width + 12 &&
      second.x + second.width > first.x - 12 &&
      second.y < first.y + first.height + 12 &&
      second.y + second.height > first.y - 12;
    expect(overlap).toBe(false);
  });

  it("꼬리가 화자를 향한다", () => {
    const placement = recommendBalloonPlacement(base);
    expect(placement.tailTip.x).toBe(base.speaker.x);
    expect(placement.tailTip.y).toBe(base.speaker.y);
  });
});

describe("guessBalloonKind", () => {
  it("느낌표가 많으면 외침", () => {
    expect(guessBalloonKind("꺄아아악!!!")).toBe("shout");
  });

  it("말줄임표가 있으면 생각", () => {
    expect(guessBalloonKind("그게... 정말일까...")).toBe("thought");
  });

  it("속삭임 키워드가 있으면 속삭임", () => {
    expect(guessBalloonKind("조용히 말해줘")).toBe("whisper");
  });

  it("일반 대사는 speech", () => {
    expect(guessBalloonKind("오늘 뭐 먹지?")).toBe("speech");
  });
});
