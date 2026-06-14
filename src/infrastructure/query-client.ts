// 공유 react-query 클라이언트 — 손수 만든 useApiResource 페칭을 대체한다.
// 기본 옵션은 기존 useApiResource 동작(마운트마다 1회 fetch, 자동 refetch 없음, 재시도 없음)을
// 그대로 보존하도록 설정한다. 캐시 재사용/백그라운드 refetch가 기존 동작과 어긋나지 않게 한다.
import { QueryClient } from "@tanstack/react-query";

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // 기존 useApiResource 는 마운트(라우트 진입)마다 새 fetch 를 돌리고 스켈레톤을 보였다.
        // gcTime:0 으로 언마운트 즉시 캐시를 버려, 재진입 시 캐시된 데이터로 스켈레톤을 건너뛰지
        // 않게 한다(깜빡임/stale 데이터 방지 = 기존과 동일하게 매번 신선 로드).
        gcTime: 0,
        // staleTime:0 + 아래 refetch 비활성으로, 같은 마운트 안에서는 자동 refetch 가 없다.
        staleTime: 0,
        // 기존 fetch 는 창 포커스/재연결/마운트 자동 refetch 가 전혀 없었다 — 모두 끈다.
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: true,
        refetchInterval: false,
        // 기존 fetch 는 재시도가 없었다(크롤/수집 같은 비멱등 요청 포함) — 재시도 0.
        retry: false,
      },
    },
  });
}
