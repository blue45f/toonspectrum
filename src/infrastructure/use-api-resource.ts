import { useEffect, useState } from "react";

import { api } from "@/src/infrastructure/api";

export function useApiResource<T>(url: string | null, errorMessage: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!url) {
      setData(null);
      setLoading(false);
      setError(null);
      setNotFound(false);
      return;
    }

    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setNotFound(false);

    // 전체 URL 그대로 호출(api.raw = prefix 없는 ky). 404 는 notFound, 그 외 에러는 errorMessage 로 처리.
    api
      .raw(url, {
        cache: "no-store",
        signal: controller.signal,
        throwHttpErrors: false,
      })
      .then(async (response) => {
        if (response.status === 404) {
          setNotFound(true);
          return null;
        }
        if (!response.ok) throw new Error(errorMessage);
        return (await response.json()) as T;
      })
      .then((payload) => {
        if (!alive) return;
        setData(payload);
      })
      .catch((err) => {
        if (!alive || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : errorMessage);
        setData(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [errorMessage, reloadKey, url]);

  return {
    data,
    loading,
    error,
    notFound,
    reload: () => setReloadKey((value) => value + 1),
  };
}
