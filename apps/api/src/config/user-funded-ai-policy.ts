import { ServiceUnavailableException } from "@nestjs/common";

/**
 * Product policy, not an operator feature flag. Production and development never spend service
 * credentials. Unit/integration tests retain the legacy provider path only to regression-test its
 * security, idempotency and quota boundaries without shipping an executable operator-funded route.
 */
export function operatorAiFundingEnabled(): boolean {
  return process.env.NODE_ENV === "test";
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
