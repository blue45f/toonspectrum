import { z } from "zod";

import { canonicalJson } from "../../engine/core/hash";
import { LAB_SCHEMA_VERSION } from "../../engine/core/version";

import type { StrokeFixture } from "./stroke-fixtures";
import type { RawSample } from "../../engine/core/types";

/**
 * fixture·캡처 획 JSON 스키마(import/export). 엔진 타입 `RawSample`과 구조적으로 호환되며
 * 현행 서비스 프로젝트 모델의 원시 입력 표본 스키마 범위(tilt ±90, twist 0..359)를 그대로 따라
 * 기준선 레인이 재검증 없이 받을 수 있게 한다(서비스 패키지는 import하지 않는다).
 */

export const POINTER_KINDS = ["pen", "touch", "mouse"] as const;
export const SAMPLE_PHASES = ["down", "move", "up"] as const;
export const SAMPLE_SOURCES = ["raw", "coalesced", "predicted"] as const;

export const rawSampleSchema = z.object({
  x: z.number(),
  y: z.number(),
  tMs: z.number().nonnegative(),
  pressure: z.number().min(0).max(1),
  tiltXDeg: z.number().min(-90).max(90),
  tiltYDeg: z.number().min(-90).max(90),
  twistDeg: z.number().min(0).max(359),
  tangentialPressure: z.number().min(-1).max(1).optional(),
  contactWidth: z.number().nonnegative().optional(),
  contactHeight: z.number().nonnegative().optional(),
  buttons: z.number().int().nonnegative().optional(),
  pointerType: z.enum(POINTER_KINDS),
  phase: z.enum(SAMPLE_PHASES),
  source: z.enum(SAMPLE_SOURCES),
});

/** 타입 수준 호환 검사: 스키마 출력이 RawSample에 대입 가능해야 한다. */
export const RAW_SAMPLE_SCHEMA_COMPATIBLE: z.infer<typeof rawSampleSchema> extends RawSample
  ? true
  : never = true;

const pointSchema = z.tuple([z.number(), z.number()]);

export const strokeFixtureSchema = z.object({
  id: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  samples: z.array(rawSampleSchema).min(2),
  description: z.string(),
  intendedPath: z.array(pointSchema).min(2).optional(),
  seed: z.number().int().nonnegative(),
  sampleRateHz: z.number().positive(),
});

export const STROKE_FIXTURE_SCHEMA_COMPATIBLE: z.infer<typeof strokeFixtureSchema> extends StrokeFixture
  ? true
  : never = true;

/** 브라우저에서 캡처한 실제 획(JSON export). version은 리포트와 같은 랩 스키마 버전을 쓴다. */
export const capturedStrokeSchema = z.object({
  version: z.literal(LAB_SCHEMA_VERSION),
  userAgent: z.string(),
  pointerType: z.enum(POINTER_KINDS),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** YYYY-MM-DD 또는 ISO 일시. 없으면 null. */
  capturedAt: z.string().nullable().default(null),
  samples: z.array(rawSampleSchema).min(2),
});
export type CapturedStroke = z.infer<typeof capturedStrokeSchema>;

/** fixture JSON 파싱. 실패는 ZodError. */
export function parseStrokeFixture(input: unknown): StrokeFixture {
  const parsed = strokeFixtureSchema.parse(input);
  const fixture: StrokeFixture = {
    id: parsed.id,
    width: parsed.width,
    height: parsed.height,
    samples: parsed.samples,
    description: parsed.description,
    seed: parsed.seed,
    sampleRateHz: parsed.sampleRateHz,
  };
  if (parsed.intendedPath) fixture.intendedPath = parsed.intendedPath;
  return fixture;
}

export function parseCapturedStroke(input: unknown): CapturedStroke {
  return capturedStrokeSchema.parse(input);
}

/** 캡처 획 → fixture(id `captured:<label>`). 표본율은 tMs 중앙 간격으로 추정한다. */
export function capturedStrokeToFixture(captured: CapturedStroke, label: string): StrokeFixture {
  const dts: number[] = [];
  for (let i = 1; i < captured.samples.length; i += 1) {
    const a = captured.samples[i - 1];
    const b = captured.samples[i];
    if (a && b && b.tMs > a.tMs) dts.push(b.tMs - a.tMs);
  }
  dts.sort((a, b) => a - b);
  const median = dts[Math.floor(dts.length / 2)] ?? 1000 / 60;
  return {
    id: `captured:${label}`,
    width: captured.width,
    height: captured.height,
    samples: captured.samples.map((s) => ({ ...s })),
    description: `captured stroke (${captured.pointerType}, ${captured.userAgent})`,
    seed: 0,
    sampleRateHz: median > 0 ? 1000 / median : 60,
  };
}

/** 정규 직렬화(키 정렬). 같은 fixture면 같은 문자열. */
export function serializeFixture(fixture: StrokeFixture): string {
  return canonicalJson(fixture);
}

export function serializeCapturedStroke(captured: CapturedStroke): string {
  return canonicalJson(captured);
}
