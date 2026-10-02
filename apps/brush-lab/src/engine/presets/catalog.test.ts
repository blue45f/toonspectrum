import { describe, expect, it } from "vitest";

import { fnv1a64 } from "../core/hash";
import { renderPresetThumbnail } from "../raster/reference-renderer";
import { zigzagStroke } from "../testing/synthetic-strokes";

import { DEFAULT_PRESET_ID, hasPreset, PRESET_CATALOG, PRESET_IDS, presetById, presetsByFamily } from "./catalog";
import { FAMILY_METRIC_KEYS, FAMILY_TARGETS, familyTargetsComplete, metricKeysForFamily } from "./families";
import {
  BRUSH_FAMILIES,
  brushConfigHash,
  brushConfigHashSync,
  brushProgramSchema,
  DEPOSITION_MODELS,
  normalizeProgram,
  TIP_KINDS,
} from "./program-schema";

import type { BrushProgram } from "./program-schema";

const THUMB = 64;
/** 31종 × 2회 CPU 렌더는 공유 러너에서 10 s를 넘길 수 있어 앱 로컬 기본 5 s 대신 명시 상한을 둔다. */
const SLOW_RENDER_TIMEOUT_MS = 90_000;

function imageHash(data: Uint8ClampedArray): string {
  return fnv1a64(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
}

function alphaSum(data: Uint8ClampedArray): number {
  let sum = 0;
  for (let i = 3; i < data.length; i += 4) sum += data[i] ?? 0;
  return sum;
}

describe("프리셋 카탈로그", () => {
  it("31종(스펙 30종 + 수묵 1종)이 스키마를 통과하고 id가 유일하다", () => {
    expect(PRESET_CATALOG.length).toBe(31);
    const ids = new Set<string>();
    for (const p of PRESET_CATALOG) {
      expect(() => brushProgramSchema.parse(p)).not.toThrow();
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(5);
    }
    expect(PRESET_IDS).toEqual(PRESET_CATALOG.map((p) => p.id));
  });

  it("매체 가족 21종이 각각 1개 이상 있다", () => {
    for (const family of BRUSH_FAMILIES) {
      expect(presetsByFamily(family).length, family).toBeGreaterThanOrEqual(1);
    }
  });

  it("모든 TipKind·DepositionModel이 최소 1회 쓰인다", () => {
    const tips = new Set(PRESET_CATALOG.map((p) => p.tip.kind));
    const models = new Set(PRESET_CATALOG.map((p) => p.deposition.model));
    for (const kind of TIP_KINDS) expect(tips.has(kind), kind).toBe(true);
    for (const model of DEPOSITION_MODELS) expect(models.has(model), model).toBe(true);
  });

  it("습식 프리셋은 매체(수채·수묵·구아슈·유화)별로 물리 파라미터가 실제로 다르다", () => {
    const wetOf = (id: string): NonNullable<BrushProgram["wet"]> => {
      const wet = presetById(id).wet;
      if (!wet) throw new Error(`${id}: wet 없음`);
      return wet;
    };
    const wc = wetOf("watercolor-wet");
    const dry = wetOf("watercolor-dry");
    const sumi = wetOf("sumi-ink-wet");
    const gouache = wetOf("gouache");
    const oil = wetOf("oil-impasto");
    expect([wc.medium, dry.medium, sumi.medium, gouache.medium, oil.medium]).toEqual(["watercolor", "watercolor", "sumi", "gouache", "oil"]);
    // 수묵: 섬유 이방성·거칠기·아교가 가장 크고 재습윤이 없다(마르면 고정).
    expect(sumi.fiberAnisotropy).toBeGreaterThan(wc.fiberAnisotropy);
    expect(wc.fiberAnisotropy).toBeGreaterThan(gouache.fiberAnisotropy - 0.0001);
    expect(sumi.fiberRoughness).toBeGreaterThan(wc.fiberRoughness);
    expect(sumi.glueGain).toBeGreaterThan(0);
    expect(sumi.rewet).toBe(0);
    expect(wc.rewet).toBeGreaterThan(gouache.rewet);
    expect(gouache.rewet).toBeGreaterThan(sumi.rewet);
    // 수채: 에지 다크닝·그래뉼레이션이 가장 크고 구아슈는 거의 없다.
    expect(wc.edgeDarkening).toBeGreaterThan(gouache.edgeDarkening);
    expect(wc.granulation).toBeGreaterThan(gouache.granulation);
    expect(gouache.diffusion).toBeLessThan(wc.diffusion);
    expect(gouache.depositRate).toBeGreaterThan(wc.depositRate);
    // 수묵은 종이가 물을 더 빨리 빨아들이고(모세관) 마른 붓은 갈필(dryBrush)이 켜져 있다.
    expect(sumi.capillary).toBeGreaterThan(wc.capillary);
    expect(dry.dryBrush).toBeGreaterThan(wc.dryBrush);
    // 유화: 점도가 높고 건조가 느리며 물 계열 확산·증발이 꺼져 있다.
    expect(oil.viscosity).toBeGreaterThan(wc.viscosity);
    expect(oil.dryingMs).toBeGreaterThan(wc.dryingMs);
    expect(oil.diffusion).toBe(0);
    expect(oil.evaporation).toBe(0);
    for (const id of ["watercolor-wet", "watercolor-dry", "sumi-ink-wet", "gouache", "oil-impasto"]) {
      expect(presetById(id).deposition.model).toBe(id === "oil-impasto" ? "impasto" : "wet-flow");
    }
  });

  it("presetById는 존재하면 같은 참조, 없으면 RangeError", () => {
    const first = PRESET_CATALOG[0];
    if (!first) throw new Error("empty catalog");
    expect(presetById(first.id)).toBe(first);
    expect(hasPreset(first.id)).toBe(true);
    expect(hasPreset("nope")).toBe(false);
    expect(() => presetById("nope")).toThrow(RangeError);
    expect(hasPreset(DEFAULT_PRESET_ID)).toBe(true);
  });

  it("configHash는 키 순서와 무관하고 필드가 바뀌면 달라진다", async () => {
    const p = presetById("ink-g-pen");
    const reordered = JSON.parse(JSON.stringify({ ...p, tip: { ...p.tip } })) as BrushProgram;
    const shuffled = Object.fromEntries(Object.entries(reordered).reverse()) as unknown as BrushProgram;
    expect(brushConfigHashSync(shuffled)).toBe(brushConfigHashSync(p));
    expect(await brushConfigHash(shuffled)).toBe(await brushConfigHash(p));
    const changed = normalizeProgram({ ...p, tip: { ...p.tip, sizePx: p.tip.sizePx + 1 } });
    expect(brushConfigHashSync(changed)).not.toBe(brushConfigHashSync(p));
    expect(await brushConfigHash(changed)).not.toBe(await brushConfigHash(p));
    expect(await brushConfigHash(p)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("64×64 지그재그 CPU 렌더가 비어 있지 않고 픽셀 해시가 전부 상이하며 재실행 시 동일하다", () => {
    const samples = zigzagStroke(THUMB, { durationMs: 400 });
    const hashes = new Map<string, string>();
    for (const p of PRESET_CATALOG) {
      const a = renderPresetThumbnail(p, samples, THUMB, 1);
      const b = renderPresetThumbnail(p, samples, THUMB, 1);
      const ha = imageHash(a.image.data);
      const hb = imageHash(b.image.data);
      expect(hb, `${p.id} 결정성`).toBe(ha);
      expect(a.dabs, `${p.id} dab 수`).toBeGreaterThan(0);
      expect(alphaSum(a.image.data), `${p.id} 비어 있음`).toBeGreaterThan(0);
      const dup = hashes.get(ha);
      expect(dup, `${p.id}와 ${dup ?? ""}의 픽셀 해시가 같다`).toBeUndefined();
      hashes.set(ha, p.id);
    }
    expect(hashes.size).toBe(PRESET_CATALOG.length);
  }, SLOW_RENDER_TIMEOUT_MS);

  it("지우개·smudge 썸네일은 배경과 다르고, 지우개는 배경 알파를 줄인다", () => {
    const samples = zigzagStroke(THUMB, { durationMs: 400 });
    const eraser = renderPresetThumbnail(presetById("eraser-hard"), samples, THUMB, 1);
    const smudge = renderPresetThumbnail(presetById("smudge-blend"), samples, THUMB, 1);
    const full = THUMB * THUMB * 255;
    expect(alphaSum(eraser.image.data)).toBeLessThan(full);
    expect(alphaSum(smudge.image.data)).toBe(full);
  });
});

describe("매체 가족 품질 목표", () => {
  it("FAMILY_TARGETS 키가 가족과 1:1이고 지표 키가 FAMILY_METRIC_KEYS 안에 있다", () => {
    expect(familyTargetsComplete()).toBe(true);
    expect(Object.keys(FAMILY_TARGETS).sort()).toEqual([...BRUSH_FAMILIES].sort());
    const known = new Set<string>(FAMILY_METRIC_KEYS);
    for (const family of BRUSH_FAMILIES) {
      const target = FAMILY_TARGETS[family];
      expect(target.family).toBe(family);
      expect(target.metrics.length).toBeGreaterThan(0);
      expect(target.goal.length).toBeGreaterThan(3);
      for (const m of target.metrics) {
        expect(known.has(m.key), m.key).toBe(true);
        expect([">=", "<="]).toContain(m.op);
        expect(Number.isFinite(m.threshold)).toBe(true);
      }
      expect(metricKeysForFamily(family).length).toBeGreaterThan(0);
    }
  });

  it("모든 지표 키가 적어도 한 가족에서 쓰인다", () => {
    const used = new Set<string>();
    for (const family of BRUSH_FAMILIES) for (const m of FAMILY_TARGETS[family].metrics) used.add(m.key);
    for (const key of FAMILY_METRIC_KEYS) expect(used.has(key), key).toBe(true);
  });
});
