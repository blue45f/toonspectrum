import { useEffect, useState } from "react";

/**
 * NPC 대화 초상화 해석기(portraits-v1).
 * - 기본 초상화 8종은 정적 표로 바로 쓰고, 표정 변형은 manifest.json을 한 번 읽어 확장한다.
 *   그래서 코디네이터가 표정 파일과 manifest 항목만 추가하면 코드 수정 없이 자동으로 쓰인다.
 * - 표정 파일이 없거나(목록에 없음) 내려받지 못하면 기본 초상화, 기본도 없으면 절차 초상화(호출 측)로 대체한다.
 */
export const SPACE_NPC_PORTRAIT_ROOT = "/assets/virtual-studio/portraits-v1";
export const SPACE_NPC_PORTRAIT_MANIFEST_URL = `${SPACE_NPC_PORTRAIT_ROOT}/manifest.json`;

export const SPACE_NPC_EXPRESSIONS = ["happy", "surprised", "thinking"] as const;
export type SpaceNpcVariantExpression = typeof SPACE_NPC_EXPRESSIONS[number];
export type SpaceNpcExpression = "default" | SpaceNpcVariantExpression;

export interface SpaceNpcPortraitManifest {
  /** npc 스킨 키 → 기본 초상화 파일명. */
  readonly portraits: ReadonlyMap<string, string>;
  /** npc 스킨 키 → 표정별 파일명. */
  readonly expressions: ReadonlyMap<string, Partial<Readonly<Record<SpaceNpcVariantExpression, string>>>>;
}

const NPC_KEY = /^npc-[a-z][a-z0-9-]{0,40}$/u;
const FILE_NAME = /^[a-z0-9][a-z0-9-]{0,80}\.webp$/u;

/** 코디네이터가 채운 기본 초상화 8종(2026-10-01). manifest를 못 읽어도 바로 보인다. */
export const SPACE_NPC_PORTRAIT_FALLBACK: SpaceNpcPortraitManifest = Object.freeze({
  portraits: new Map([
    "npc-concierge", "npc-producer", "npc-editor", "npc-artist",
    "npc-archivist", "npc-cafe", "npc-security", "npc-host",
  ].map((key) => [key, `${key}.webp`] as const)),
  expressions: new Map(),
});

function isVariantExpression(value: string): value is SpaceNpcVariantExpression {
  return (SPACE_NPC_EXPRESSIONS as readonly string[]).includes(value);
}

/** manifest.json을 검증해 해석기 표로 바꾼다. 형식이 틀린 항목은 버리고, 전부 틀리면 null. */
export function parseSpaceNpcPortraitManifest(value: unknown): SpaceNpcPortraitManifest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const portraits = new Map<string, string>();
  if (Array.isArray(record.portraits)) {
    for (const entry of record.portraits) {
      if (!entry || typeof entry !== "object") continue;
      const { npc, file } = entry as Record<string, unknown>;
      if (typeof npc === "string" && typeof file === "string" && NPC_KEY.test(npc) && FILE_NAME.test(file)) portraits.set(npc, file);
    }
  }
  const expressions = new Map<string, Partial<Record<SpaceNpcVariantExpression, string>>>();
  if (record.expressions && typeof record.expressions === "object" && !Array.isArray(record.expressions)) {
    for (const [npc, files] of Object.entries(record.expressions as Record<string, unknown>)) {
      if (!NPC_KEY.test(npc) || !portraits.has(npc) || !files || typeof files !== "object" || Array.isArray(files)) continue;
      const variants: Partial<Record<SpaceNpcVariantExpression, string>> = {};
      for (const [expression, file] of Object.entries(files as Record<string, unknown>)) {
        if (isVariantExpression(expression) && typeof file === "string" && FILE_NAME.test(file)) variants[expression] = file;
      }
      if (Object.keys(variants).length) expressions.set(npc, Object.freeze(variants));
    }
  }
  return portraits.size ? Object.freeze({ portraits, expressions }) : null;
}

export interface SpaceNpcPortraitSource {
  /** 지금 보여 줄 파일(표정 변형이 없으면 기본). */
  readonly src: string;
  /** 표정 파일을 내려받지 못했을 때 쓸 기본 초상화. */
  readonly fallbackSrc: string;
  /** 실제로 쓰인 표정. 변형이 없으면 "default". */
  readonly expression: SpaceNpcExpression;
}

/** 스킨 키·표정 → 초상화 경로. 기본 초상화가 없는 NPC는 null(호출 측이 절차 초상화로 그린다). */
export function studioNpcPortrait(
  skinKey: string,
  expression: SpaceNpcExpression = "default",
  manifest: SpaceNpcPortraitManifest = SPACE_NPC_PORTRAIT_FALLBACK,
): SpaceNpcPortraitSource | null {
  const base = manifest.portraits.get(skinKey);
  if (!base) return null;
  const variant = expression === "default" ? undefined : manifest.expressions.get(skinKey)?.[expression];
  return Object.freeze({
    src: `${SPACE_NPC_PORTRAIT_ROOT}/${variant ?? base}`,
    fallbackSrc: `${SPACE_NPC_PORTRAIT_ROOT}/${base}`,
    expression: variant ? expression : "default",
  });
}

/**
 * 대화 흐름 → 표정 규칙(코디네이터 22:55).
 * 인사·완료 = happy, 새 소식·이벤트 = surprised, 팁·질문·선택지 대기 = thinking, 그 외 = 기본.
 */
export type SpaceNpcDialogueMoment = "greeting" | "done" | "news" | "event" | "tip" | "question" | "choices" | "info";

export function spaceNpcExpressionFor(moment: SpaceNpcDialogueMoment): SpaceNpcExpression {
  switch (moment) {
    case "greeting":
    case "done": return "happy";
    case "news":
    case "event": return "surprised";
    case "tip":
    case "question":
    case "choices": return "thinking";
    case "info": return "default";
  }
}

let manifestRequest: Promise<SpaceNpcPortraitManifest> | null = null;
let manifestCache: SpaceNpcPortraitManifest | null = null;

/** manifest.json을 한 번만 읽는다. 실패하면 정적 표로 대체하고 다음 요청 때 다시 시도한다. */
export function loadSpaceNpcPortraitManifest(fetcher: typeof fetch = globalThis.fetch): Promise<SpaceNpcPortraitManifest> {
  if (manifestCache) return Promise.resolve(manifestCache);
  manifestRequest ??= Promise.resolve()
    .then(() => fetcher(SPACE_NPC_PORTRAIT_MANIFEST_URL, { credentials: "same-origin" }))
    .then((response) => response.ok ? response.json() as Promise<unknown> : null)
    .then((json) => {
      const parsed = parseSpaceNpcPortraitManifest(json);
      if (parsed) manifestCache = parsed;
      else manifestRequest = null;
      return parsed ?? SPACE_NPC_PORTRAIT_FALLBACK;
    })
    .catch(() => {
      manifestRequest = null;
      return SPACE_NPC_PORTRAIT_FALLBACK;
    });
  return manifestRequest;
}

/** 테스트 전용: 모듈 캐시를 비운다. */
export function resetSpaceNpcPortraitManifestCache(): void {
  manifestRequest = null;
  manifestCache = null;
}

/** 초상화 표. 처음에는 정적 표를 쓰고 manifest를 읽으면 표정 변형까지 확장한다. */
export function useSpaceNpcPortraitManifest(): SpaceNpcPortraitManifest {
  const [manifest, setManifest] = useState<SpaceNpcPortraitManifest>(() => manifestCache ?? SPACE_NPC_PORTRAIT_FALLBACK);
  useEffect(() => {
    if (manifestCache || typeof globalThis.fetch !== "function") return undefined;
    let alive = true;
    void loadSpaceNpcPortraitManifest().then((next) => { if (alive) setManifest(next); });
    return () => { alive = false; };
  }, []);
  return manifest;
}
