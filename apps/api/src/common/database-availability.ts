import { Logger } from "@nestjs/common";

const logger = new Logger("SchemaPreflight");

/**
 * 부팅 시점 스키마 프리플라이트가 "DB에 도달할 수 없음"과 "스키마 계약 위반"을 구분하게 한다.
 * 스키마 불일치는 기존대로 fail-closed(부팅 거부)지만, Neon 컴퓨트 쿼터 소진(53000)·연결
 * 장애 같은 가용성 오류로 프로세스가 죽으면 파일 기반 카탈로그까지 전면 중단되므로,
 * 가용성 오류는 경고 후 부팅을 계속해 요청 단위로만 실패하게 한다.
 */
const PG_AVAILABILITY_SQLSTATES: ReadonlySet<string> = new Set([
  // Class 08 — Connection Exception
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
  "08007",
  // Class 53 — Insufficient Resources (Neon compute quota 포함)
  "53000",
  "53100",
  "53200",
  "53300",
  "53400",
  // Class 57 — Operator Intervention (종료/시작 중)
  "57P01",
  "57P02",
  "57P03",
]);

const NODE_NETWORK_ERROR_CODES: ReadonlySet<string> = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
]);

// 코드가 없는 pg 종료 오류(예: "Connection terminated unexpectedly")의 최소 커버.
const DATABASE_UNAVAILABLE_MESSAGE_RE =
  /connection terminated|connection refused|timeout expired|socket hang up|the database system is starting up/iu;

function extractErrorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && code.length > 0 ? code : undefined;
}

export function isDatabaseAvailabilityError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const code = extractErrorCode(error);
  if (
    code != null &&
    (PG_AVAILABILITY_SQLSTATES.has(code) || NODE_NETWORK_ERROR_CODES.has(code))
  ) {
    return true;
  }
  if (code != null) return false; // 알 수 없는 SQLSTATE/errno는 보수적으로 가용성 오류가 아니라 본다.

  const causeCode = extractErrorCode((error as { cause?: unknown }).cause);
  if (
    causeCode != null &&
    (PG_AVAILABILITY_SQLSTATES.has(causeCode) || NODE_NETWORK_ERROR_CODES.has(causeCode))
  ) {
    return true;
  }

  return DATABASE_UNAVAILABLE_MESSAGE_RE.test(error.message);
}

export async function runSchemaPreflightToleratingDbUnavailability(
  preflightName: string,
  run: () => Promise<void>
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (!isDatabaseAvailabilityError(error)) throw error;
    logger.warn(
      `${preflightName}: 데이터베이스에 접근할 수 없어 부팅을 계속합니다 — 해당 기능은 요청 단위로 실패합니다. 원인: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
