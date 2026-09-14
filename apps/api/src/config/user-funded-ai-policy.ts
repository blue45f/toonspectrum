import { ServiceUnavailableException } from "@nestjs/common";

/** Product policy, deliberately not an environment toggle. User credentials never enter this API. */
export function operatorAiFundingEnabled(): boolean { return false; }
export function rejectOperatorFundedAi(): void {
  throw new ServiceUnavailableException({ code: "USER_AI_CONNECTION_REQUIRED", message:
    "운영측 AI 생성은 비활성화되어 있습니다. 통합 AI 설정에서 본인 키 또는 개인 추론 서버를 연결하세요.",
    settingsHref: "/settings/ai", operatorFunded: false });
}
