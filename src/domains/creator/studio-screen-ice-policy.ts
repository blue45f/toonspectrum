import {
  acquireStudioVoiceIcePolicyLease,
  type StudioVoiceIcePolicyLease,
  type StudioVoiceIcePolicyLeaseDependencies,
} from "./studio-voice-ice-policy";

import {
  StudioVoiceIcePolicyResponseSchema,
  type StudioVoiceIcePolicyMode,
} from "@/lib/studio-voice-ice-policy-contract";
import { api, toApiError } from "@/src/infrastructure/api";

const STUDIO_SCREEN_ICE_REQUEST_TIMEOUT_MS = 10_000;

export type StudioScreenIcePolicyMode = StudioVoiceIcePolicyMode;
export type StudioScreenIcePolicyLease = StudioVoiceIcePolicyLease;
export type StudioScreenIcePolicyLeaseDependencies =
  StudioVoiceIcePolicyLeaseDependencies;

async function loadStudioScreenIcePolicy(
  workId: string,
  signal?: AbortSignal
) {
  try {
    const response = await api.get<unknown>(
      `/creator/works/${encodeURIComponent(workId)}/screen-share/ice`,
      { signal, timeout: STUDIO_SCREEN_ICE_REQUEST_TIMEOUT_MS }
    );
    const parsed = StudioVoiceIcePolicyResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new Error("서버가 안전한 화면 공유 연결 설정을 반환하지 않았습니다.");
    }
    return parsed.data;
  } catch (error) {
    throw await toApiError(error, "화면 공유 연결 설정을 불러오지 못했습니다.");
  }
}

/**
 * Reuses the rotating, authenticated WebRTC lease implementation while keeping screen-share
 * authorization and rate limiting on a dedicated server endpoint. This prevents read-only
 * screen viewers from accidentally inheriting voice-call permission.
 */
export function acquireStudioScreenIcePolicyLease(
  workId: string,
  dependencies: StudioScreenIcePolicyLeaseDependencies = {}
): Promise<StudioScreenIcePolicyLease> {
  return acquireStudioVoiceIcePolicyLease(workId, {
    ...dependencies,
    loadPolicy: dependencies.loadPolicy ?? loadStudioScreenIcePolicy,
  });
}
