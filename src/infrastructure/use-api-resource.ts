import { useQuery } from "@tanstack/react-query";

import { api } from "@/src/infrastructure/api";

// 404 를 흐름 제어(notFound)로 다루기 위한 센티넬 에러. 일반 에러와 구분한다.
class NotFoundError extends Error {
  constructor() {
    super("not-found");
    this.name = "NotFoundError";
  }
}

/**
 * 클라이언트 데이터 페칭 훅. 내부 구현은 react-query(useQuery)이지만,
 * 호출부 계약({ data, loading, error, notFound, reload })은 손수 만들었던 구현과 동일하게 유지한다.
 *
 * 동작 보존:
 * - url 이 null 이면 쿼리를 비활성화(enabled:false)하고 data:null, loading:false 를 돌려준다(기존과 동일).
 * - loading 은 "요청 진행 중"(isFetching) — 기존 useApiResource 가 매 fetch 마다 setLoading(true) 한 것과 동일.
 *   탐색/캘린더/프로필/리뷰의 갱신 버튼 스피너가 reload 중에도 도는 동작을 보존한다.
 * - 404 는 notFound:true + data:null(기존: 404 응답을 null 로 처리하고 notFound 플래그 설정).
 * - 그 외 비-OK 응답/네트워크 오류는 error(문자열 메시지)로 처리. 메시지는 errorMessage 로 통일(기존과 동일).
 * - reload() 는 강제 refetch(기존: reloadKey 증가로 effect 재실행).
 * - 자동 refetch(창 포커스/재연결/주기/마운트 캐시 재사용)는 query-client 기본 옵션에서 모두 비활성.
 */
export function useApiResource<T>(url: string | null, errorMessage: string) {
  const query = useQuery<T, Error>({
    queryKey: ["api-resource", url],
    enabled: Boolean(url),
    queryFn: async ({ signal }) => {
      // 전체 URL 그대로 호출(api.raw = prefix 없는 ky). 404 는 notFound, 그 외 에러는 errorMessage 로 처리.
      const response = await api.raw(url as string, {
        cache: "no-store",
        signal,
        throwHttpErrors: false,
      });
      if (response.status === 404) throw new NotFoundError();
      if (!response.ok) throw new Error(errorMessage);
      return (await response.json()) as T;
    },
  });

  const notFound = query.error instanceof NotFoundError;

  return {
    data: query.data ?? null,
    // url 이 없으면(쿼리 비활성) loading 은 항상 false — 기존 초기값 Boolean(url) 과 동일.
    loading: Boolean(url) && query.isFetching,
    // notFound 는 error 메시지로 노출하지 않는다(기존: 404 는 error 가 아니라 notFound).
    error: notFound ? null : (query.error?.message ?? null),
    notFound,
    reload: () => {
      void query.refetch();
    },
  };
}
