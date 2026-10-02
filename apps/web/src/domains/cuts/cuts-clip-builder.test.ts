/**
 * 컷츠 클립 빌더 테스트 — 회차 → 클립 변환 파이프라인 검증.
 */

import { describe, expect, it } from "vitest";

import {
  buildCutsClip,
  clipNarrationText,
  estimateShotDurationMs,
  formatClipDuration,
  kenBurnsForShot,
  shotIndexAt,
} from "./cuts-clip-builder";
import type { EpisodeSource } from "./cuts-types";

function episode(): EpisodeSource {
  return {
    titleId: "demo-title",
    title: "데모 작품",
    author: "데모 작가",
    episodeNumber: 1,
    episodeTitle: "첫 만남",
    panels: [
      {
        alt: "패널 1",
        caption: "이야기가 시작됐다.",
        narration: "[강조]이야기가 시작됐다.[/강조]",
      },
      {
        alt: "패널 2",
        caption: "두 사람이 만났다.",
        narration: "두 사람이 만났다. [쉼] 운명의 순간이었다.",
      },
    ],
  };
}

describe("buildCutsClip", () => {
  it("패널 수만큼 샷을 만들고 재생 시간을 누적한다", () => {
    const clip = buildCutsClip(episode(), "tester");
    expect(clip).not.toBeNull();
    expect(clip!.shots).toHaveLength(2);
    const total = clip!.shots.reduce((sum, shot) => sum + shot.durationMs, 0);
    expect(clip!.durationMs).toBe(total);
    // 샷 시작 오프셋이 연속으로 이어진다
    expect(clip!.shots[1].startMs).toBe(clip!.shots[0].durationMs);
  });

  it("패널이 없으면 null을 반환한다", () => {
    const empty = episode();
    expect(buildCutsClip({ ...empty, panels: [] }, "tester")).toBeNull();
  });

  it("maxShots를 초과하는 패널은 잘라낸다", () => {
    const clip = buildCutsClip(episode(), "tester", { maxShots: 1 });
    expect(clip!.shots).toHaveLength(1);
  });

  it("내레이션 세그먼트·순수 텍스트·SSML을 함께 만든다", () => {
    const clip = buildCutsClip(episode(), "tester");
    const shot = clip!.shots[0];
    expect(shot.narrationSegments.length).toBeGreaterThan(0);
    // 감정 마크업이 제거된 순수 텍스트
    expect(shot.narrationPlain).toContain("이야기가 시작됐다.");
    expect(shot.narrationPlain).not.toContain("[강조]");
    expect(clip!.narrationSsml).toMatch(/^<speak/);
    expect(clip!.narrationSsml).toContain("</speak>");
  });

  it("클립 ID에 작품·회차 정보가 들어간다", () => {
    const clip = buildCutsClip(episode(), "tester");
    expect(clip!.id).toContain("demo-title");
    expect(clip!.id).toContain("ep1");
  });

  it("이미지 없는 패널은 프로시저럴 아트로 채운다", () => {
    const clip = buildCutsClip(episode(), "tester");
    expect(clip!.shots[0].imageUrl.startsWith("data:image/svg+xml")).toBe(true);
    expect(clip!.thumbnailUrl).toBe(clip!.shots[0].imageUrl);
  });

  it("이미지가 있는 패널은 원본 URL을 유지한다", () => {
    const withImage = episode();
    const panels = [{ ...withImage.panels[0], imageUrl: "https://example.com/panel1.png" }];
    const clip = buildCutsClip({ ...withImage, panels }, "tester");
    expect(clip!.shots[0].imageUrl).toBe("https://example.com/panel1.png");
  });
});

describe("kenBurnsForShot", () => {
  it("연속된 샷의 이동 방향이 번갈아 나온다", () => {
    const directions = [0, 1, 2, 3, 4].map((index) => kenBurnsForShot(index).direction);
    expect(new Set(directions).size).toBe(5);
  });

  it("같은 인덱스는 항상 같은 이동을 반환한다", () => {
    expect(kenBurnsForShot(7)).toEqual(kenBurnsForShot(2));
  });
});

describe("estimateShotDurationMs", () => {
  it("빈 내레이션도 최소 재생 시간을 보장한다", () => {
    expect(estimateShotDurationMs("", 2800, 6000)).toBe(2800);
  });

  it("긴 내레이션은 최대 재생 시간을 넘지 않는다", () => {
    expect(estimateShotDurationMs("가".repeat(500), 2800, 6000)).toBe(6000);
  });

  it("텍스트가 길수록 재생 시간이 늘어난다", () => {
    const short = estimateShotDurationMs("짧다", 2800, 6000);
    const long = estimateShotDurationMs("이것은 꽤 긴 내레이션 문장이다", 2800, 6000);
    expect(long).toBeGreaterThan(short);
  });
});

describe("clipNarrationText", () => {
  it("샷 내레이션을 순서대로 합친다", () => {
    const clip = buildCutsClip(episode(), "tester")!;
    const text = clipNarrationText(clip);
    expect(text).toContain("이야기가 시작됐다.");
    expect(text).toContain("두 사람이 만났다.");
  });
});

describe("shotIndexAt", () => {
  it("재생 위치에 맞는 샷 인덱스를 반환한다", () => {
    const clip = buildCutsClip(episode(), "tester")!;
    expect(shotIndexAt(clip, 0)).toBe(0);
    expect(shotIndexAt(clip, clip.shots[0].durationMs - 1)).toBe(0);
    expect(shotIndexAt(clip, clip.shots[1].startMs)).toBe(1);
    expect(shotIndexAt(clip, clip.durationMs + 9999)).toBe(1);
  });
});

describe("formatClipDuration", () => {
  it("초 단위를 m:ss 형태로 표기한다", () => {
    expect(formatClipDuration(24000)).toBe("0:24");
    expect(formatClipDuration(90000)).toBe("1:30");
    expect(formatClipDuration(0)).toBe("0:00");
  });
});
