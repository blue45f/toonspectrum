/**
 * NPC 대화 타자기 효과의 순수 계산.
 * 대사 텍스트 자체는 만들지 않고, "지금 몇 글자까지 보여 줄지"만 정한다.
 */

/** 타자기 속도(초당 글자 수). 너무 빠르면 연출이 사라지고, 느리면 답답하다. */
export const STUDIO_DIALOGUE_TYPEWRITER_CHARS_PER_SECOND = 45;

interface GraphemeSegmenter {
  segment(input: string): Iterable<{ readonly segment: string }>;
}

type SegmenterConstructor = new (
  locales: string | undefined,
  options: { granularity: "grapheme" },
) => GraphemeSegmenter;

let cachedSegmenter: GraphemeSegmenter | null | undefined;

function graphemeSegmenter(): GraphemeSegmenter | null {
  if (cachedSegmenter !== undefined) return cachedSegmenter;
  const ctor = (Intl as unknown as { Segmenter?: SegmenterConstructor }).Segmenter;
  cachedSegmenter = ctor ? new ctor(undefined, { granularity: "grapheme" }) : null;
  return cachedSegmenter;
}

/**
 * 사람이 한 글자로 세는 단위(문자 클러스터)로 나눈다.
 * Intl.Segmenter가 있으면 그걸 쓰고, 없으면 코드포인트 단위로 나눠
 * 서로게이트 쌍이 깨지지 않게 한다.
 */
export function studioDialogueGraphemes(text: string): readonly string[] {
  const segmenter = graphemeSegmenter();
  if (segmenter) return [...segmenter.segment(text)].map((part) => part.segment);
  return Array.from(text);
}

export interface StudioDialogueTypewriterState {
  /** 지금까지 보여 줄 텍스트. */
  readonly text: string;
  /** 전문이 다 나왔는지. */
  readonly done: boolean;
}

/**
 * 경과 시간 기준 타자기 상태. reduced-motion이면 처음부터 전문을 보여 준다.
 * elapsedMs가 유효하지 않으면(시계 이상) 전문으로 폴백해 대화가 멈추지 않게 한다.
 */
export function studioDialogueTypewriterVisible(
  text: string,
  elapsedMs: number,
  options: { readonly reducedMotion: boolean },
): StudioDialogueTypewriterState {
  if (options.reducedMotion || !Number.isFinite(elapsedMs)) return { text, done: true };
  const graphemes = studioDialogueGraphemes(text);
  const count = Math.floor((Math.max(0, elapsedMs) / 1_000) * STUDIO_DIALOGUE_TYPEWRITER_CHARS_PER_SECOND);
  if (count >= graphemes.length) return { text, done: true };
  return { text: graphemes.slice(0, Math.max(0, count)).join(""), done: false };
}
