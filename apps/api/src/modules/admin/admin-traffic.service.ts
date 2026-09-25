import { Inject, Injectable } from "@nestjs/common";

import { TRAFFIC_ANALYTICS_REPOSITORY, type TrafficAnalyticsRepository } from "../traffic-analytics/traffic-analytics.repository";
import { TRAFFIC_DEFAULT_RETENTION_DAYS } from "../traffic-analytics/traffic-analytics-model";

import { requireAdminUser } from "./admin-types";

const SUPPORTED_RANGES = [1, 7, 30, 90] as const;
const PULSE_CACHE_MS = 5_000;

function normalizeRangeDays(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 7;
  return SUPPORTED_RANGES.reduce((selected, candidate) =>
    Math.abs(candidate - parsed) < Math.abs(selected - parsed)
      ? candidate
      : selected,
  );
}

function bucketSeconds(days: number): number {
  if (days <= 1) return 60 * 60;
  if (days <= 7) return 6 * 60 * 60;
  return 24 * 60 * 60;
}

function retentionDays(): number {
  const parsed = Number(process.env.TRAFFIC_ANALYTICS_RETENTION_DAYS);
  if (!Number.isFinite(parsed)) return TRAFFIC_DEFAULT_RETENTION_DAYS;
  return Math.min(365, Math.max(7, Math.round(parsed)));
}

@Injectable()
export class AdminTrafficService {
  constructor(@Inject(TRAFFIC_ANALYTICS_REPOSITORY) private readonly repository: TrafficAnalyticsRepository) {}
  private pulseCache:
    | { expiresAt: number; value: Record<string, unknown> }
    | null = null;
  private pulseRequest: Promise<Record<string, unknown>> | null = null;

  async getOverview(userId: string, daysValue: unknown) {
    await requireAdminUser(userId);

    const days = normalizeRangeDays(daysValue);
    const now = new Date();
    const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1_000);
    return this.repository.overview({ start, now, days, bucketSeconds: bucketSeconds(days), retentionDays: retentionDays() });
  }

  async getPulse(userId: string) {
    await requireAdminUser(userId);

    const nowMs = Date.now();
    if (this.pulseCache && this.pulseCache.expiresAt > nowMs) {
      return this.pulseCache.value;
    }
    if (this.pulseRequest) return this.pulseRequest;

    this.pulseRequest = this.queryPulse().finally(() => {
      this.pulseRequest = null;
    });
    const value = await this.pulseRequest;
    this.pulseCache = { expiresAt: Date.now() + PULSE_CACHE_MS, value };
    return value;
  }

  private async queryPulse(): Promise<Record<string, unknown>> {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1_000);
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1_000);
    return this.repository.pulse({ fiveMinutesAgo, thirtyMinutesAgo, now });
  }
}
