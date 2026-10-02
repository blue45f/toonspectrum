import { describe, expect, it } from "vitest";

import { srgbStraightToLinearPremul } from "../core/color";
import { DabBatch } from "../core/dab-layout";
import { StrokeBudgetExceededError } from "../core/errors";
import { fnv1a64 } from "../core/hash";
import { presetById } from "../presets/catalog";
import { normalizeProgram } from "../presets/program-schema";
import { lineStroke, zigzagStroke } from "../testing/synthetic-strokes";

import { renderStroke, splitFrames, Surface, thumbnailBackground } from "./reference-renderer";
import { TILE_SIZE } from "./tile-binning";

import type { DabInstance, LabImage } from "../core/types";
import type { BrushProgram, BrushProgramInput } from "../presets/program-schema";

const BASE: BrushProgramInput = {
  id: "surface-test",
  name: "surface test",
  family: "ink",
  tip: { kind: "round", sizePx: 16, hardness: 1 },
  paper: { enabled: false },
  deposition: { model: "dry-stamp", flow: 0.5, opacity: 1, spacing: 0.5 },
  physics: { contact: "none" },
};

function program(over: Partial<BrushProgramInput> = {}): BrushProgram {
  return normalizeProgram({ ...BASE, ...over });
}

function dab(partial: Partial<DabInstance> = {}): DabInstance {
  return {
    x: 32,
    y: 32,
    rx: 8,
    ry: 8,
    angle: 0,
    hardness: 1,
    flow: 0.5,
    shapeExp: 2,
    r: 0,
    g: 0,
    b: 0,
    a: 1,
    tipKind: "round",
    seed: 1,
    grain: 0,
    wet: 0,
    pigmentMass: 0,
    erase: false,
    smudge: false,
    dualTip: false,
    lockAlpha: false,
    impasto: false,
    deposition: "dry-stamp",
    ...partial,
  };
}

function batchOf(dabs: readonly DabInstance[]): DabBatch {
  const b = new DabBatch(dabs.length);
  for (const d of dabs) b.push(d);
  return b;
}

function imageHash(img: LabImage): string {
  return fnv1a64(new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength));
}

function pixel(doc: Float32Array, width: number, x: number, y: number): [number, number, number, number] {
  const o = (y * width + x) * 4;
  return [doc[o] ?? 0, doc[o + 1] ?? 0, doc[o + 2] ?? 0, doc[o + 3] ?? 0];
}

/**
 * CPU 참조 픽셀 해시 스냅샷(fnv1a64, sRGB RGBA8). 엔진 수식이 바뀌면 의도적으로 갱신한다.
 * 2026-10-01 생성: zigzagStroke(size, 600 ms), seed 1, 빈 문서.
 * 이 목록은 **비습식 프리셋**만 담는다(2026-10-02 습식 물리 확장 — LBM 흐름층·3층·섬유·유화 층 — 뒤에도 해시가 변하지 않았다:
 * ink-g-pen·pencil-hb·marker-alcohol·airbrush). 습식 프리셋(수채·수묵·구아슈·유화)의 해시는 `wet-presets.snapshot.test.ts`가 맡는다.
 */
/** 512² CPU 참조 렌더는 공유 러너에서 10 s를 넘길 수 있어 앱 로컬 기본 5 s 대신 명시 상한을 둔다. */
const SLOW_RENDER_TIMEOUT_MS = 90_000;

const SNAPSHOTS: readonly [id: string, size: number, hash: string][] = [
  ["ink-g-pen", 256, "3e66c6a4278fa07a"],
  ["pencil-hb", 256, "0de059d99a399575"],
  ["marker-alcohol", 256, "c7a58dfe8d0e9d04"],
  ["airbrush", 256, "73cb000b3ed8e29e"],
  ["ink-g-pen", 512, "03435916d2ffa584"],
  ["pencil-hb", 512, "eb724959d583f0b2"],
  ["marker-alcohol", 512, "d1f86555b1222d52"],
  ["airbrush", 512, "bb52144130033daf"],
];

describe("Surface(CPU 참조 표면)", () => {
  it("같은 배치를 다시 실행하면 해시가 같고, 겹치는 dab의 순서를 바꾸면 결과가 달라진다(순서 의존)", () => {
    const red = srgbStraightToLinearPremul([1, 0, 0, 1]);
    const blue = srgbStraightToLinearPremul([0, 0, 1, 1]);
    const a = dab({ x: 30, y: 32, r: red[0], g: red[1], b: red[2], a: red[3], flow: 0.6 });
    const b = dab({ x: 34, y: 32, r: blue[0], g: blue[1], b: blue[2], a: blue[3], flow: 0.6 });
    const render = (dabs: DabInstance[]): LabImage => {
      const surface = new Surface(64, 64);
      surface.beginStroke(program(), 1);
      surface.addDabs(batchOf(dabs));
      surface.endStroke();
      return surface.toLabImage();
    };
    expect(imageHash(render([a, b]))).toBe(imageHash(render([a, b])));
    expect(imageHash(render([a, b]))).not.toBe(imageHash(render([b, a])));
  });

  it("flow 0.5 × n겹 알파 = 1 − 0.5ⁿ(오차 < 1e-4), 획 알파는 opacity 상한", () => {
    for (const n of [1, 2, 3, 5, 8]) {
      const surface = new Surface(64, 64);
      surface.beginStroke(program(), 1);
      surface.addDabs(batchOf(Array.from({ length: n }, () => dab())));
      surface.endStroke();
      const [, , , alpha] = pixel(surface.document, 64, 32, 32);
      expect(Math.abs(alpha - (1 - 0.5 ** n))).toBeLessThan(1e-4);
    }
    const capped = new Surface(64, 64);
    capped.beginStroke(program({ deposition: { ...BASE.deposition, opacity: 0.6 } }), 1);
    capped.addDabs(batchOf(Array.from({ length: 10 }, () => dab({ flow: 1 }))));
    const receipt = capped.endStroke();
    expect(pixel(capped.document, 64, 32, 32)[3]).toBeCloseTo(0.6, 5);
    expect(receipt.dabCount).toBe(10);
    expect(receipt.wet).toBeNull();
  });

  it("eraser는 알파만 줄이고 straight 색은 불변, erase 모드 합성", () => {
    const surface = new Surface(64, 64);
    const fillColor = srgbStraightToLinearPremul([0.8, 0.3, 0.1, 1]);
    surface.fill(fillColor);
    const eraser = program({ deposition: { model: "eraser", flow: 1, opacity: 1, spacing: 0.5, blend: "erase" } });
    surface.beginStroke(eraser, 1);
    surface.addDabs(batchOf([dab({ x: 32, y: 32, rx: 6, ry: 6, flow: 0.7, erase: true, deposition: "eraser" })]));
    surface.endStroke();
    const center = pixel(surface.document, 64, 32, 32);
    expect(center[3]).toBeCloseTo(0.3, 5);
    for (let c = 0; c < 3; c += 1) expect((center[c] ?? 0) / center[3]).toBeCloseTo(fillColor[c] ?? 0, 5);
    const far = pixel(surface.document, 64, 5, 5);
    expect(far).toEqual([fillColor[0], fillColor[1], fillColor[2], 1]);
  });

  it("smudge는 문서 색을 끌어오며 premultiplied 총질량이 2% 안에서 보존되고 알파 합은 불변", () => {
    const width = 64;
    const surface = new Surface(width, 64);
    const left = srgbStraightToLinearPremul([1, 0, 0, 1]);
    const right = srgbStraightToLinearPremul([0, 0, 1, 1]);
    for (let y = 0; y < 64; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const c = x < 32 ? left : right;
        const o = (y * width + x) * 4;
        surface.document[o] = c[0];
        surface.document[o + 1] = c[1];
        surface.document[o + 2] = c[2];
        surface.document[o + 3] = c[3];
      }
    }
    const mass = (doc: Float32Array): { rgb: number; alpha: number } => {
      let rgb = 0;
      let alpha = 0;
      for (let i = 0; i < doc.length; i += 4) {
        rgb += (doc[i] ?? 0) + (doc[i + 1] ?? 0) + (doc[i + 2] ?? 0);
        alpha += doc[i + 3] ?? 0;
      }
      return { rgb, alpha };
    };
    const before = mass(surface.document);
    const smudge = presetById("smudge-blend");
    renderStroke(smudge, lineStroke(10, 32, 54, 32, 0.7, { durationMs: 300 }), { width, height: 64, seed: 1, surface });
    const after = mass(surface.document);
    expect(after.alpha).toBeCloseTo(before.alpha, 3);
    expect(Math.abs(after.rgb - before.rgb) / before.rgb).toBeLessThan(0.02);
    // 경계 오른쪽 픽셀에 빨강이 끌려왔다
    const mixed = pixel(surface.document, width, 36, 32);
    expect(mixed[0]).toBeGreaterThan(0.01);
    expect(mixed[2]).toBeLessThan(right[2] ?? 1);
  });

  it("타일 풀 초과는 StrokeBudgetExceededError(무음 폐기 없음)", () => {
    const surface = new Surface(64, 64, { strokeCapacityTiles: 1 });
    surface.beginStroke(program(), 1);
    expect(() => surface.addDabs(batchOf([dab({ x: 32, y: 32, rx: 12, ry: 12 })]))).toThrow(StrokeBudgetExceededError);
    const small = new Surface(64, 64, { strokeCapacityTiles: 1 });
    small.beginStroke(program(), 1);
    expect(() => small.addDabs(batchOf([dab({ x: 8, y: 8, rx: 2, ry: 2, hardness: 1 })]))).not.toThrow();
    expect(small.endStroke().poolTilesUsed).toBe(1);
  });

  it("beginStroke 전 addDabs/endStroke는 InvalidStateError, 크기 검증", () => {
    const surface = new Surface(32, 32);
    expect(() => surface.addDabs(batchOf([dab()]))).toThrow(/beginStroke/);
    expect(() => surface.endStroke()).toThrow(/beginStroke/);
    expect(() => new Surface(0, 10)).toThrow(RangeError);
    expect(surface.tilesX).toBe(2);
    expect(TILE_SIZE).toBe(16);
  });

  it("splitFrames: tMs 경계로 프레임을 나누고 총 표본을 보존한다", () => {
    const samples = lineStroke(0, 0, 100, 0, 0.5, { durationMs: 100 });
    const frames = splitFrames(samples, 1000 / 60);
    expect(frames.reduce((n, f) => n + f.length, 0)).toBe(samples.length);
    expect(frames.length).toBeGreaterThanOrEqual(6);
    for (const frame of frames) {
      const t0 = frame[0]?.tMs ?? 0;
      const t1 = frame[frame.length - 1]?.tMs ?? 0;
      expect(t1 - t0).toBeLessThan(1000 / 60);
    }
    expect(splitFrames([])).toEqual([]);
  });

  it("thumbnailBackground: 지우개·smudge만 그라데이션 배경, 나머지는 빈 문서", () => {
    const bg = thumbnailBackground(presetById("eraser-soft"), 32, 32);
    expect(pixel(bg.document, 32, 16, 16)[3]).toBe(1);
    const empty = thumbnailBackground(presetById("pencil-hb"), 32, 32);
    expect(pixel(empty.document, 32, 16, 16)[3]).toBe(0);
  });

  it("임파스토: 높이가 쌓이고 표시 시점 조명은 문서를 바꾸지 않으며 여러 획에도 중복 적용되지 않는다", () => {
    const oil = presetById("oil-impasto");
    const surface = new Surface(96, 96);
    renderStroke(oil, lineStroke(10, 48, 86, 48, 0.8, { durationMs: 300 }), { width: 96, height: 96, seed: 1, surface });
    expect(surface.wet).not.toBeNull();
    const wet = surface.wet;
    if (!wet) throw new Error("wet state missing");
    const height = surface.heightMap(wet);
    expect(Math.max(...Array.from(height))).toBeGreaterThan(0);
    const docBefore = new Float32Array(surface.document);
    const lit = surface.toLinear();
    expect(surface.document).toEqual(docBefore);
    // 조명은 능선·골에서 문서와 다르게 나타난다
    let differs = 0;
    for (let i = 0; i < lit.length; i += 4) if (Math.abs((lit[i] ?? 0) - (docBefore[i] ?? 0)) > 1e-6) differs += 1;
    expect(differs).toBeGreaterThan(0);
    expect(surface.toLabImage().width).toBe(96);
  });

  it("임파스토 높이장은 타일 경계(16 px)에 이음새가 없다(밀기가 타일을 가로지른다)", () => {
    const size = 128;
    const surface = new Surface(size, size);
    renderStroke(presetById("oil-impasto"), zigzagStroke(size, { durationMs: 600 }), { width: size, height: size, seed: 1, surface });
    const wet = surface.wet;
    if (!wet) throw new Error("wet state missing");
    const h = surface.heightMap(wet);
    // 획 안(높이 > 0) 픽셀에서 타일 경계 열·행의 평균 |기울기|가 내부와 같은 수준이어야 한다.
    // 타일 국소 밀기는 하류 경계 열에 물감이 쌓여 이 비가 수 배로 커졌다(눈에 보이는 격자 무늬).
    const sums = { bx: 0, bnx: 0, ix: 0, inx: 0, by: 0, bny: 0, iy: 0, iny: 0 };
    for (let y = 1; y < size - 1; y += 1) {
      for (let x = 1; x < size - 1; x += 1) {
        const c = h[y * size + x] ?? 0;
        if (c <= 0) continue;
        const dx = Math.abs(c - (h[y * size + x - 1] ?? 0));
        const dy = Math.abs(c - (h[(y - 1) * size + x] ?? 0));
        if (x % TILE_SIZE === 0) {
          sums.bx += dx;
          sums.bnx += 1;
        } else {
          sums.ix += dx;
          sums.inx += 1;
        }
        if (y % TILE_SIZE === 0) {
          sums.by += dy;
          sums.bny += 1;
        } else {
          sums.iy += dy;
          sums.iny += 1;
        }
      }
    }
    expect(sums.bnx).toBeGreaterThan(20);
    expect(sums.bny).toBeGreaterThan(20);
    expect(sums.bx / sums.bnx / (sums.ix / sums.inx)).toBeLessThan(1.3);
    expect(sums.by / sums.bny / (sums.iy / sums.iny)).toBeLessThan(1.3);
  });

  it.each([256, 512])("%i² 픽셀 해시 스냅샷(결정성·회귀 게이트)", (size) => {
    const actual: string[] = [];
    for (const [id, snapSize, hash] of SNAPSHOTS) {
      if (snapSize !== size) continue;
      const res = renderStroke(presetById(id), zigzagStroke(size, { durationMs: 600 }), { width: size, height: size, seed: 1 });
      const got = imageHash(res.image);
      actual.push(`["${id}", ${size}, "${got}"]`);
      expect(res.dabs).toBeGreaterThan(0);
      expect(got, `${id} ${size}² (실측 ${actual.join(", ")})`).toBe(hash);
    }
  }, SLOW_RENDER_TIMEOUT_MS);
});
