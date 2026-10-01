import type { BilingualCopy } from "../ai/ai-creative-director";
import type { InferenceJob, InferenceKind, InferenceRequest, InferenceStatus } from "./media-inference-client";

/**
 * 생성 실험실의 변환 방식·작업 상태 문구와 판정 규칙.
 * 화면과 테스트가 같은 규칙을 쓰도록 컴포넌트 밖에 둔다.
 */
export interface GenerativeMode {
  readonly kind: InferenceKind;
  readonly title: BilingualCopy;
  readonly summary: BilingualCopy;
  readonly input: BilingualCopy;
  readonly output: BilingualCopy;
  readonly defaultPrompt: BilingualCopy;
  /** 추론 서버 없이도 같은 결과를 직접 만들 수 있는 도구. */
  readonly alternative: { readonly href: string; readonly label: BilingualCopy };
}

export const GENERATIVE_MODES: readonly GenerativeMode[] = Object.freeze([
  {
    kind: "image-to-video",
    title: { ko: "컷 → 애니메이션", en: "Panel → animation" },
    summary: { ko: "만화 컷에 눈 깜빡임·머리카락 같은 짧은 움직임을 더해요.", en: "Add short motion such as blinking or hair sway to a panel." },
    input: { ko: "만화 컷 또는 구도 이미지 (PNG·JPEG·WebP)", en: "A panel or composition image (PNG, JPEG, WebP)" },
    output: { ko: "짧은 WebM 영상", en: "A short WebM clip" },
    defaultPrompt: {
      ko: "캐릭터가 자연스럽게 눈을 깜빡이고 머리카락이 부드럽게 움직입니다.",
      en: "The character blinks naturally while their hair moves gently.",
    },
    alternative: { href: "/studio/motion-webtoon", label: { ko: "모션 웹툰으로 직접 연출", en: "Direct it in Motion Webtoon" } },
  },
  {
    kind: "image-to-3d",
    title: { ko: "2D → 3D 모델", en: "2D → 3D model" },
    summary: { ko: "캐릭터 정면 그림에서 3D 형상(GLB)을 추론해요.", en: "Infer a 3D shape (GLB) from a front-facing character drawing." },
    input: { ko: "배경을 지운 캐릭터 정면 PNG 권장", en: "A front-facing character PNG with the background removed" },
    output: { ko: "GLB 메시 · 리깅·PBR 텍스처 미포함", en: "GLB mesh · no rigging or PBR textures" },
    defaultPrompt: {
      ko: "캐릭터의 실루엣과 의상 형태를 유지합니다.",
      en: "Keep the character's silhouette and outfit shape.",
    },
    alternative: { href: "/studio/assets/characters/new", label: { ko: "캐릭터 3D 셰이퍼로 직접 만들기", en: "Build it in Character Shaper" } },
  },
  {
    kind: "render-to-2d",
    title: { ko: "3D → 웹툰 일러스트", en: "3D → webtoon illustration" },
    summary: { ko: "3D 포즈·구도를 웹툰 느낌의 2D 이미지로 바꿔요.", en: "Turn a 3D pose and camera into a webtoon-style 2D image." },
    input: { ko: "텍스처 내장 GLB(30MB 이하) 또는 3D 캡처 PNG", en: "A self-contained GLB (up to 30 MB) or a 3D capture PNG" },
    output: { ko: "PNG 일러스트", en: "PNG illustration" },
    defaultPrompt: {
      ko: "깔끔한 웹툰 선화와 부드러운 셀 채색으로 표현합니다.",
      en: "Clean webtoon line art with soft cel shading.",
    },
    alternative: { href: "/studio/bg3d", label: { ko: "3D 배경 스튜디오에서 선화 렌더", en: "Render line art in 3D Background Studio" } },
  },
] satisfies readonly GenerativeMode[]);

export function generativeMode(kind: InferenceKind): GenerativeMode {
  const mode = GENERATIVE_MODES.find((entry) => entry.kind === kind);
  if (!mode) throw new Error(`Unknown generative mode: ${kind}`);
  return mode;
}

export const VIDEO_FRAME_OPTIONS = Object.freeze([49, 81, 121] as const satisfies readonly InferenceRequest["frames"][]);
export const VIDEO_FRAMES_PER_SECOND = 24;
export const MAX_PROMO_CLIPS = 8;

export const ASPECT_OPTIONS: readonly { readonly value: InferenceRequest["aspect"]; readonly label: BilingualCopy }[] = Object.freeze([
  { value: "landscape", label: { ko: "가로", en: "Landscape" } },
  { value: "portrait", label: { ko: "세로", en: "Portrait" } },
  { value: "square", label: { ko: "정사각형", en: "Square" } },
]);

export function isVideoFrameOption(value: number): value is InferenceRequest["frames"] {
  return (VIDEO_FRAME_OPTIONS as readonly number[]).includes(value);
}

export function isAspectOption(value: string): value is InferenceRequest["aspect"] {
  return ASPECT_OPTIONS.some((option) => option.value === value);
}

export const INFERENCE_STATE_LABELS: Readonly<Record<string, BilingualCopy>> = Object.freeze({
  submitting: { ko: "입력 전달 중", en: "Sending input" },
  queued: { ko: "GPU 작업 대기", en: "Waiting for GPU" },
  running: { ko: "모델 추론 중", en: "Generating" },
  "submission-unknown": { ko: "접수 여부 확인 중 · 자동 재제출 안 함", en: "Confirming receipt · no automatic resubmission" },
  "cancel-requested": { ko: "취소 확인 중", en: "Confirming cancellation" },
  succeeded: { ko: "생성 완료", en: "Done" },
  failed: { ko: "생성 실패", en: "Failed" },
  cancelled: { ko: "취소 완료", en: "Cancelled" },
});

export function inferenceStateLabel(state: string): BilingualCopy {
  return INFERENCE_STATE_LABELS[state] ?? { ko: state, en: state };
}

export const INFERENCE_STEPS: readonly BilingualCopy[] = Object.freeze([
  { ko: "접수", en: "Received" },
  { ko: "대기", en: "Queued" },
  { ko: "생성", en: "Generating" },
  { ko: "완료", en: "Done" },
]);

/** 작업 상태를 접수(0)·대기(1)·생성(2)·완료(3) 단계로 옮긴다. 실패·취소는 null. */
export function inferenceStepIndex(state: InferenceJob["state"]): number | null {
  if (state === "submitting" || state === "submission-unknown") return 0;
  if (state === "queued") return 1;
  if (state === "running" || state === "cancel-requested") return 2;
  if (state === "succeeded") return 3;
  return null;
}

export type GenerativeModeReadiness =
  | { readonly state: "checking" }
  | { readonly state: "ready" }
  | { readonly state: "missing"; readonly missing: readonly string[] }
  | { readonly state: "offline" };

/** 서버 상태 확인 결과로 변환 방식별 실행 가능 여부를 정한다. */
export function generativeModeReadiness(
  status: InferenceStatus | null,
  failed: boolean,
  kind: InferenceKind,
): GenerativeModeReadiness {
  if (!status) return failed ? { state: "offline" } : { state: "checking" };
  const capability = status.capabilities.find((entry) => entry.kind === kind);
  if (status.configured && capability?.ready) return { state: "ready" };
  return { state: "missing", missing: capability?.missing ?? [] };
}
