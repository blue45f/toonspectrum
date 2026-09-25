type SqlValue = string | number | null;
type Statement = { sql: string; params: SqlValue[] };
interface PreparedStatement {
  bind(...values: SqlValue[]): PreparedStatement;
}
export interface AnalyticsEnvironment {
  ANALYTICS_RPC_TOKEN: string;
  ANALYTICS_DB: {
    prepare(sql: string): PreparedStatement;
    batch(statements: PreparedStatement[]): Promise<Array<{
      success: boolean;
      results: Record<string, unknown>[];
      meta: Record<string, unknown>;
    }>>;
  };
}

const MAX_BODY_BYTES = 262_144;
const MAX_RPC_TOKEN_LENGTH = 4_096;
const MAX_SQL_BYTES = 50_000;
const encoder = new TextEncoder();
const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff" };

function response(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers });
}

async function authorized(request: Request, secret: string): Promise<boolean> {
  if (!secret || secret.length < 32 || secret.length > MAX_RPC_TOKEN_LENGTH || /\s/u.test(secret)) return false;
  const supplied = request.headers.get("authorization") ?? "";
  if (supplied.length > MAX_RPC_TOKEN_LENGTH + "Bearer ".length) return false;
  const [actual, expected] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(supplied)),
    crypto.subtle.digest("SHA-256", encoder.encode(`Bearer ${secret}`)),
  ]);
  // 고정 길이 digest를 비교하여 토큰의 일치 접두사에 따라 조기 종료하지 않는다.
  const left = new Uint8Array(actual);
  const right = new Uint8Array(expected);
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left[index] ^ right[index];
  return mismatch === 0;
}

async function readBoundedJson(request: Request): Promise<unknown> {
  if (!request.body) throw new Error("missing body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error("body too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

function isStatement(value: unknown): value is Statement {
  if (!value || typeof value !== "object") return false;
  const statement = value as Partial<Statement>;
  return typeof statement.sql === "string"
    && statement.sql.length > 0 && statement.sql.length <= MAX_SQL_BYTES
    && encoder.encode(statement.sql).byteLength <= MAX_SQL_BYTES
    && /^(?:SELECT|WITH|INSERT|UPDATE|DELETE)\b/iu.test(statement.sql.trim())
    // 이 경로는 신뢰된 Core의 분석 DML만 실행한다. DDL은 승인형 provision 경로에 남긴다.
    && !/;|--|\/\*|\b(?:PRAGMA|ATTACH|DETACH|CREATE|DROP|ALTER|VACUUM|REINDEX|load_extension)\b/iu.test(statement.sql)
    && Array.isArray(statement.params) && statement.params.length <= 100
    && statement.params.every((item) => item === null
      || (typeof item === "number" && Number.isFinite(item))
      || (typeof item === "string" && item.length <= 16_384));
}

export async function handleAnalyticsRequest(request: Request, env: AnalyticsEnvironment): Promise<Response> {
  const url = new URL(request.url);
  if (url.protocol !== "https:") return response({ error: "https_required" }, 400);
  if (!await authorized(request, env.ANALYTICS_RPC_TOKEN)) return response({ error: "unauthorized" }, 401);
  if (url.pathname === "/health/live" && request.method === "GET") return response({ status: "ok" });
  if (url.pathname !== "/query" || url.search) return response({ error: "not_found" }, 404);
  if (request.method !== "POST") return response({ error: "method_not_allowed" }, 405);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    return response({ error: "invalid_content_type" }, 415);
  }
  let statements: Statement[];
  try {
    const body = await readBoundedJson(request);
    if (!body || typeof body !== "object" || !("statements" in body)
      || !Array.isArray(body.statements) || body.statements.length < 1 || body.statements.length > 32
      || !body.statements.every(isStatement)) return response({ error: "invalid_request" }, 400);
    statements = body.statements;
  } catch {
    return response({ error: "invalid_request" }, 400);
  }
  try {
    // D1 batch는 전부 성공하거나 롤백된다. 결과 불명확한 쓰기는 여기서 재시도하지 않는다.
    const results = await env.ANALYTICS_DB.batch(statements.map(({ sql, params }) =>
      env.ANALYTICS_DB.prepare(sql).bind(...params)));
    if (results.length !== statements.length || results.some((result) => !result.success)) {
      return response({ error: "storage_unavailable" }, 503);
    }
    return response({ results: results.map(({ results: rows, meta }) => ({ results: rows, meta })) });
  } catch {
    // 공급자 오류에는 SQL·식별자·토큰이 포함될 수 있으므로 응답/로그에 복사하지 않는다.
    return response({ error: "storage_unavailable" }, 503);
  }
}

export default { fetch: handleAnalyticsRequest };
