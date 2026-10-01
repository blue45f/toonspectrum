import type { BilingualCopy } from "./ai-creative-director";

/**
 * ToonStudio의 AI 진입 화면 네 곳과 각 화면의 사용 조건(비용·키·데이터·결과).
 *
 * 같은 조건 문구를 AI 허브 카드, 생성 실험실 조건 줄, 탭 설명이 함께 쓰도록 한곳에 둔다.
 * 문구는 실제 동작(무료 풀 우선, 자동 유료 전환 없음, 원본 보존)과 맞춰야 한다.
 */
export type AiStudioSurfaceId = "director" | "generate" | "runtime" | "settings";
export type AiStudioConditionKind = "cost" | "key" | "data" | "output";

export interface AiStudioCondition {
  readonly kind: AiStudioConditionKind;
  readonly value: BilingualCopy;
}

export interface AiStudioSurface {
  readonly id: AiStudioSurfaceId;
  readonly href: string;
  readonly title: BilingualCopy;
  readonly summary: BilingualCopy;
  readonly conditions: readonly AiStudioCondition[];
}

export const AI_HUB_PATH = "/studio/ai-lab";
export const AI_RUNTIME_ANCHOR = "ai-runtime";
export const AI_DIRECTOR_ANCHOR = "ai-director";
/** AI 화면이 함께 쓰는 루나 일러스트(320·640px webp 두 벌이 public/brand에 있다). */
export const LUNA_ART_BASE = "/brand/illustrated-20260928/luna";

export const AI_STUDIO_CONDITION_LABELS: Readonly<Record<AiStudioConditionKind, BilingualCopy>> = Object.freeze({
  cost: { ko: "비용", en: "Cost" },
  key: { ko: "키·로그인", en: "Key & sign-in" },
  data: { ko: "데이터", en: "Data" },
  output: { ko: "결과", en: "Output" },
});

export const AI_STUDIO_SURFACES: readonly AiStudioSurface[] = Object.freeze([
  {
    id: "director",
    href: AI_HUB_PATH,
    title: { ko: "AI 크리에이티브 디렉터", en: "AI creative director" },
    summary: {
      ko: "스토리·캐릭터·구도·연출·번역 아이디어를 글로 제안받아요.",
      en: "Get written ideas for story, characters, composition, directing and translation.",
    },
    conditions: [
      { kind: "cost", value: { ko: "무료 한도 우선 · 유료 키는 내가 허용할 때만", en: "Free quota first · paid keys only if you allow them" } },
      { kind: "key", value: { ko: "로그인(자동 무료 AI) 또는 내 무료 API 키", en: "Sign in (free pool) or your own free API key" } },
      { kind: "data", value: { ko: "입력한 글만 선택된 AI 공급자로 전송", en: "Only the text you type goes to the chosen AI provider" } },
      { kind: "output", value: { ko: "검토용 초안 · 작품에 자동 반영 안 됨", en: "Draft for review · never auto-applied to your work" } },
    ],
  },
  {
    id: "generate",
    href: "/studio/generate",
    title: { ko: "생성 실험실", en: "Generative lab" },
    summary: {
      ko: "컷을 짧은 애니메이션으로, 2D를 3D로, 3D 구도를 웹툰 이미지로 바꿔요.",
      en: "Turn panels into short animation, 2D into 3D, and 3D poses into webtoon images.",
    },
    conditions: [
      { kind: "cost", value: { ko: "ToonStudio GPU 서버에서 실행 · 외부 유료 서비스로 자동 전환 없음", en: "Runs on ToonStudio's GPU server · never switches to paid services" } },
      { kind: "key", value: { ko: "로그인 필요 · 별도 API 키 없음", en: "Sign-in required · no API key" } },
      { kind: "data", value: { ko: "선택한 이미지·3D 캡처가 ToonStudio 서버로 전송", en: "Your chosen image or 3D capture is sent to ToonStudio" } },
      { kind: "output", value: { ko: "원본은 그대로 · 결과는 별도 파일", en: "Original untouched · results are separate files" } },
    ],
  },
  {
    id: "runtime",
    href: `${AI_HUB_PATH}#${AI_RUNTIME_ANCHOR}`,
    title: { ko: "내 AI 런타임", en: "My AI runtime" },
    summary: {
      ko: "내가 연결한 클라우드 런타임으로 같은 변환을 직접 실행해요.",
      en: "Run the same conversions on a cloud runtime you connect.",
    },
    conditions: [
      { kind: "cost", value: { ko: "내 런타임·공급자 비용만 · 운영측 결제 없음", en: "Only your runtime costs · no operator billing" } },
      { kind: "key", value: { ko: "런타임 주소 + 32자 이상 토큰", en: "Runtime URL + 32+ character token" } },
      { kind: "data", value: { ko: "원본이 내가 지정한 런타임으로만 업로드", en: "Sources upload only to your runtime" } },
      { kind: "output", value: { ko: "SHA-256 확인 후 내려받기", en: "Downloaded after SHA-256 verification" } },
    ],
  },
  {
    id: "settings",
    href: "/settings/ai",
    title: { ko: "AI 설정", en: "AI settings" },
    summary: {
      ko: "무료 AI 순서, 개인 키, 런타임 연결을 한곳에서 관리해요.",
      en: "Manage free AI order, personal keys and runtime connections in one place.",
    },
    conditions: [
      { kind: "cost", value: { ko: "무료·유료 경로와 우선순위를 직접 선택", en: "You choose free or paid routes and their order" } },
      { kind: "key", value: { ko: "개인 키는 이 브라우저에만 · 저장 시 암호화", en: "Personal keys stay in this browser · encrypted if saved" } },
      { kind: "data", value: { ko: "연결 확인 외에는 요청을 보내지 않음", en: "No requests beyond connection checks" } },
      { kind: "output", value: { ko: "모든 AI 화면에 같은 설정 적용", en: "One setting for every AI screen" } },
    ],
  },
] satisfies readonly AiStudioSurface[]);

export function aiStudioSurface(id: AiStudioSurfaceId): AiStudioSurface {
  const surface = AI_STUDIO_SURFACES.find((entry) => entry.id === id);
  if (!surface) throw new Error(`Unknown AI studio surface: ${id}`);
  return surface;
}
