import { buildFixture, isFixtureId } from "../../bench/fixtures/stroke-fixtures";
import { computeFamilyMetrics } from "../../bench/metrics/family-metrics";
import { SumiError } from "../../engine/core/errors";
import { presetById } from "../../engine/presets/catalog";
import { FAMILY_TARGETS } from "../../engine/presets/families";
import { renderPresetThumbnail } from "../../engine/raster/reference-renderer";
import { pixelHashOf } from "../state/pixel-hash";

import type { FamilyMetricKey, FamilyMetricTarget } from "../../engine/presets/families";
import type {
  GalleryFamilyVerdict,
  GalleryRenderRequestMessage,
  GalleryRenderResponseMessage,
} from "../../platform/worker-client";

/**
 * 갤러리 썸네일 렌더의 순수 부분. Worker 진입 파일(`gallery-render.worker.ts`)과 Node 테스트가 공유한다.
 * 렌더는 엔진의 CPU 참조 경로(`renderPresetThumbnail` = cpu-reference 레인이 감싸는 `Surface`/`StrokePipeline`)로
 * 실행하고, 결정성 해시(fnv1a64)와 매체 가족 지표 판정을 함께 돌려준다.
 */

export interface GalleryRenderOptions {
  /** 렌더 시간 측정용 시계(Worker는 performance.now, 테스트는 고정값). */
  now: () => number;
  /** 썸네일 시드. 기본 1(카탈로그 다양성 테스트와 동일). */
  seed?: number;
}

/** 가족 임계값 표와 지표 값으로 PASS/FAIL/UNAVAILABLE을 매긴다(측정 불가·NaN은 UNAVAILABLE). */
export function judgeFamily(
  targets: readonly FamilyMetricTarget[],
  metrics: Partial<Record<FamilyMetricKey, number | null>>,
): GalleryFamilyVerdict[] {
  return targets.map((t) => {
    const raw = metrics[t.key];
    const value = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
    let verdict: GalleryFamilyVerdict["verdict"] = "UNAVAILABLE";
    if (value !== null) {
      const pass = t.op === ">=" ? value >= t.threshold : value <= t.threshold;
      verdict = pass ? "PASS" : "FAIL";
    }
    return { key: t.key, value, op: t.op, threshold: t.threshold, verdict };
  });
}

/** 요청 1건을 처리해 응답 메시지를 만든다. 모든 실패는 `error` 메시지로 돌려준다(throw하지 않는다). */
export function handleGalleryRequest(
  msg: GalleryRenderRequestMessage,
  opts: GalleryRenderOptions,
): GalleryRenderResponseMessage {
  try {
    if (!isFixtureId(msg.fixtureId)) {
      throw new SumiError("fixture-unknown", `알 수 없는 fixture '${msg.fixtureId}'`);
    }
    if (!Number.isInteger(msg.size) || msg.size < 16 || msg.size > 1024) {
      throw new SumiError("gallery-size-invalid", `썸네일 크기는 16..1024 정수여야 한다: ${msg.size}`);
    }
    const program = presetById(msg.presetId);
    const fixture = buildFixture(msg.fixtureId, { width: msg.size, height: msg.size });
    const t0 = opts.now();
    const rendered = renderPresetThumbnail(program, fixture.samples, msg.size, opts.seed ?? 1);
    const renderMs = opts.now() - t0;
    const familyMetrics = computeFamilyMetrics(program.family, {
      out: rendered.image,
      fixture,
      receipt: rendered.receipt,
      program,
    });
    const family = judgeFamily(FAMILY_TARGETS[program.family].metrics, familyMetrics);
    return {
      type: "result",
      id: msg.id,
      presetId: msg.presetId,
      fixtureId: msg.fixtureId,
      width: rendered.image.width,
      height: rendered.image.height,
      data: rendered.image.data,
      pixelHash: pixelHashOf(rendered.image),
      renderMs,
      dabCount: rendered.dabs,
      family,
    };
  } catch (error) {
    const code = error instanceof SumiError ? error.code : error instanceof Error ? error.name : "error";
    const message = error instanceof Error ? error.message : String(error);
    return { type: "error", id: msg.id, code, message };
  }
}
