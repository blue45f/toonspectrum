import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  translateBilingualValueForLocale,
  translateCurrentStaticSourceText,
  translateLocaleBranchForLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Link from "@/compat/router-link";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Container } from "@/shared/components/section";
import { useI18n } from "@/shared/lib/i18n";
import { CREATOR_ESSENTIALS, ESSENTIALS_KINDS, ESSENTIALS_LABELS, essentialsByteLabel, essentialsEditorHref, essentialsFormat, essentialsKind, filterCreatorEssentials, type CreatorEssential, type EssentialsLocale } from "./creator-essentials-catalog";
import { downloadCreatorEssential } from "./creator-essentials-download";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("CreatorEssentialsPage", ko, en);

const ModelPreview = lazy(() => import("./CreatorEssentialModelPreview"));
const BUTTON = "inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-50";
export default function CreatorEssentialsPage() {
  useBilingualI18nRevision();
  const language = useI18n((state) => state.lang);
  const locale: EssentialsLocale = language.toLowerCase().startsWith("ko") ? "ko" : "en";

  useDocumentTitle(bi("무료 제작 소재", "Creator essentials"));
  const [params, setParams] = useSearchParams();
  const query = (params.get("q") ?? "").slice(0, 160);
  const kind = essentialsKind(params.get("category"));
  const assets = filterCreatorEssentials(query, kind);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); }, []);
  const change = (key: "q" | "category", value: string) => {
    const next = new URLSearchParams(params);
    if (!value || value === "all") next.delete(key); else next.set(key, value);
    setParams(next, { replace: true });
  };
  const clear = () => {
    const next = new URLSearchParams(params); next.delete("q"); next.delete("category");
    setParams(next, { replace: true });
  };
  async function download(asset: CreatorEssential, png = false) {
    if (pending.current) return;
    const controller = new AbortController(); pending.current = controller;
    setBusyId(asset.id); setNotice(""); setError("");
    try {
      await downloadCreatorEssential(asset, png, controller.signal);
      if (!controller.signal.aborted) setNotice(bi(`${asset.label.ko} 다운로드를 요청했습니다. 브라우저 다운로드 목록을 확인하세요.`, `Download requested for ${asset.label.en}. Check your browser downloads.`));
    } catch {
      if (!controller.signal.aborted) setError(bi("소재를 확인하거나 저장하지 못했습니다. 연결과 다운로드 권한을 확인한 뒤 다시 시도하세요. PNG 변환이 제한된 브라우저에서는 SVG 원본을 사용하세요.", "The asset could not be verified or saved. Check your connection and download permissions, then retry. Use the SVG original when PNG conversion is unavailable."));
    } finally {
      if (pending.current === controller) pending.current = null;
      if (!controller.signal.aborted) setBusyId(null);
    }
  }
  return <Container size="wide" className="py-7 sm:py-10" data-testid="creator-essentials">
    <header className="rounded-3xl border border-line bg-panel p-5 sm:p-8">
      <p className="text-xs font-bold tracking-widest text-accent">CREATOR ESSENTIALS · CC0</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-fg sm:text-4xl">{bi("바로 꺼내 쓰는 무료 제작 소재", "Free construction assets, ready to use")}</h1>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-fg-2">{formatI18nTemplate(String(bi("{value0}개의 원본 SVG·GLB. 말풍선과 효과, 2D 포즈 시트, 3D 데생 인형·소품을 저장해 내 편집기에서 활용하세요. 회원가입이나 유료 생성 API가 필요하지 않습니다.", "{value0} original SVG and GLB assets: balloons, effects, 2D pose sheets, 3D mannequins and props. Download for your editor, without an account or paid generation API.")), { value0: CREATOR_ESSENTIALS.length })}</p>
      <p className="mt-2 text-xs leading-6 text-fg-3">{bi("인형은 이름이 붙은 부품으로 구성한 데생 참고 모델입니다. 자동 2D→3D 복원, 스킨·본 리깅 또는 애니메이션이 포함되지 않습니다. 다운로드만으로 현재 원고가 변경되지는 않습니다.", "Mannequins are named-part drawing references, not automated 2D-to-3D reconstruction, skinned rigs or animations. Downloads never replace your current document.")}</p>
      <a href="/creator-essentials/LICENSE.txt" download className={`${BUTTON} mt-3`}>{bi("소재 이용 조건 저장", "Download asset license")}</a>
    </header>
    <section className="mt-6 space-y-3" aria-label={bi("소재 찾기", "Find assets")}>
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="min-w-0 flex-1 text-sm text-fg-2">{bi("소재 검색", "Search assets")}
          <input type="search" maxLength={160} value={query} onChange={(event) => change("q", event.target.value)} placeholder={bi("말풍선, 걷기, 책상…", "Balloon, walking, desk…")} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" />
        </label>
        <label className="min-w-0 text-sm text-fg-2 sm:w-64">{bi("소재 종류", "Asset type")}
          <select value={kind} onChange={(event) => change("category", event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
            <option value="all">{bi("전체 종류", "All types")}</option>
            {ESSENTIALS_KINDS.map((item) => <option key={item} value={item}>{bi((ESSENTIALS_LABELS[item]).ko, (ESSENTIALS_LABELS[item]).en)}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" aria-live="polite" className="text-sm tabular-nums text-fg-2">{formatI18nTemplate(String(bi("{value0} / {value1}개 소재", "{value0} of {value1} assets")), { value0: assets.length, value1: CREATOR_ESSENTIALS.length })}</p>
        {query || kind !== "all" ? <button type="button" onClick={clear} className={BUTTON}>{bi("검색·필터 초기화", "Clear search and filters")}</button> : null}
      </div>
      <p className="text-xs leading-6 text-fg-3">{bi("2D: SVG 원본 또는 PNG를 저장한 뒤 캔버스의 이미지 가져오기를 사용하세요. 3D: GLB를 저장한 뒤 3D 배경 편집기에서 모델을 가져오세요. 길이 단위는 m, 위쪽은 Y입니다.", "2D: download SVG or PNG and use image import in the canvas. 3D: download GLB and import it in the 3D background editor. Units: meters; Y up.")}</p>
      {notice ? <p role="status" className="rounded-xl border border-line p-3 text-sm text-fg-2">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-xl border border-line p-3 text-sm text-bad">{error}</p> : null}
    </section>
    {assets.length === 0 ? <section className="mt-6 rounded-2xl border border-dashed border-line p-8 text-center">
      <h2 className="text-lg font-semibold text-fg">{bi("검색에 맞는 소재가 없습니다", "No matching assets")}</h2>
      <p className="mt-2 text-sm text-fg-2">{bi("다른 한글·영문 검색어를 쓰거나 위에서 검색·필터를 초기화하세요.", "Try another Korean or English term, or clear the filters above.")}</p>
    </section> : <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {assets.map((asset) => <article key={asset.id} className="min-w-0 rounded-2xl border border-line bg-card p-4" data-essentials-id={asset.id}>
        <img src={asset.preview} alt={bi((asset.label).ko, (asset.label).en)} loading="lazy" decoding="async" width={480} height={480} className="aspect-square w-full rounded-xl border border-line bg-[#f4f1eb] object-contain" />
        <p className="mt-3 text-xs font-medium text-accent">{bi((ESSENTIALS_LABELS[asset.kind]).ko, (ESSENTIALS_LABELS[asset.kind]).en)}</p>
        <h2 className="mt-1 text-base font-bold text-fg">{bi((asset.label).ko, (asset.label).en)}</h2>
        <p className="mt-1 text-xs text-fg-3">{essentialsFormat(asset)} · {essentialsByteLabel(asset.bytes)} · CC0</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={busyId !== null} className={BUTTON} onClick={() => void download(asset)} aria-label={`${bi((asset.label).ko, (asset.label).en)} ${essentialsFormat(asset)} ${bi("저장", "download")}`}>{busyId === asset.id ? (bi("처리 중…", "Working…")) : `${essentialsFormat(asset)} ${bi("저장", "download")}`}</button>
          {!asset.kind.endsWith("3d") ? <button type="button" disabled={busyId !== null} className={BUTTON} onClick={() => void download(asset, true)} aria-label={`${bi((asset.label).ko, (asset.label).en)} PNG ${bi("저장", "download")}`}>PNG {bi("저장", "download")}</button> : <button type="button" className={BUTTON} aria-expanded={previewId === asset.id} onClick={() => setPreviewId(previewId === asset.id ? null : asset.id)}>{previewId === asset.id ? (bi("미리보기 닫기", "Close preview")) : (bi("3D 미리보기", "3D preview"))}</button>}
          <Link href={essentialsEditorHref(asset)} className={BUTTON}>{bi("가져올 편집기 열기", "Open import editor")}</Link>
        </div>
        {previewId === asset.id && asset.kind.endsWith("3d") ? <Suspense fallback={<p role="status" className="mt-3 text-xs text-fg-2">{bi("3D 도구 준비 중…", "Loading 3D tools…")}</p>}><ModelPreview asset={asset} locale={locale} /></Suspense> : null}
      </article>)}
    </div>}
  </Container>;
}
