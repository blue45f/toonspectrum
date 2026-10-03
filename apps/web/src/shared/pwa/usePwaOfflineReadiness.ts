import { useCallback, useEffect, useRef, useState } from "react";

import {
  STUDIO_OFFLINE_PREPARE_MESSAGE,
  STUDIO_OFFLINE_STATUS_MESSAGE,
  type StudioOfflineReadinessReport,
} from "@/shared/lib/studio-offline-protocol";
import { STUDIO_SERVICE_WORKER_CACHE_PREFIX } from "@/app/service-worker/studio-service-worker-policy";

export type PwaOfflineReadiness =
  | "unknown"
  | "checking"
  | "unsupported"
  | "ready"
  | "partial"
  | "empty"
  | "preparing"
  | "failed";

export interface PwaOfflineReadinessSnapshot {
  readonly readiness: PwaOfflineReadiness;
  /** 캐시에 들어 있는 리소스 수 (추정치) */
  readonly cachedResources: number | null;
}

function isStudioRoutePathname(pathname: string): boolean {
  return pathname === "/studio" || pathname.startsWith("/studio/");
}

function messageActiveWorker<T>(type: string, payload?: Record<string, unknown>): Promise<T | undefined> {
  const controller = navigator.serviceWorker?.controller;
  if (!controller) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => resolve(undefined), 6_000);
    channel.port1.onmessage = (event: MessageEvent) => {
      window.clearTimeout(timer);
      resolve(event.data as T);
    };
    controller.postMessage({ type, ...payload }, [channel.port2]);
  });
}

async function countOwnedCacheEntries(): Promise<number | null> {
  try {
    if (!("caches" in window)) return null;
    const keys = await caches.keys();
    const owned = keys.filter(
      (key) =>
        key.startsWith(STUDIO_SERVICE_WORKER_CACHE_PREFIX)
        || key.startsWith("toonstudio-pwa-")
        || key.startsWith("toonstudio-covers-"),
    );
    let total = 0;
    for (const key of owned) {
      try {
        total += (await (await caches.open(key)).keys()).length;
      } catch {
        // 개별 캐시 읽기 실패는 무시
      }
    }
    return total;
  } catch {
    return null;
  }
}

/**
 * 오프라인 준비 상태를 조회하고, 필요하면 SW에 오프라인 팩 준비를 요청한다.
 * SW 메시지 수신은 /studio 경로에서만 허용되므로, 그 외 경로에서는
 * Cache Storage 직접 조회로 폴백한다.
 */
export function usePwaOfflineReadiness() {
  const [snapshot, setSnapshot] = useState<PwaOfflineReadinessSnapshot>({
    readiness: "unknown",
    cachedResources: null,
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!("serviceWorker" in navigator)) {
      setSnapshot({ readiness: "unsupported", cachedResources: null });
      return;
    }
    setSnapshot((previous) => ({ ...previous, readiness: "checking" }));

    // 1) /studio 경로에서는 SW에 직접 준비 상태를 묻는다.
    if (isStudioRoutePathname(window.location.pathname)) {
      const report = await messageActiveWorker<StudioOfflineReadinessReport>(
        STUDIO_OFFLINE_STATUS_MESSAGE,
      );
      if (report && typeof report.ready === "boolean") {
        const cached = await countOwnedCacheEntries();
        if (mountedRef.current) {
          setSnapshot({
            readiness: report.ready ? "ready" : "partial",
            cachedResources: cached,
          });
        }
        return;
      }
    }

    // 2) 폴백: Cache Storage에 우리 캐시가 있고 항목이 있으면 partial 이상으로 본다.
    // 확인이 끝났는데도 "unknown"으로 남기면 화면이 영원히 "확인 중"으로 보인다 —
    // 빈 결과는 빈 상태(empty)로 확정한다.
    const cached = await countOwnedCacheEntries();
    if (mountedRef.current) {
      setSnapshot({
        readiness: cached !== null && cached > 0 ? "partial" : "empty",
        cachedResources: cached,
      });
    }
  }, []);

  const prepare = useCallback(async (): Promise<boolean> => {
    if (!isStudioRoutePathname(window.location.pathname)) return false;
    setSnapshot((previous) => ({ ...previous, readiness: "preparing" }));
    // URL 목록은 SW가 빌드 매니페스트 기준으로 자동 구성한다.
    const result = await messageActiveWorker<{ ok?: boolean }>(
      STUDIO_OFFLINE_PREPARE_MESSAGE,
      { urls: [] as string[] },
    );
    const ok = result?.ok === true;
    if (mountedRef.current) {
      // 준비가 끝난 뒤에는 캐시 수를 다시 세야 배지 숫자가 준비 전 값으로 남지 않는다.
      const cached = ok ? await countOwnedCacheEntries() : null;
      setSnapshot((previous) => ({
        ...previous,
        readiness: ok ? "ready" : "failed",
        ...(ok ? { cachedResources: cached } : {}),
      }));
    }
    return ok;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...snapshot, refresh, prepare };
}
