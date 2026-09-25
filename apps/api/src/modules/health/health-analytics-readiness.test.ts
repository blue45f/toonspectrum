import type { ModuleRef } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";

import { TRAFFIC_ANALYTICS_REPOSITORY } from "../traffic-analytics/traffic-analytics.repository";

import { HealthService } from "./health.service";

function service(store: string, checkHealth = vi.fn(async () => true), registered = true) {
  const get = vi.fn(() => {
    if (!registered) throw new Error("missing provider");
    return { checkHealth };
  });
  return { get, checkHealth, service: new HealthService(
    { isDatabaseReachable: async () => true, isSchemaReady: async () => true },
    { isStudioLivePostgresNamespaceReady: () => true },
    { TRAFFIC_ANALYTICS_STORE: store }, undefined, undefined, undefined,
    { get } as unknown as ModuleRef,
  ) };
}

describe("선택된 분석 저장소 readiness", () => {
  it("postgres 모드에서는 D1을 호출하지 않는다", async () => {
    const target = service("postgres");
    expect((await target.service.checkReadiness()).ready).toBe(true);
    expect(target.get).not.toHaveBeenCalled();
  });
  it("d1 모드에서는 실제 수집 repository의 schema·권한을 검사한다", async () => {
    const target = service("d1");
    expect((await target.service.checkReadiness()).ready).toBe(true);
    expect(target.get).toHaveBeenCalledWith(TRAFFIC_ANALYTICS_REPOSITORY, { strict: false });
    expect(target.checkHealth).toHaveBeenCalledTimes(1);
  });
  it("누락된 repository를 운영 준비 완료로 보고하지 않는다", async () => {
    const target = service("d1", undefined, false);
    expect(await target.service.checkReadiness()).toMatchObject({ ready: false, schema: false });
  });
  it("외부 오류를 공개 결과에 노출하지 않고 readiness를 실패시킨다", async () => {
    const target = service("d1", vi.fn(async () => { throw new Error("private SQL details"); }));
    const result = await target.service.checkReadiness();
    expect(result).toMatchObject({ ready: false, database: true, schema: false });
    expect(JSON.stringify(result)).not.toContain("private");
  });
});
