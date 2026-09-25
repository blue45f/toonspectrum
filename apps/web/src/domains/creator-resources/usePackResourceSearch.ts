import { useEffect, useState } from "react";
import { apiPath } from "@/platform/api";
import { parseSearchResult } from "@/shared/lib/creator-resources";
import type { ResourceSearchResult } from "@/shared/lib/creator-resources";

export type PackProvider = "aic" | "cleveland" | "met";
export function packProvider(value: unknown): PackProvider { return value === "cleveland" || value === "met" ? value : "aic"; }
export function usePackResourceSearch(provider: PackProvider, query: string, page: number) {
  const [result, setResult] = useState<ResourceSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setResult(null); setError(""); setLoading(false);
    if (!query) return;
    if (query.trim().length < 2 || query.length > 80) { setError("검색어를 2~80자로 입력하세요."); return; }
    const controller = new AbortController();
    let disposed = false;
    const timeout = window.setTimeout(() => controller.abort(), 30000);
    setLoading(true);
    const params = new URLSearchParams({ provider, q: query, page: String(page) });
    void fetch(apiPath(`/api/creator-resources/search?${params}`), { headers: { Accept: "application/json" }, signal: controller.signal })
      .then(async (response) => {
        if (response.status === 429) throw new Error("요청이 많습니다. 1분 후 다시 검색하세요.");
        if (!response.ok) throw new Error("자료 검색에 연결하지 못했습니다. 저장 보드와 브리프는 계속 이용할 수 있습니다.");
        const parsed = parseSearchResult(await response.json());
        if (!parsed || parsed.provider !== provider || parsed.page !== page) throw new Error("검색 응답 형식을 확인하지 못했습니다.");
        if (!disposed) setResult(parsed);
      })
      .catch((cause: unknown) => { if (!disposed) setError(controller.signal.aborted ? "검색 시간이 초과되었습니다. 다시 시도하세요." : cause instanceof Error ? cause.message : "자료를 불러오지 못했습니다."); })
      .finally(() => { window.clearTimeout(timeout); if (!disposed) setLoading(false); });
    return () => { disposed = true; window.clearTimeout(timeout); controller.abort(); };
  }, [provider, query, page, attempt]);
  return { result, loading, error, retry: () => setAttempt((value) => value + 1) };
}
