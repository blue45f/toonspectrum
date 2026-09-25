import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminTrafficService } from "./admin-traffic.service";
import type { TrafficAnalyticsRepository } from "../traffic-analytics/traffic-analytics.repository";

const admin = vi.hoisted(() => vi.fn());
vi.mock("./admin-types", () => ({ requireAdminUser: admin }));

function fixture() {
  const repository: TrafficAnalyticsRepository = {
    persistPageView: vi.fn(), persistHeartbeat: vi.fn(), persistShareEvent: vi.fn(), cleanup: vi.fn(),
    overview: vi.fn(async () => ({ status: "live" })), pulse: vi.fn(async () => ({ activeVisitors: 3 })), checkHealth: vi.fn(async () => true),
  };
  return { repository, service: new AdminTrafficService(repository) };
}

beforeEach(() => { admin.mockReset().mockResolvedValue(undefined); });

describe("관리자 트래픽 저장소 권한 경계", () => {
  it("관리자 확인 이후 선택된 repository만 읽고 기간·응답을 유지한다", async () => {
    const { repository, service } = fixture();
    await expect(service.getOverview("admin", "8")).resolves.toEqual({ status: "live" });
    expect(admin).toHaveBeenCalledWith("admin");
    expect(repository.overview).toHaveBeenCalledWith(expect.objectContaining({ days: 7, bucketSeconds: 21600 }));
  });

  it("pulse 캐시가 있어도 권한을 다시 확인하고 권한 없으면 저장소를 호출하지 않는다", async () => {
    const { repository, service } = fixture();
    await service.getPulse("admin");
    await service.getPulse("admin");
    expect(repository.pulse).toHaveBeenCalledTimes(1);
    admin.mockRejectedValue(new Error("forbidden"));
    await expect(service.getPulse("member")).rejects.toThrow("forbidden");
    await expect(service.getOverview("member", "7")).rejects.toThrow("forbidden");
    expect(repository.pulse).toHaveBeenCalledTimes(1);
    expect(repository.overview).not.toHaveBeenCalled();
  });

  it("선택 저장소의 장애를 비어 있는 PostgreSQL 결과로 바꾸지 않는다", async () => {
    const { repository, service } = fixture();
    vi.mocked(repository.overview).mockRejectedValue(new Error("unavailable"));
    await expect(service.getOverview("admin", "1")).rejects.toThrow("unavailable");
  });
});
