/**
 * 회차 → 컷츠 클립 자동 변환 파이프라인.
 *
 * 입력: 회차의 패널(이미지 + 자막 + 내레이션 대본).
 * 출력: 9:16 세로형 클립 재생 명세(CutsClip) —
 *   샷별 켄 번즈 카메라, 자막, 감정 마크업 파싱된 내레이션 세그먼트,
 *   클라우드 TTS 내보내기용 SSML, Web Speech용 순수 텍스트.
 *
 * 내레이션 자산은 기존 음성 모듈을 그대로 재사용한다:
 * - `voice-emotion-markup`의 parseEmotionMarkup — 감정 마크업 파싱
 * - `voice-ssml`의 buildSsml/ssmlToPlainText — SSML 생성·순수 텍스트 추출
 * - `VOICE_CHARACTER_PRESETS.narrator` — 표준 내레이션 프리셋
 */

import { parseEmotionMarkup } from "@/shared/voice/voice-emotion-markup";
import { buildSsml, ssmlToPlainText } from "@/shared/voice/voice-ssml";
import { VOICE_CHARACTER_PRESETS } from "@/shared/voice/voice-character-presets";

import { buildPanelArt } from "./cuts-panel-art";
import type {
  CutsBuildOptions,
  CutsClip,
  CutsShot,
  EpisodePanel,
  EpisodeSource,
  KenBurnsMove,
} from "./cuts-types";

/** 켄 번즈 이동 패턴 — 샷 순서대로 순환하며 방향이 겹치지 않게 한다. */
const KEN_BURNS_CYCLE: ReadonlyArray<KenBurnsMove> = [
  { from: { scale: 1.0, x: 0, y: 0 }, to: { scale: 1.18, x: 0, y: -3 }, direction: "zoom-in" },
  { from: { scale: 1.18, x: -4, y: 0 }, to: { scale: 1.02, x: 2, y: 0 }, direction: "pan-right" },
  { from: { scale: 1.18, x: 0, y: 3 }, to: { scale: 1.0, x: 0, y: 0 }, direction: "zoom-out" },
  { from: { scale: 1.05, x: 4, y: 0 }, to: { scale: 1.18, x: -4, y: 0 }, direction: "pan-left" },
  { from: { scale: 1.0, x: 0, y: 4 }, to: { scale: 1.16, x: 0, y: -4 }, direction: "pan-up" },
];

/** 샷 인덱스로 켄 번즈 이동을 결정 — 결정적이라 미리보기·피드가 같은 연출을 쓴다. */
export function kenBurnsForShot(index: number): KenBurnsMove {
  return KEN_BURNS_CYCLE[index % KEN_BURNS_CYCLE.length];
}

/**
 * 내레이션 텍스트 길이로 샷 재생 길이를 추정한다.
 * 한국어 TTS 기준 초당 약 4음절을 가정하고, 너무 짧거나 길어지지 않게 clamp한다.
 */
export function estimateShotDurationMs(narrationPlain: string, minMs: number, maxMs: number): number {
  const chars = narrationPlain.replace(/\s+/g, "").length;
  const estimated = 1200 + chars * 260;
  return Math.min(maxMs, Math.max(minMs, estimated));
}

const NARRATOR_PRESET = VOICE_CHARACTER_PRESETS.narrator;

function buildShot(
  panel: EpisodePanel,
  index: number,
  startMs: number,
  options: Required<Pick<CutsBuildOptions, "minShotMs" | "maxShotMs">>,
  artSeed: string,
): CutsShot {
  const segments = parseEmotionMarkup(panel.narration, NARRATOR_PRESET);
  const plain = ssmlToPlainText(buildSsml(segments));
  const durationMs = estimateShotDurationMs(plain, options.minShotMs, options.maxShotMs);
  const imageUrl = panel.imageUrl ?? buildPanelArt({ seed: `${artSeed}:${index}`, label: panel.caption });
  return {
    id: `shot-${index + 1}`,
    imageUrl,
    alt: panel.alt,
    caption: panel.caption,
    narrationSegments: segments,
    narrationPlain: plain,
    startMs,
    durationMs,
    kenBurns: kenBurnsForShot(index),
  };
}

function slugifyId(value: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return cleaned.length > 0 ? cleaned : "clip";
}

/**
 * 회차를 컷츠 클립으로 변환한다.
 * 패널이 없으면 null을 반환한다(빈 클립을 만들지 않는다).
 */
export function buildCutsClip(
  episode: EpisodeSource,
  createdBy: string,
  options: CutsBuildOptions = {},
): CutsClip | null {
  const {
    idPrefix = "cuts",
    maxShots = 8,
    minShotMs = 2800,
    maxShotMs = 6000,
  } = options;
  const panels = episode.panels.slice(0, Math.max(1, maxShots));
  if (panels.length === 0) return null;

  const shotOptions = { minShotMs, maxShotMs };
  const artSeed = `${episode.titleId}-ep${episode.episodeNumber}`;
  const shots: CutsShot[] = [];
  let cursorMs = 0;
  panels.forEach((panel, index) => {
    const shot = buildShot(panel, index, cursorMs, shotOptions, artSeed);
    shots.push(shot);
    cursorMs += shot.durationMs;
  });

  const allSegments = shots.flatMap((shot) => shot.narrationSegments);
  const id = `${idPrefix}-${slugifyId(episode.titleId)}-ep${episode.episodeNumber}`;
  const createdAt = new Date().toISOString();

  return {
    id,
    titleId: episode.titleId,
    title: episode.title,
    author: episode.author,
    episodeNumber: episode.episodeNumber,
    episodeTitle: episode.episodeTitle,
    shots,
    durationMs: cursorMs,
    narrationSsml: buildSsml(allSegments),
    thumbnailUrl: shots[0].imageUrl,
    createdBy,
    createdAt,
    publishedAt: createdAt,
    views: 0,
    likes: 0,
  };
}

/** 클립 전체 내레이션을 Web Speech용 단일 텍스트로 합친다. */
export function clipNarrationText(clip: Pick<CutsClip, "shots">): string {
  return clip.shots
    .map((shot) => shot.narrationPlain)
    .filter((text) => text.length > 0)
    .join(" ");
}

/** 초 단위 표기 (예: 0:24). */
export function formatClipDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** 현재 재생 위치(ms)에서 보이는 샷 인덱스. */
export function shotIndexAt(clip: Pick<CutsClip, "shots">, positionMs: number): number {
  for (let index = clip.shots.length - 1; index >= 0; index -= 1) {
    if (positionMs >= clip.shots[index].startMs) return index;
  }
  return 0;
}
