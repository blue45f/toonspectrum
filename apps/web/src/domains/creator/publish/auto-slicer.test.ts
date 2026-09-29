import { describe, it, expect } from "vitest";

import {
  autoOptimizeEpisodeImage,
  computePublishTargetSize,
  encodeCanvasFittingSize,
  planPublishSliceBoxes,
  publishMimeType,
  publishQualityLadder,
  publishSliceFileName,
  resolvePublishFormat,
} from "./auto-slicer";
import { findPublishSpecPreset } from "./spec-validator";

const MB = 1024 * 1024;
const canvasPreset = findPublishSpecPreset("canvas");

class FakeCanvas2DContext {
  fillStyle = "#ffffff";
  imageSmoothingEnabled = true;
  imageSmoothingQuality: ImageSmoothingQuality = "high";
  drawImage(..._args: unknown[]): void {
    // 합성 호출 기록용 — 실제 그리기는 하지 않는다.
  }
  fillRect(..._args: unknown[]): void {
    // noop
  }
}

class FakeCanvas {
  width: number;
  height: number;
  readonly contexts: FakeCanvas2DContext[] = [];
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  getContext(): FakeCanvas2DContext {
    const context = new FakeCanvas2DContext();
    this.contexts.push(context);
    return context;
  }
}

const asCanvas = (fake: FakeCanvas): HTMLCanvasElement =>
  fake as unknown as HTMLCanvasElement;

function blobOf(bytes: number): Blob {
  return new Blob([new Uint8Array(bytes)]);
}

describe("planPublishSliceBoxes", () => {
  it("1280 단위로 자르고 마지막은 남은 높이", () => {
    expect(planPublishSliceBoxes(3000, 1280)).toEqual([
      { index: 0, y: 0, height: 1280 },
      { index: 1, y: 1280, height: 1280 },
      { index: 2, y: 2560, height: 440 },
    ]);
  });

  it("정확히 나누어떨어지면 나머지가 없다", () => {
    expect(planPublishSliceBoxes(2560, 1280)).toEqual([
      { index: 0, y: 0, height: 1280 },
      { index: 1, y: 1280, height: 1280 },
    ]);
  });

  it("짧은 스트립은 한 장", () => {
    expect(planPublishSliceBoxes(800, 1280)).toEqual([{ index: 0, y: 0, height: 800 }]);
  });

  it("0 이하 입력은 빈 목록", () => {
    expect(planPublishSliceBoxes(0, 1280)).toEqual([]);
    expect(planPublishSliceBoxes(1000, 0)).toEqual([]);
    expect(planPublishSliceBoxes(-10, 1280)).toEqual([]);
  });
});

describe("computePublishTargetSize", () => {
  it("규격보다 넓으면 비율 유지 축소", () => {
    expect(computePublishTargetSize(1600, 3200, 800)).toEqual({ width: 800, height: 1600 });
  });

  it("규격보다 좁으면 확대하지 않는다", () => {
    expect(computePublishTargetSize(400, 900, 800)).toEqual({ width: 400, height: 900 });
  });

  it("딱 맞으면 그대로", () => {
    expect(computePublishTargetSize(800, 1280, 800)).toEqual({ width: 800, height: 1280 });
  });

  it("읽을 수 없는 크기는 0을 돌려준다", () => {
    expect(computePublishTargetSize(0, 100, 800)).toEqual({ width: 0, height: 0 });
  });
});

describe("publishQualityLadder", () => {
  it("0.92에서 시작해 내림차순, 하한 포함", () => {
    const ladder = publishQualityLadder();
    expect(ladder[0]).toBe(0.92);
    expect(ladder[ladder.length - 1]).toBe(0.6);
    const sorted = [...ladder].sort((a, b) => b - a);
    expect(ladder).toEqual(sorted);
  });

  it("사용자 하한을 반영한다", () => {
    const ladder = publishQualityLadder(0.7);
    expect(ladder[ladder.length - 1]).toBe(0.7);
    expect(ladder.every((quality) => quality >= 0.7)).toBe(true);
  });
});

describe("publishSliceFileName", () => {
  it("여러 장이면 slice 접미사", () => {
    expect(publishSliceFileName("내 작품", "canvas", 0, 3, "jpg")).toBe(
      "내 작품-canvas-slice1of3.jpg"
    );
    expect(publishSliceFileName("내 작품", "canvas", 2, 3, "jpg")).toBe(
      "내 작품-canvas-slice3of3.jpg"
    );
  });

  it("한 장이면 접미사 없음", () => {
    expect(publishSliceFileName("내 작품", "canvas", 0, 1, "jpg")).toBe("내 작품-canvas.jpg");
  });

  it("빈 제목은 기본 파일명", () => {
    expect(publishSliceFileName("   ", "canvas", 0, 1, "jpg")).toBe("toonstudio-episode-canvas.jpg");
  });
});

describe("resolvePublishFormat / publishMimeType", () => {
  it("허용 포맷이면 유지, 아니면 권장 포맷", () => {
    expect(resolvePublishFormat(canvasPreset, "jpg")).toBe("jpg");
    expect(resolvePublishFormat(canvasPreset, "png")).toBe("png");
    expect(resolvePublishFormat(canvasPreset, "webp")).toBe("jpg");
    expect(resolvePublishFormat(canvasPreset, undefined)).toBe("jpg");
  });

  it("mime 매핑", () => {
    expect(publishMimeType("jpg")).toBe("image/jpeg");
    expect(publishMimeType("png")).toBe("image/png");
    expect(publishMimeType("webp")).toBe("image/webp");
  });
});

describe("encodeCanvasFittingSize", () => {
  it("한도 안이면 첫 품질 그대로", async () => {
    const seen: number[] = [];
    const { blob, quality } = await encodeCanvasFittingSize(
      asCanvas(new FakeCanvas(800, 1280)),
      "jpg",
      2 * MB,
      async (_canvas, _mime, q) => {
        seen.push(q ?? -1);
        return blobOf(Math.round(1 * MB));
      }
    );
    expect(blob.size).toBe(MB);
    expect(quality).toBe(0.92);
    expect(seen).toEqual([0.92]);
  });

  it("한도를 넘으면 품질을 낮춰가며 재인코딩", async () => {
    const seen: number[] = [];
    const { blob, quality } = await encodeCanvasFittingSize(
      asCanvas(new FakeCanvas(800, 1280)),
      "jpg",
      2 * MB,
      async (_canvas, _mime, q) => {
        const value = q ?? 0.92;
        seen.push(value);
        // 품질에 비례하는 가짜 용량 — 0.76에서 2MB 아래로 떨어진다
        return blobOf(Math.round(value * 2.5 * MB));
      }
    );
    expect(blob.size).toBeLessThanOrEqual(2 * MB);
    expect(quality).toBe(0.76);
    expect(seen).toEqual([0.92, 0.84, 0.76]);
  });

  it("계단을 다 타도 넘치면 oversized 결과(가장 작은 것)를 돌려준다", async () => {
    const { blob, quality } = await encodeCanvasFittingSize(
      asCanvas(new FakeCanvas(800, 1280)),
      "jpg",
      2 * MB,
      async () => blobOf(Math.round(5 * MB))
    );
    expect(blob.size).toBe(Math.round(5 * MB));
    expect(quality).toBe(0.6);
  });

  it("PNG는 품질 없이 한 번만 인코딩", async () => {
    let calls = 0;
    const { blob, quality } = await encodeCanvasFittingSize(
      asCanvas(new FakeCanvas(800, 1280)),
      "png",
      2 * MB,
      async (_canvas, _mime, q) => {
        calls += 1;
        expect(q).toBeUndefined();
        return blobOf(Math.round(5 * MB));
      }
    );
    expect(calls).toBe(1);
    expect(quality).toBeNull();
    expect(blob.size).toBe(Math.round(5 * MB));
  });
});

describe("autoOptimizeEpisodeImage", () => {
  it("리사이즈 → 슬라이싱 → 용량 맞춤 전체 파이프라인", async () => {
    const created: Array<{ width: number; height: number }> = [];
    const result = await autoOptimizeEpisodeImage(asCanvas(new FakeCanvas(1600, 3200)), canvasPreset, {
      title: "내 작품",
      createCanvas: (width, height) => {
        created.push({ width, height });
        return asCanvas(new FakeCanvas(width, height));
      },
      encode: async () => blobOf(Math.round(1.2 * MB)),
    });

    // 1600×3200 → 800×1600 리사이즈 후 1280 단위로 2장
    expect(result.slices.length).toBe(2);
    expect(result.oversized).toBe(0);
    expect(created[0]).toEqual({ width: 800, height: 1600 });
    expect(result.slices[0]).toMatchObject({
      width: 800,
      height: 1280,
      quality: 0.92,
      filename: "내 작품-canvas-slice1of2.jpg",
    });
    expect(result.slices[1]).toMatchObject({
      width: 800,
      height: 320,
      filename: "내 작품-canvas-slice2of2.jpg",
    });
    expect(result.slices[0]?.bytes).toBe(Math.round(1.2 * MB));
  });

  it("짧은 원본은 한 장으로", async () => {
    const result = await autoOptimizeEpisodeImage(asCanvas(new FakeCanvas(800, 1000)), canvasPreset, {
      title: "짧은",
      createCanvas: (width, height) => asCanvas(new FakeCanvas(width, height)),
      encode: async () => blobOf(500 * 1024),
    });
    expect(result.slices.length).toBe(1);
    expect(result.slices[0]?.filename).toBe("짧은-canvas.jpg");
  });

  it("용량을 맞추지 못하면 oversized로 집계", async () => {
    const result = await autoOptimizeEpisodeImage(asCanvas(new FakeCanvas(800, 1000)), canvasPreset, {
      title: "무거움",
      createCanvas: (width, height) => asCanvas(new FakeCanvas(width, height)),
      encode: async () => blobOf(Math.round(3 * MB)),
    });
    expect(result.slices.length).toBe(1);
    expect(result.oversized).toBe(1);
  });

  it("진행 콜백이 슬라이스마다 호출된다", async () => {
    const progress: Array<[number, number]> = [];
    await autoOptimizeEpisodeImage(asCanvas(new FakeCanvas(800, 2600)), canvasPreset, {
      title: "진행",
      createCanvas: (width, height) => asCanvas(new FakeCanvas(width, height)),
      encode: async () => blobOf(500 * 1024),
      onProgress: (done, total) => progress.push([done, total]),
    });
    expect(progress).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it("원본 크기를 읽지 못하면 throw", async () => {
    await expect(
      autoOptimizeEpisodeImage(asCanvas(new FakeCanvas(0, 0)), canvasPreset, {
        title: "빈",
        createCanvas: (width, height) => asCanvas(new FakeCanvas(width, height)),
      })
    ).rejects.toThrow("원본 이미지 크기");
  });
});
