import { useEffect, useState } from "react";

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

    fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => {
        if (response.status === 404) {
          setNotFound(true);
          return null;
        }
        if (!response.ok) throw new Error(errorMessage);
        return response.json() as Promise<T>;
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
