import { ServiceUnavailableException } from "@nestjs/common";

/**
 * Enables only the reviewed text-only shared free pool. This must never be used
 * as a generic switch for operator-funded image, media, video, or 3D services.
 */
export function sharedFreeAiPoolEnabled(): boolean {
  return process.env.NODE_ENV === "test"
    || process.env.STUDIO_AI_FREE_POOL_ENABLED?.trim().toLowerCase() === "true";
}

/**
 * Legacy product policy for operator-funded AI. Tests retain the provider path
 * to verify its security boundaries, while production and development keep it
 * disabled even when the separate shared free text pool is enabled.
 */
export function operatorAiFundingEnabled(): boolean {
  return process.env.NODE_ENV === "test";
}

export function rejectUnavailableFreeAiPool(): void {
  if (sharedFreeAiPoolEnabled()) return;
  throw new ServiceUnavailableException({
    code: "FREE_AI_POOL_UNAVAILABLE",
    message: "자동 무료 AI가 아직 연결되지 않았습니다. 통합 AI 설정에서 개인 무료 API 키를 입력하면 계속 사용할 수 있습니다.",
    settingsHref: "/settings/ai",
    operatorFunded: false,
    freePool: true,
  });
}

export function rejectOperatorFundedAi(): void {
  if (operatorAiFundingEnabled()) return;
  throw new ServiceUnavailableException({
    code: "USER_AI_CONNECTION_REQUIRED",
    message: "운영측 AI 생성은 비활성화되어 있습니다. 통합 AI 설정에서 본인 키 또는 개인 추론 서버를 연결하세요.",
    settingsHref: "/settings/ai",
    operatorFunded: false,
  });
}
