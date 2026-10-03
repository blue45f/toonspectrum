/**
 * 사용자 AI 연결의 실제 유효성 검증(프로브).
 *
 * 지금까지 키 허브는 형식(길이)만 확인해서, 잘못된 키도 "연결됨"으로 보였다.
 * 여기서 브라우저가 사용자 본인의 제공자 주소로 직접 최소 호출(GET /models)을
 * 보내 실제 응답으로 판정한다. 키는 사용자가 지정한 제공자 origin으로만 가고
 * 우리 서버로는 절대 전송하지 않으며, 결과 객체에도 키를 담지 않는다.
 *
 * 판정은 보수적으로 한다: 200만 "확인됨"이고, 401/403만 "키 거절"이다.
 * 그 외 상태·네트워크 실패는 주소/CORS/제공자 사정일 수 있어 단정하지 않는다.
 */
import {
  userAiConnectionApiKeys,
  type UserAiConnection,
} from "./user-ai-types";

export const USER_AI_PROBE_TIMEOUT_MS = 8_000;

export type UserAiConnectionProbeResult =
  | { readonly status: "ok"; readonly modelCount: number | null }
  | { readonly status: "unauthorized" }
  | { readonly status: "http_error"; readonly httpStatus: number }
  | { readonly status: "unreachable" }
  | { readonly status: "no_key" }
  | { readonly status: "invalid_url" };

type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

export async function probeUserAiConnection(
  connection: UserAiConnection,
  fetchImpl: FetchImpl = (input, init) => fetch(input, init),
): Promise<UserAiConnectionProbeResult> {
  const key = userAiConnectionApiKeys(connection)[0]?.apiKey.trim();
  if (!key) return { status: "no_key" };

  let base: URL;
  try {
    base = new URL(connection.baseUrl.trim());
  } catch {
    return { status: "invalid_url" };
  }
  if (base.protocol !== "https:" && base.protocol !== "http:") {
    return { status: "invalid_url" };
  }
  const modelsUrl = `${base.toString().replace(/\/+$/, "")}/models`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), USER_AI_PROBE_TIMEOUT_MS);
  try {
    const response = await fetchImpl(modelsUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    if (response.ok) {
      let modelCount: number | null = null;
      try {
        const body: unknown = await response.json();
        if (typeof body === "object" && body !== null && Array.isArray((body as { data?: unknown }).data)) {
          modelCount = (body as { data: unknown[] }).data.length;
        }
      } catch {
        // 본문이 JSON이 아니어도 200이면 연결 자체는 확인된 것이다.
      }
      return { status: "ok", modelCount };
    }
    if (response.status === 401 || response.status === 403) {
      return { status: "unauthorized" };
    }
    return { status: "http_error", httpStatus: response.status };
  } catch {
    // 네트워크 실패·CORS 차단·타임아웃은 키 문제로 단정할 수 없다.
    return { status: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

/** 프로브 결과를 카드에 보여줄 문구로 바꾼다. 키 값은 어떤 경우에도 포함하지 않는다. */
export function userAiProbeResultMessage(result: UserAiConnectionProbeResult): string {
  switch (result.status) {
    case "ok":
      return result.modelCount !== null
        ? `연결 확인됨 · 모델 ${result.modelCount}개 응답`
        : "연결 확인됨";
    case "unauthorized":
      return "키가 거절됐어요 — 키가 맞는지, 만료되지 않았는지 확인하세요";
    case "http_error":
      return `제공자가 오류를 돌려줬어요 (HTTP ${result.httpStatus}) — 주소와 키를 확인하세요`;
    case "unreachable":
      return "제공자에 닿지 못했어요 — 주소·네트워크·브라우저 차단(CORS)을 확인하세요";
    case "no_key":
      return "사용할 수 있는 키가 없어요";
    case "invalid_url":
      return "제공자 주소가 올바르지 않아요";
  }
}
