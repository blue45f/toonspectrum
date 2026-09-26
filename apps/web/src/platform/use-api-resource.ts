import { useEffect, useState } from "react";

import { api, httpStatus, toAppApiError, type AppApiError } from "@/platform/api";
import { isAbortError } from "@/platform/api-error";

// 404 를 흐름 제어(notFound)로 다루기 위한 센티넬 에러. 일반 에러와 구분한다.
export class NotFoundError extends Error {
  constructor() {
    super("not-found");
    this.name = "NotFoundError";
  }
}

export type RemoteDataPhase =
  | "idle"
  | "loading"
  | "success"
  | "empty"
  | "stale"
  | "error"
  | "not-found";

export type ResourceState<T> = {
  url: string | null;
  phase: RemoteDataPhase;
  data: T | null;
  loading: boolean;
  error: string | null;
  appError: AppApiError | null;
  notFound: boolean;
  fetchedAt: number | null;
  staleSavedAt: number | null;
};

function initialState<T>(url: string | null): ResourceState<T> {
  return {
    url,
    phase: url ? "loading" : "idle",
    data: null,
    loading: Boolean(url),
    error: null,
    appError: null,
    notFound: false,
    fetchedAt: null,
    staleSavedAt: null,
  };
}

export async function fetchApiResource<T>(
  url: string,
  errorMessage: string,
  signal?: AbortSignal,
): Promise<T> {
  if (!url.startsWith("/data/")) {
    try {
      return await api.get<T>(url, { signal, errorMessage });
    } catch (error) {
      if (httpStatus(error) === 404) throw new NotFoundError();
      throw error;
    }
  }

  // Public build-time snapshots belong to the web origin and do not use the API prefix.
  const response = await api.raw(url, {
    cache: "no-store",
    signal,
    throwHttpErrors: false,
  });
  if (response.status === 404) throw new NotFoundError();
  if (!response.ok) throw new Error(errorMessage);
  return (await response.json()) as T;
}

function emptyPayload(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0;
  if (!value || typeof value !== "object") return false;
  const items = (value as { readonly items?: unknown }).items;
  return Array.isArray(items) && items.length === 0;
}

/**
 * 클라이언트 데이터 페칭 훅. 호출부 계약({ data, loading, error, notFound, reload })은
 * 기존 수동 fetch 구현과 동일하게 유지한다.
 *
 * 동작 보존:
 * - url 이 null 이면 쿼리를 비활성화(enabled:false)하고 data:null, loading:false 를 돌려준다(기존과 동일).
 * - loading 은 "요청 진행 중" — 기존 useApiResource 가 매 fetch 마다 setLoading(true) 한 것과 동일.
 *   탐색/캘린더/프로필/리뷰의 갱신 버튼 스피너가 reload 중에도 도는 동작을 보존한다.
 * - 404 는 notFound:true + data:null(기존: 404 응답을 null 로 처리하고 notFound 플래그 설정).
 * - 그 외 비-OK 응답/네트워크 오류는 error(문자열 메시지)로 처리. 메시지는 errorMessage 로 통일(기존과 동일).
 * - reload() 는 강제 refetch(기존: reloadKey 증가로 effect 재실행).
 * - 자동 refetch(창 포커스/재연결/주기)는 없다.
 */
export function useApiResource<T>(url: string | null, errorMessage: string) {
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<ResourceState<T>>(() => initialState<T>(url));

  useEffect(() => {
    if (!url) {
      setState(initialState<T>(null));
      return;
    }

    const requestUrl = url;
    const controller = new AbortController();

    setState((previous) => {
      const sameResource = previous.url === requestUrl;
      return {
        url: requestUrl,
        phase: "loading",
        data: sameResource ? previous.data : null,
        loading: true,
        error: null,
        appError: null,
        notFound: false,
        fetchedAt: sameResource ? previous.fetchedAt : null,
        staleSavedAt: null,
      };
    });

    fetchApiResource<T>(requestUrl, errorMessage, controller.signal)
      .then((data) => {
        setState({
          url: requestUrl,
          phase: emptyPayload(data) ? "empty" : "success",
          data,
          loading: false,
          error: null,
          appError: null,
          notFound: false,
          fetchedAt: Date.now(),
          staleSavedAt: null,
        });
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) return;
        if (error instanceof NotFoundError) {
          setState({
            url: requestUrl,
            phase: "not-found",
            data: null,
            loading: false,
            error: null,
            appError: null,
            notFound: true,
            fetchedAt: null,
            staleSavedAt: null,
          });
          return;
        }
        const appError = toAppApiError(error, errorMessage);
        setState((previous) => {
          const hasStaleData = previous.url === requestUrl && previous.data !== null;
          return {
            url: requestUrl,
            phase: hasStaleData ? "stale" : "error",
            data: hasStaleData ? previous.data : null,
            loading: false,
            error: hasStaleData ? null : appError.message,
            appError,
            notFound: false,
            fetchedAt: hasStaleData ? previous.fetchedAt : null,
            staleSavedAt: hasStaleData ? previous.fetchedAt ?? Date.now() : null,
          };
        });
      });

    return () => {
      controller.abort();
    };
  }, [errorMessage, reloadToken, url]);

  return {
    data: state.data,
    state: state.phase,
    loading: state.loading,
    error: state.error,
    appError: state.appError,
    notFound: state.notFound,
    stale: state.phase === "stale",
    staleSavedAt: state.staleSavedAt,
    staleError: state.phase === "stale" ? state.appError?.message ?? null : null,
    reload: () => {
      setReloadToken((value) => value + 1);
    },
  };
}
