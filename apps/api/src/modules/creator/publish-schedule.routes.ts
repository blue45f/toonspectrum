/**
 * 연재 예약 발행 스케줄러 — HTTP 엔드포인트 라우터.
 *
 * 프레임워크에 의존하지 않는 순수 함수 라우터다. Express·Fastify·Cloudflare
 * Workers 등 어떤 HTTP 계층에서도 `handleRequest`에 메서드·경로·쿼리·본문을
 * 넘겨 마운트할 수 있다.
 *
 * - POST   /api/publish-schedules                  예약 생성
 * - GET    /api/publish-schedules (?seriesId=)     예약 목록
 * - GET    /api/publish-schedules/:id              예약 단건 조회
 * - PATCH  /api/publish-schedules/:id              예약 수정
 * - DELETE /api/publish-schedules/:id              예약 취소
 * - POST   /api/publish-schedules/:id/retry        실패 예약 수동 재시도
 * - POST   /api/publish-schedules/queue/collect-due       도래분 수집(큐 워커용)
 * - POST   /api/publish-schedules/:id/mark-published      발행 성공 기록(큐 워커용)
 * - POST   /api/publish-schedules/:id/mark-failed         발행 실패 기록(큐 워커용)
 */
import {
  PublishScheduleError,
  PublishScheduleService,
} from "./publish-schedule.service";

export interface PublishScheduleHttpRequest {
  readonly method: string;
  readonly path: string;
  readonly query?: Readonly<Record<string, string | string[] | undefined>>;
  readonly body?: unknown;
}

export interface PublishScheduleHttpResponse {
  readonly status: number;
  readonly body: unknown;
}

interface RouteMatch {
  readonly action:
    | "create"
    | "list"
    | "get"
    | "update"
    | "cancel"
    | "retry"
    | "collect-due"
    | "mark-published"
    | "mark-failed";
  readonly id?: string;
}

const BASE_PREFIX = "/api/publish-schedules";

function matchRoute(method: string, path: string): RouteMatch | null {
  const normalizedPath = path.split("?")[0] ?? "";
  if (!normalizedPath.startsWith(BASE_PREFIX)) return null;
  const rest = normalizedPath.slice(BASE_PREFIX.length);
  const segments = rest.split("/").filter((segment) => segment.length > 0);
  const upperMethod = method.toUpperCase();

  if (segments.length === 0) {
    if (upperMethod === "POST") return { action: "create" };
    if (upperMethod === "GET") return { action: "list" };
    return null;
  }
  if (segments.length === 2 && segments[0] === "queue" && segments[1] === "collect-due") {
    return upperMethod === "POST" ? { action: "collect-due" } : null;
  }
  if (segments.length === 1) {
    const [id] = segments;
    if (upperMethod === "GET") return { action: "get", id };
    if (upperMethod === "PATCH") return { action: "update", id };
    if (upperMethod === "DELETE") return { action: "cancel", id };
    return null;
  }
  if (segments.length === 2 && upperMethod === "POST") {
    const [id, verb] = segments;
    if (verb === "retry") return { action: "retry", id };
    if (verb === "mark-published") return { action: "mark-published", id };
    if (verb === "mark-failed") return { action: "mark-failed", id };
  }
  return null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asOptionalString(
  query: Readonly<Record<string, string | string[] | undefined>> | undefined,
  name: string,
): string | undefined {
  const value = query?.[name];
  if (typeof value === "string" && value) return value;
  if (Array.isArray(value) && typeof value[0] === "string" && value[0]) {
    return value[0];
  }
  return undefined;
}

function asRecord(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return {};
}

function ok(data: unknown, status = 200): PublishScheduleHttpResponse {
  return { status, body: { ok: true, data } };
}

function fail(error: unknown): PublishScheduleHttpResponse {
  if (error instanceof PublishScheduleError) {
    return {
      status: error.status,
      body: { ok: false, code: error.code, message: error.message },
    };
  }
  return {
    status: 500,
    body: { ok: false, code: "INTERNAL_ERROR", message: "일시적인 오류가 발생했어요." },
  };
}

/**
 * 예약 발행 스케줄러 라우터를 만든다. 서비스 인스턴스를 주입하지 않으면
 * 프로세스 내 단일 인스턴스를 사용한다.
 */
export function createPublishScheduleRouter(service?: PublishScheduleService) {
  const schedules = service ?? new PublishScheduleService();

  function handleRequest(request: PublishScheduleHttpRequest): PublishScheduleHttpResponse {
    const route = matchRoute(request.method, request.path);
    if (!route) {
      return {
        status: 404,
        body: { ok: false, code: "NOT_FOUND", message: "엔드포인트를 찾을 수 없어요." },
      };
    }
    const body = asRecord(request.body);
    try {
      switch (route.action) {
        case "create":
          return ok(
            schedules.create({
              seriesId: asString(body.seriesId),
              episodeId: asString(body.episodeId),
              episodeTitle: asString(body.episodeTitle),
              scheduledAtUtc: asString(body.scheduledAtUtc),
              timeZone: asString(body.timeZone),
              allowConflict: body.allowConflict === true,
            }),
            201,
          );
        case "list":
          return ok(schedules.list(asOptionalString(request.query, "seriesId")));
        case "get":
          return ok(schedules.get(asString(route.id)));
        case "update":
          return ok(
            schedules.update(asString(route.id), {
              scheduledAtUtc: asString(body.scheduledAtUtc),
              timeZone: asString(body.timeZone),
              allowConflict: body.allowConflict === true,
            }),
          );
        case "cancel":
          return ok(schedules.cancel(asString(route.id)));
        case "retry":
          return ok(schedules.retry(asString(route.id)));
        case "collect-due":
          return ok(schedules.collectDue());
        case "mark-published":
          return ok(schedules.markPublished(asString(route.id)));
        case "mark-failed":
          return ok(
            schedules.markFailed(asString(route.id), asString(body.error)),
          );
        default:
          return {
            status: 404,
            body: {
              ok: false,
              code: "NOT_FOUND",
              message: "엔드포인트를 찾을 수 없어요.",
            },
          };
      }
    } catch (error) {
      return fail(error);
    }
  }

  return { handleRequest };
}
