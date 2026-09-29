import type {
  CreatorAnalyticsPeriod,
  CreatorAnalyticsResponse,
} from "./creator-analytics.dto";
import { buildMockCreatorAnalytics } from "./creator-analytics.mock";
import { parseAnalyticsPeriod } from "./creator-analytics.math";

/** 잘못된 period 쿼리에 대한 400 에러. HTTP 어댑터가 statusCode 로 매핑한다. */
export class CreatorAnalyticsBadRequestError extends Error {
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = "CreatorAnalyticsBadRequestError";
  }
}

// PUBLISH T3: 창작자 애널리틱스 서비스.
// 현재는 목 데이터를 반환한다. 실제 집계 파이프라인이 붙으면 getAnalytics
// 내부만 교체하고 라우트·DTO·웹 클라이언트는 그대로 둔다.
// NestJS 런타임이 복원되면 @Injectable()으로 감싸 @Controller("creator/analytics")에 주입한다.
export class CreatorAnalyticsService {
  getAnalytics(
    periodRaw: unknown,
    seriesId?: string,
  ): CreatorAnalyticsResponse {
    const period = this.requirePeriod(periodRaw);
    return buildMockCreatorAnalytics(period, seriesId);
  }

  private requirePeriod(periodRaw: unknown): CreatorAnalyticsPeriod {
    const period = parseAnalyticsPeriod(periodRaw);
    if (period == null) {
      throw new CreatorAnalyticsBadRequestError(
        "period 는 7d, 30d, 90d 중 하나여야 해요.",
      );
    }
    return period;
  }
}
