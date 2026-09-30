// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  applySyncedScroll,
  buildProcessCompareItems,
  canOpenProcessCompare,
  clampProcessCompareBlinkMs,
  clampProcessCompareSlider,
  clampProcessCompareZoom,
  computeProcessCompareDiffRegions,
  defaultProcessCompareSources,
  findProcessCompareItem,
  groupProcessCompareItems,
  moveProcessCompareSlider,
  processComparePlaceholderArt,
  processCompareSliderClip,
  processCompareSliderStep,
  zoomProcessCompareIn,
  zoomProcessCompareOut,
  type ProcessCompareItem,
} from "./process-compare-model";

const PROCESSES = [
  {
    id: "p-storyboard",
    label: "콘티",
    kind: "image" as const,
    revisions: [
      { id: "r1", createdAt: "2026-09-20T00:00:00Z" },
      { id: "r2", createdAt: "2026-09-21T00:00:00Z" },
    ],
  },
  {
    id: "p-line",
    label: "선화",
    kind: "image" as const,
    revisions: [{ id: "r3", createdAt: "2026-09-22T00:00:00Z" }],
  },
  {
    id: "p-empty",
    label: "채색",
    kind: "image" as const,
    revisions: [],
  },
];

describe("buildProcessCompareItems", () => {
  it("리비전이 있는 공정만 항목으로 만든다", () => {
    const items = buildProcessCompareItems(PROCESSES);
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.id)).toEqual(["p-storyboard::r1", "p-storyboard::r2", "p-line::r3"]);
  });

  it("리비전 라벨은 1부터 시작하는 v번호다", () => {
    const items = buildProcessCompareItems(PROCESSES);
    expect(items[0].revisionLabel).toBe("v1");
    expect(items[1].revisionLabel).toBe("v2");
    expect(items[2].revisionLabel).toBe("v1");
  });

  it("resolveImageUrl이 없으면 imageUrl은 null이다", () => {
    const items = buildProcessCompareItems(PROCESSES);
    expect(items.every((i) => i.imageUrl === null)).toBe(true);
  });

  it("resolveImageUrl 결과를 반영한다", () => {
    const items = buildProcessCompareItems(PROCESSES, (pid, rid) => `https://img.test/${pid}/${rid}.png`);
    expect(items[0].imageUrl).toBe("https://img.test/p-storyboard/r1.png");
  });
});

describe("defaultProcessCompareSources", () => {
  it("서로 다른 공정의 최신 리비전을 layout개 선택한다", () => {
    const items = buildProcessCompareItems(PROCESSES);
    const sources = defaultProcessCompareSources(items, 2);
    expect(sources).toHaveLength(2);
    // 뒤에서부터: p-line r3, p-storyboard r2
    expect(sources[0]).toEqual({ processId: "p-storyboard", revisionId: "r2" });
    expect(sources[1]).toEqual({ processId: "p-line", revisionId: "r3" });
  });

  it("항목이 부족하면 가능한 만큼만 반환한다", () => {
    const items = buildProcessCompareItems(PROCESSES);
    const sources = defaultProcessCompareSources(items, 4);
    expect(sources).toHaveLength(2);
  });
});

describe("findProcessCompareItem", () => {
  it("공정+리비전으로 항목을 찾는다", () => {
    const items = buildProcessCompareItems(PROCESSES);
    const found = findProcessCompareItem(items, { processId: "p-line", revisionId: "r3" });
    expect(found?.processLabel).toBe("선화");
  });

  it("없으면 null을 반환한다", () => {
    const items = buildProcessCompareItems(PROCESSES);
    expect(findProcessCompareItem(items, { processId: "nope", revisionId: "nope" })).toBeNull();
  });
});

describe("groupProcessCompareItems", () => {
  it("공정별로 그룹핑한다", () => {
    const items = buildProcessCompareItems(PROCESSES);
    const groups = groupProcessCompareItems(items);
    expect(groups).toHaveLength(2);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[1].items).toHaveLength(1);
  });
});

describe("슬라이더 수학", () => {
  it("clampProcessCompareSlider는 0~100으로 고정한다", () => {
    expect(clampProcessCompareSlider(-5)).toBe(0);
    expect(clampProcessCompareSlider(150)).toBe(100);
    expect(clampProcessCompareSlider(42.5)).toBe(42.5);
    expect(clampProcessCompareSlider(Number.NaN)).toBe(50);
  });

  it("processCompareSliderClip은 왼쪽 레이어 clip-path를 만든다", () => {
    expect(processCompareSliderClip(30)).toBe("inset(0 70% 0 0)");
    expect(processCompareSliderClip(0)).toBe("inset(0 100% 0 0)");
    expect(processCompareSliderClip(100)).toBe("inset(0 0% 0 0)");
  });

  it("moveProcessCompareSlider는 범위를 벗어나지 않는다", () => {
    expect(moveProcessCompareSlider(99, 5)).toBe(100);
    expect(moveProcessCompareSlider(1, -5)).toBe(0);
    expect(moveProcessCompareSlider(50, 10)).toBe(60);
  });

  it("Shift 키와 함께 누르면 크게 이동한다", () => {
    expect(processCompareSliderStep(false)).toBe(2);
    expect(processCompareSliderStep(true)).toBe(10);
  });
});

describe("줌 수학", () => {
  it("0.5~4 범위로 고정한다", () => {
    expect(clampProcessCompareZoom(0.1)).toBe(0.5);
    expect(clampProcessCompareZoom(10)).toBe(4);
    expect(clampProcessCompareZoom(1.5)).toBe(1.5);
  });

  it("in/out은 0.25 단위로 증감한다", () => {
    expect(zoomProcessCompareIn(1)).toBe(1.25);
    expect(zoomProcessCompareOut(1)).toBe(0.75);
    expect(zoomProcessCompareIn(4)).toBe(4);
    expect(zoomProcessCompareOut(0.5)).toBe(0.5);
  });
});

describe("applySyncedScroll", () => {
  it("소스의 스크롤 위치를 타깃에 복사한다", () => {
    const a = { scrollLeft: 0, scrollTop: 0 };
    const b = { scrollLeft: 0, scrollTop: 0 };
    applySyncedScroll([a, b], { scrollLeft: 120, scrollTop: 45 });
    expect(a).toEqual({ scrollLeft: 120, scrollTop: 45 });
    expect(b).toEqual({ scrollLeft: 120, scrollTop: 45 });
  });
});

describe("clampProcessCompareBlinkMs", () => {
  it("250~2000ms 범위로 고정한다", () => {
    expect(clampProcessCompareBlinkMs(100)).toBe(250);
    expect(clampProcessCompareBlinkMs(5000)).toBe(2000);
    expect(clampProcessCompareBlinkMs(800)).toBe(800);
  });
});

describe("computeProcessCompareDiffRegions", () => {
  function solid(w: number, h: number, r: number, g: number, b: number): Uint8ClampedArray {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i += 1) {
      data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = 255;
    }
    return data;
  }

  it("동일한 이미지는 빈 배열을 반환한다", () => {
    const a = solid(16, 16, 100, 100, 100);
    expect(computeProcessCompareDiffRegions(a, a, 16, 16)).toEqual([]);
  });

  it("다른 영역을 % 좌표 박스로 반환한다", () => {
    const a = solid(16, 16, 0, 0, 0);
    const b = solid(16, 16, 0, 0, 0);
    // 오른쪽 절반을 흰색으로
    for (let y = 0; y < 16; y += 1) {
      for (let x = 8; x < 16; x += 1) {
        const i = (y * 16 + x) * 4;
        b[i] = 255; b[i + 1] = 255; b[i + 2] = 255;
      }
    }
    const regions = computeProcessCompareDiffRegions(a, b, 16, 16, { cellSize: 8, threshold: 10 });
    expect(regions.length).toBeGreaterThan(0);
    // 오른쪽 셀들이 감지되어야 한다
    expect(regions.some((r) => r.x >= 50)).toBe(true);
    for (const r of regions) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(100);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.y + r.height).toBeLessThanOrEqual(100);
    }
  });

  it("잘못된 입력에는 빈 배열을 반환한다", () => {
    expect(computeProcessCompareDiffRegions(new Uint8ClampedArray(4), new Uint8ClampedArray(8), 2, 2)).toEqual([]);
    expect(computeProcessCompareDiffRegions(new Uint8ClampedArray(0), new Uint8ClampedArray(0), 0, 0)).toEqual([]);
  });
});

describe("processComparePlaceholderArt", () => {
  it("SVG data URI를 반환한다", () => {
    const uri = processComparePlaceholderArt("image", "콘티", 0);
    expect(uri.startsWith("data:image/svg+xml,")).toBe(true);
    expect(decodeURIComponent(uri)).toContain("콘티");
  });

  it("종류별로 다른 색상을 사용한다", () => {
    const a = processComparePlaceholderArt("image", "x", 0);
    const b = processComparePlaceholderArt("text", "x", 0);
    expect(a).not.toBe(b);
  });

  it("HTML 특수문자를 이스케이프한다", () => {
    const uri = processComparePlaceholderArt("image", "<script>", 0);
    expect(decodeURIComponent(uri)).not.toContain("<script>");
  });
});

describe("canOpenProcessCompare", () => {
  it("2개 이상일 때만 true다", () => {
    const items: ProcessCompareItem[] = buildProcessCompareItems(PROCESSES);
    expect(canOpenProcessCompare(items)).toBe(true);
    expect(canOpenProcessCompare(items.slice(0, 1))).toBe(false);
    expect(canOpenProcessCompare([])).toBe(false);
  });
});
