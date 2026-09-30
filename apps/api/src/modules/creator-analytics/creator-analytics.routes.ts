import type { CreatorAnalyticsResponse } from "./creator-analytics.dto";
import {
  CreatorAnalyticsBadRequestError,
  CreatorAnalyticsService,
} from "./creator-analytics.service";

/**
 * 창작자 애널리틱스 HTTP 엔드포인트 정의.
 *
 *   GET /api/creator/analytics?period=30d&seriesId=<id>
 *
 * 프레임워크에 구애받지 않는 순수 핸들러다. NestJS 런타임이 복원되면
 * `@Controller("creator/analytics")` + `@Get()` 메서드가 이 핸들러에 위임한다.
 * PUBLISH T3: 목 데이터로 시작, 실제 집계는 후속 작업.
 */

export const CREATOR_ANALYTICS_ROUTE_PATH = "/api/creator/analytics";

export interface CreatorAnalyticsHttpResult {
  status: number;
  body: CreatorAnalyticsResponse | { message: string };
}

const service = new CreatorAnalyticsService();

export function handleCreatorAnalyticsRequest(query: {
  period?: unknown;
  seriesId?: unknown;
}): CreatorAnalyticsHttpResult {
  const seriesId =
    typeof query.seriesId === "string" && query.seriesId.trim().length > 0
      ? query.seriesId.trim()
      : undefined;
  try {
    return {
      status: 200,
      body: service.getAnalytics(query.period, seriesId),
    };
  } catch (error) {
    if (error instanceof CreatorAnalyticsBadRequestError) {
      return { status: error.statusCode, body: { message: error.message } };
    }
    throw error;
  }
}
