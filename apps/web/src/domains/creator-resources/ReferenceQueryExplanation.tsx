import { resolveReferenceQuery } from "@toonspectrum/core/reference-query-language";
import { useSearchParams } from "react-router-dom";

import { useI18n } from "@/shared/lib/i18n";

/** Explain the same bounded vocabulary the API uses, including partial coverage. */
export function ReferenceQueryExplanation() {
  const [params] = useSearchParams();
  const language = useI18n((state) => state.lang);
  const ko = language.toLowerCase().split(/[-_]/u)[0] === "ko";
  const query = params.get("q") ?? "";
  const resolution = resolveReferenceQuery(query);
  if (resolution.status === "invalid" || resolution.status === "unchanged") return null;
  return (
    <aside className="mt-3 rounded-lg border border-line bg-card p-3 text-xs leading-6" aria-label={ko ? "한글 검색어 안내" : "Korean search vocabulary"}>
      <p>{ko ? "입력한 검색어" : "Original query"}: <strong>{resolution.original}</strong></p>
      {resolution.matched.length > 0 && <p>{ko ? "Met에 전달하는 검색어" : "Query sent to the Met"}: <strong>{resolution.providerQuery}</strong></p>}
      <p className="text-fg-2">{resolution.status === "translated"
        ? ko ? "소재 용어 사전으로 검색어를 연결했습니다. 일반 문장 번역이나 AI 검색은 아닙니다." : "Mapped with a curated reference vocabulary, not general translation or AI search."
        : ko ? "지원하지 않는 단어는 삭제하지 않고 원문 그대로 검색합니다. 결과가 없으면 영어 검색어를 함께 사용해 보세요." : "Unsupported words remain in the query. Try English terms when no results are found."}</p>
    </aside>
  );
}
