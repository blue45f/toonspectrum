import { useEffect, useState } from "react";

import { api } from "@/src/infrastructure/api";

// 런타임 앱 설정(GET /api/config). 광고형 수익화 on/off 등 전역 토글을 읽는다.
// 기본값은 전부 비활성(수익화 OFF = 광고 없음). 관리자가 켜기 전까지 아무것도 노출하지 않는다.
export interface AppConfig {
  monetizationEnabled: boolean;
}

const DEFAULTS: AppConfig = { monetizationEnabled: false };

// 모듈 스코프 캐시 — 앱 전체에서 한 번만 fetch한다. 여러 컴포넌트가 동시에 마운트돼도
// 같은 in-flight 프로미스를 공유하므로 재요청이 발생하지 않는다.
let cached: AppConfig | null = null;
let inflight: Promise<AppConfig> | null = null;

function loadAppConfig(): Promise<AppConfig> {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;
  inflight = api
    .get<Partial<AppConfig>>("/config")
    .then((payload) => {
      cached = {
        ...DEFAULTS,
        monetizationEnabled: payload?.monetizationEnabled === true,
      };
      return cached;
    })
    .catch(() => {
      // 실패 시에도 안전한 기본값(수익화 OFF)으로 고정 — 광고가 잘못 노출되지 않게 한다.
      cached = DEFAULTS;
      return cached;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

// useAppConfig() — /api/config를 (모듈 캐시로) 단 한 번만 읽어 전역 토글을 반환한다.
// 로드 전에는 monetizationEnabled=false(안전 기본값)로 둔다.
export function useAppConfig(): { monetizationEnabled: boolean; loading: boolean } {
  const [config, setConfig] = useState<AppConfig | null>(cached);

  useEffect(() => {
    if (config) return;
    let alive = true;
    loadAppConfig().then((next) => {
      if (alive) setConfig(next);
    });
    return () => {
      alive = false;
    };
  }, [config]);

  return {
    monetizationEnabled: config?.monetizationEnabled ?? false,
    loading: config === null,
  };
}
