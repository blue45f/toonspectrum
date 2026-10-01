import {
  admitStudioProductionTool,
  type StudioProductionTool,
  type StudioToolchainProfileId,
  type StudioToolDeployment,
  type StudioToolMaturity,
} from "./studio-production-toolchain";

import type { StudioToonBridgeToolProbe } from "./studio-toonbridge-client";

/**
 * 제작 도구 카탈로그의 내부 값(local-toonbridge, allowed-with-obligations 등)을
 * 사람이 읽는 이름으로 바꾸고, 도구별 현재 상태를 한 가지 규칙으로 판정한다.
 */
export interface ToolchainCopy {
  readonly ko: string;
  readonly en: string;
}

/** 실행기 조사 결과 상태 + 아직 조사하지 않은 로컬 도구를 뜻하는 화면 전용 "unchecked". */
export type StudioToolState = StudioToonBridgeToolProbe["state"] | "unchecked";

export const TOOL_STATE_ORDER: readonly StudioToolState[] = ["available", "connector", "manual", "unchecked", "missing", "blocked"];

export const TOOL_STATE_LABELS: Readonly<Record<StudioToolState, ToolchainCopy>> = {
  available: { ko: "실행 준비", en: "Ready" },
  connector: { ko: "외부 연결", en: "Connector" },
  manual: { ko: "수동 연결", en: "Manual" },
  unchecked: { ko: "확인 전", en: "Not checked" },
  missing: { ko: "설치 안 됨", en: "Not installed" },
  blocked: { ko: "프로필 제한", en: "Blocked by profile" },
};

export const TOOL_STATE_HINTS: Readonly<Record<StudioToolState, ToolchainCopy>> = {
  available: { ko: "이 컴퓨터에서 바로 실행할 수 있어요.", en: "Runs on this computer now." },
  connector: { ko: "외부 서비스 계정을 연결해 사용해요.", en: "Uses an external service account." },
  manual: { ko: "설치는 확인됐고 실행 어댑터를 직접 켜야 해요.", en: "Installed; enable its adapter manually." },
  unchecked: { ko: "실행기를 연결하면 이 컴퓨터에 설치됐는지 확인해요.", en: "Connect the runner to check whether it's installed on this computer." },
  missing: { ko: "실행기에서 프로그램을 찾지 못했어요.", en: "The runner couldn't find the program." },
  blocked: { ko: "현재 사용 범위 프로필에서는 쓸 수 없어요.", en: "Not allowed in the current profile." },
};

const DEPLOYMENT_LABELS: Readonly<Record<StudioToolDeployment, ToolchainCopy>> = {
  "local-toonbridge": { ko: "내 컴퓨터 실행기", en: "Local runner" },
  connector: { ko: "외부 서비스 연결", en: "External connector" },
  "optional-module": { ko: "선택 모듈", en: "Optional module" },
};

const MATURITY_LABELS: Readonly<Record<StudioToolMaturity, ToolchainCopy>> = {
  "production-candidate": { ko: "제작 투입 후보", en: "Production candidate" },
  "adapter-ready": { ko: "어댑터 준비됨", en: "Adapter ready" },
  "connector-ready": { ko: "연결 준비됨", en: "Connector ready" },
  "manual-adapter": { ko: "수동 어댑터", en: "Manual adapter" },
  "research-only": { ko: "연구 전용", en: "Research only" },
};

const COMMERCIAL_USE_LABELS: Readonly<Record<string, ToolchainCopy>> = {
  allowed: { ko: "상업 이용 가능", en: "Commercial use allowed" },
  "allowed-with-obligations": { ko: "조건부 가능 · 고지·소스 공개 의무", en: "Allowed with notice/source obligations" },
  "build-dependent": { ko: "빌드 구성에 따라 다름", en: "Depends on the build" },
  "implementation-dependent": { ko: "연결한 구현체에 따라 다름", en: "Depends on the connected implementation" },
  prohibited: { ko: "상업 이용 불가", en: "No commercial use" },
  "prohibited-without-separate-license": { ko: "별도 라이선스 없이는 불가", en: "Needs a separate license" },
};

export function deploymentLabel(deployment: StudioToolDeployment): ToolchainCopy {
  return DEPLOYMENT_LABELS[deployment];
}

export function maturityLabel(maturity: StudioToolMaturity): ToolchainCopy {
  return MATURITY_LABELS[maturity];
}

/** 카탈로그에 새 값이 생겨도 원문을 그대로 보여 주어 정보를 숨기지 않는다. */
export function commercialUseLabel(value: string): ToolchainCopy {
  return COMMERCIAL_USE_LABELS[value] ?? { ko: value, en: value };
}

/**
 * 도구의 현재 상태: 프로필이 막으면 항상 "프로필 제한", 실행기가 조사한 결과가 있으면 그 값,
 * 아직 조사하지 않았다면 배포 방식으로 정한다(외부 연결·선택 모듈·확인 전). 조사 전에는 "설치 안 됨"이라고 단정하지 않는다.
 */
export function resolveStudioToolState(
  tool: StudioProductionTool,
  profile: StudioToolchainProfileId,
  probe: StudioToonBridgeToolProbe | undefined,
): StudioToolState {
  if (!admitStudioProductionTool(tool, profile).allowed) return "blocked";
  if (probe) return probe.state;
  if (tool.deployment === "connector") return "connector";
  if (tool.deployment === "optional-module") return "blocked";
  return "unchecked";
}

export function countToolStates(states: readonly StudioToolState[]): Readonly<Record<StudioToolState, number>> {
  const counts: Record<StudioToolState, number> = { available: 0, connector: 0, manual: 0, unchecked: 0, missing: 0, blocked: 0 };
  for (const state of states) counts[state] += 1;
  return counts;
}

const PROFILE_LABELS: Readonly<Record<StudioToolchainProfileId, { readonly nameEn: string; readonly descriptionEn: string }>> = {
  open: { nameEn: "Open default", descriptionEn: "Connects allowed permissive modules and separately installed engines; blocks non-commercial modules." },
  "community-gpl": { nameEn: "Community GPL", descriptionEn: "Connects GPL/AGPL tools as separate runners and keeps corresponding source and notices." },
  "research-nc": { nameEn: "Research NC", descriptionEn: "A research setup that explicitly allows non-commercial modules." },
};

export function profileEnglish(profile: StudioToolchainProfileId): { readonly nameEn: string; readonly descriptionEn: string } {
  return PROFILE_LABELS[profile];
}

const CATEGORY_ENGLISH: Readonly<Record<string, string>> = {
  effects: "Effects & restoration",
  compositing: "Compositing",
  "scan-ocr": "Scan & OCR",
  vector: "Vectorize",
  animation: "Animation",
  media: "Video & media",
  "three-d": "3D & backgrounds",
  publishing: "Publishing & PDF",
  reference: "Photo & reference",
  "audio-accessibility": "Audio & accessibility",
  operations: "Production operations",
  "research-nc": "Non-commercial research",
};

export function categoryEnglish(categoryId: string, fallback: string): string {
  return CATEGORY_ENGLISH[categoryId] ?? fallback;
}
