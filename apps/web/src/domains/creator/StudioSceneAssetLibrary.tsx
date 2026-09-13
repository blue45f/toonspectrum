import { useId, useRef, useState } from "react";

import { svgToDataUrl } from "./studio-characters";
import { selectStudioSceneLibraryPage, type StudioSceneLibraryKind } from "./studio-asset-library-management";

import type { StudioUnifiedAssetItem } from "./studio-unified-asset-catalog";

const CONTROL = "min-h-11 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50";
const THEMES = ["학교", "회사", "카페", "거리", "실내", "밤", "로맨스", "판타지"] as const;

function previewSource(item: StudioUnifiedAssetItem): string | undefined {
  if (item.preview.kind === "image") return item.preview.src;
  if (item.preview.kind === "svg") return svgToDataUrl(item.preview.svg);
  return undefined;
}

export function StudioSceneAssetLibrary({ items, onUseItem }: {
  readonly items: readonly StudioUnifiedAssetItem[];
  readonly onUseItem: (item: StudioUnifiedAssetItem) => boolean | void | Promise<boolean | void>;
}) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<StudioSceneLibraryKind>("all");
  const [page, setPage] = useState(0);
  const [preview, setPreview] = useState<StudioUnifiedAssetItem | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const busyRef = useRef(false);
  const result = selectStudioSceneLibraryPage(items, query, kind, page);

  async function handleUseItem(item: StudioUnifiedAssetItem): Promise<void> {
    if (busyRef.current) return;
    busyRef.current = true;
    setPending(item.id);
    setNotice(null);
    try {
      const used = await onUseItem(item);
      setNotice(used === false ? "현재 캔버스에서는 이 에셋을 사용할 수 없습니다."
        : item.useMode === "open" ? `${item.title} 제작 도구를 열었습니다.` : used === true ? `${item.title}을(를) 배치했습니다.` : `${item.title} 배치를 요청했습니다. 캔버스와 오류 안내를 확인해 주세요.`);
    } catch (cause: unknown) {
      setNotice(cause instanceof Error ? cause.message : "에셋을 사용하지 못했습니다.");
    } finally { busyRef.current = false; setPending(null); }
  }

  return <section aria-label="공용 템플릿과 배경" className="space-y-3">
    <header><h3 className="text-sm font-bold text-fg">템플릿 · 배경 전체 탐색</h3><p className="mt-1 text-xs leading-relaxed text-fg-3">추천에 포함되지 않은 장면까지 전체 목록에서 찾습니다. 장면 템플릿은 제작 도구에서 미리보기 후 배치합니다.</p></header>
    <label htmlFor={searchId} className="sr-only">템플릿과 배경 검색</label>
    <input id={searchId} type="search" value={query} className={`${CONTROL} w-full font-normal`} placeholder="학교, 도시, 배경, 로맨스…" onChange={(event) => { setQuery(event.target.value.slice(0, 120)); setPage(0); }} />
    <div className="flex flex-wrap gap-1" role="group" aria-label="장면 테마">{THEMES.map((theme) => <button key={theme} type="button" className={CONTROL} aria-pressed={query === theme} onClick={() => { setQuery(theme); setPage(0); }}>{theme}</button>)}<button type="button" className={CONTROL} onClick={() => { setQuery(""); setKind("all"); setPage(0); }}>초기화</button></div>
    <select aria-label="템플릿과 배경 종류" value={kind} className={`${CONTROL} w-full`} onChange={(event) => { setKind(event.target.value as StudioSceneLibraryKind); setPage(0); }}><option value="all">템플릿과 배경 전체</option><option value="scene-template">장면 템플릿</option><option value="background">2D 배경</option></select>
    <p role="status" className="text-xs text-fg-3">검색 결과 {result.total}개 · {result.page + 1}/{result.pages}페이지</p>
    {preview && <div role="region" aria-label={`${preview.title} 확대 미리보기`} className="space-y-2 rounded-xl border border-accent/40 bg-card p-3">
      <h4 className="text-sm font-bold text-fg">{preview.title}</h4>
      {previewSource(preview) && <img src={previewSource(preview)} alt={preview.title} className="max-h-64 w-full rounded-lg bg-raised object-contain" />}
      <p className="text-xs leading-relaxed text-fg-3">{preview.description}</p><p className="text-xs text-fg-3">{preview.badges.join(" · ")}</p>
      <div className="flex gap-2"><button type="button" className={CONTROL} disabled={pending !== null} onClick={() => void handleUseItem(preview)}>{preview.useLabel}</button><button type="button" className={CONTROL} onClick={() => setPreview(null)}>미리보기 닫기</button></div>
    </div>}
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{result.items.map((item) => <article key={item.id} className="min-w-0 rounded-xl border border-line bg-card p-2">
      <button type="button" aria-label={`${item.title} 미리보기`} className="block aspect-[4/3] w-full overflow-hidden rounded-lg bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" onClick={() => setPreview(item)}>
        {previewSource(item) ? <img src={previewSource(item)} alt="" loading="lazy" decoding="async" className="size-full object-contain" /> : <span className="text-xs text-fg-3">장면 템플릿</span>}
      </button>
      <h4 className="mt-2 line-clamp-2 text-xs font-bold text-fg">{item.title}</h4><p className="my-1 line-clamp-2 text-[0.65rem] text-fg-3">{item.badges.join(" · ")}</p>
      <button type="button" className={`${CONTROL} mt-1 w-full`} disabled={pending !== null} onClick={() => void handleUseItem(item)} aria-label={`${item.title} ${item.useLabel}`}>{pending === item.id ? "처리 중…" : item.useLabel}</button>
    </article>)}</div>
    {result.total === 0 && <p className="py-4 text-center text-xs text-fg-3">검색 결과가 없습니다. 다른 테마를 선택하거나 고품질 공용 라이브러리를 확인해 주세요.</p>}
    {result.pages > 1 && <nav aria-label="템플릿과 배경 페이지" className="flex justify-between gap-2"><button type="button" className={CONTROL} disabled={result.page === 0} onClick={() => setPage(result.page - 1)}>이전</button><button type="button" className={CONTROL} disabled={result.page + 1 >= result.pages} onClick={() => setPage(result.page + 1)}>다음</button></nav>}
    {notice && <p role="status" aria-live="polite" className="text-xs text-fg-3">{notice}</p>}
  </section>;
}
