import { ServiceUnavailableException } from "@nestjs/common";

export interface TrafficD1Statement {
  readonly sql: string;
  readonly params: readonly (string | number | null)[];
}
export interface TrafficD1Result {
  readonly results: readonly Record<string, unknown>[];
}
export interface TrafficD1Executor {
  execute(statements: readonly TrafficD1Statement[]): Promise<readonly TrafficD1Result[]>;
}
export interface TrafficD1Config {
  readonly url: string;
  readonly token: string;
  readonly timeoutMs: number;
}

export function trafficD1Unavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: "TRAFFIC_ANALYTICS_UNAVAILABLE",
    message: "트래픽 분석 저장소를 사용할 수 없습니다.",
  });
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function resolveTrafficD1Config(environment: Readonly<Record<string, string | undefined>>): TrafficD1Config {
  const fail = (): never => { throw new Error("트래픽 분석 D1 설정이 올바르지 않습니다."); };
  let url: URL;
  try { url = new URL(environment.TRAFFIC_ANALYTICS_D1_RPC_URL ?? ""); }
  catch { return fail(); }
  const token = environment.TRAFFIC_ANALYTICS_D1_RPC_TOKEN?.trim();
  const timeoutMs = Number(environment.TRAFFIC_ANALYTICS_D1_TIMEOUT_MS ?? 5_000);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash
    || url.pathname !== "/query" || !token || token.length < 32 || token.length > 4_096
    || /\s/u.test(token) || !Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) return fail();
  return { url: url.href, token, timeoutMs };
}

/** 서버 전용 Worker RPC. 응답 본문·URL·토큰·하위 오류를 오류 메시지에 포함하지 않는다. */
export class TrafficD1HttpExecutor implements TrafficD1Executor {
  constructor(private readonly config: TrafficD1Config, private readonly network: typeof fetch = globalThis.fetch) {}

  async execute(statements: readonly TrafficD1Statement[]): Promise<readonly TrafficD1Result[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      // 처리 여부가 불명확한 쓰기는 재시도하지 않는다. 리디렉션에도 서버 토큰을 전달하지 않는다.
      const response = await this.network(this.config.url, {
        method: "POST", redirect: "error", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.config.token}` },
        body: JSON.stringify({ statements }),
      });
      if (response.status !== 200 || !response.body) throw trafficD1Unavailable();
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 1_048_576) { await reader.cancel(); throw trafficD1Unavailable(); }
          chunks.push(chunk.value);
        }
      } finally { reader.releaseLock(); }
      const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!record(body) || !Array.isArray(body.results) || body.results.length !== statements.length) throw trafficD1Unavailable();
      const results: TrafficD1Result[] = [];
      for (const result of body.results) {
        if (!record(result) || !Array.isArray(result.results) || !result.results.every(record)) throw trafficD1Unavailable();
        results.push({ results: result.results });
      }
      return results;
    } catch {
      throw trafficD1Unavailable();
    } finally { clearTimeout(timer); }
  }
}
