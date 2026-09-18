import {
  Bookmark,
  Check,
  Copy,
  ExternalLink,
  Images,
  Maximize2,
  Search,
  ShieldCheck,
  Sparkles,
  Tags,
  X,
} from "lucide-react";
import { useRef, useState } from "react";

import { RESOURCE_BUTTON } from "./navigation";
import {
  AssetImage,
  copyText,
  CountBadge,
  useModalFocus,
} from "./reference-asset-ui";

import type { CreatorResource } from "@/shared/lib/creator-resources";

import {
  formatReferenceDateRange,
  referenceAttributionText,
  referenceSimilarQuery,
} from "@/shared/lib/reference-assets";

function MetadataRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="grid gap-1 border-b border-line py-3 last:border-b-0 sm:grid-cols-[8rem_1fr] sm:gap-4">
      <dt className="text-xs font-bold uppercase tracking-wide text-fg-3">{label}</dt>
      <dd className="break-words text-sm leading-6 text-fg">{value}</dd>
    </div>
  );
}

export function ReferenceDetailDialog({
  item,
  saved,
  savingDisabled,
  returnFocus,
  onClose,
  onToggleSaved,
  onSimilar,
}: {
  item: CreatorResource;
  saved: boolean;
  savingDisabled: boolean;
  returnFocus: HTMLElement | null;
  onClose: () => void;
  onToggleSaved: () => void;
  onSimilar: (query: string) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previewImages = [
    item.imageUrl,
    item.asset?.originalImageUrl,
    ...(item.asset?.additionalImageUrls ?? []),
  ].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
  const [activeImage, setActiveImage] = useState(previewImages[0] ?? "");
  const [imageFailed, setImageFailed] = useState(false);
  useModalFocus({
    dialogRef,
    initialFocusRef: closeRef,
    onClose,
    returnFocus,
  });
  const asset = item.asset;
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-3 sm:p-6">
      <button type="button" aria-label="상세 보기 닫기" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reference-detail-title"
        tabIndex={-1}
        className="relative grid max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-3xl border border-line bg-canvas shadow-2xl outline-none lg:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]"
      >
        <button ref={closeRef} type="button" aria-label="닫기" onClick={onClose} className="absolute right-4 top-4 z-10 grid size-11 place-items-center rounded-full border border-white/20 bg-black/70 text-white backdrop-blur focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
          <X size={19} aria-hidden="true" />
        </button>
        <div className="flex min-h-[22rem] flex-col bg-raised lg:min-h-0">
          <div className="grid min-h-0 flex-1 place-items-center overflow-hidden p-5 sm:p-8">
            {activeImage && !imageFailed ? (
              <img
                src={activeImage}
                alt={item.title}
                referrerPolicy="no-referrer"
                onError={() => setImageFailed(true)}
                className="max-h-[62vh] w-full object-contain"
              />
            ) : (
              <div className="grid min-h-64 place-items-center text-fg-3">
                <Images size={42} aria-hidden="true" />
                <p>이미지 미리보기를 불러오지 못했습니다.</p>
              </div>
            )}
          </div>
          {previewImages.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto border-t border-line bg-panel/80 p-3" aria-label="추가 이미지">
              {previewImages.map((image, index) => (
                <button
                  key={image}
                  type="button"
                  aria-label={`${index + 1}번째 이미지 보기`}
                  aria-pressed={activeImage === image}
                  onClick={() => {
                    setActiveImage(image);
                    setImageFailed(false);
                  }}
                  className={`size-16 shrink-0 overflow-hidden rounded-xl border-2 bg-raised p-1 ${activeImage === image ? "border-accent" : "border-transparent"}`}
                >
                  <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-contain" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="min-h-0 overflow-y-auto p-5 sm:p-7">
          <div className="flex flex-wrap gap-2 pr-12">
            <CountBadge><ShieldCheck size={13} aria-hidden="true" /> CC0 공개 도메인</CountBadge>
            {asset?.isHighlight ? <CountBadge><Sparkles size={13} aria-hidden="true" /> Met 대표작</CountBadge> : null}
          </div>
          <h2 id="reference-detail-title" className="mt-5 break-words text-2xl font-bold leading-tight text-fg">{item.title}</h2>
          <p className="mt-3 text-sm leading-6 text-fg-2">
            {item.creator || "제작자 미상"}{item.dateLabel ? ` · ${item.dateLabel}` : ""}
          </p>
          <div className="mt-6 rounded-2xl border border-line bg-panel px-4">
            <dl>
              <MetadataRow label="오브젝트 유형" value={asset?.objectName} />
              <MetadataRow label="큐레이터 부서" value={asset?.department} />
              <MetadataRow label="문화권" value={asset?.culture} />
              <MetadataRow label="시대·왕조" value={[asset?.period, asset?.dynasty].filter(Boolean).join(" · ")} />
              <MetadataRow label="제작 연대" value={formatReferenceDateRange(item)} />
              <MetadataRow label="재료·기법" value={asset?.medium} />
              <MetadataRow label="크기" value={asset?.dimensions} />
              <MetadataRow label="분류" value={asset?.classification} />
              <MetadataRow label="지역" value={asset?.country} />
              <MetadataRow label="크레딧" value={item.credit} />
            </dl>
          </div>
          {asset?.tags.length ? (
            <section className="mt-6" aria-labelledby="reference-tag-title">
              <h3 id="reference-tag-title" className="flex items-center gap-2 text-sm font-bold text-fg"><Tags size={16} aria-hidden="true" /> 주제 태그로 이어서 찾기</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {asset.tags.map((tag) => (
                  <button key={tag} type="button" className="min-h-9 rounded-full border border-line bg-panel px-3 text-xs font-semibold text-fg-2 hover:border-accent/50 hover:text-accent" onClick={() => onSimilar(tag)}>
                    {tag}
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          <div className="mt-7 grid gap-2 sm:grid-cols-2">
            <button type="button" className={`${RESOURCE_BUTTON} gap-2 ${saved ? "border-accent bg-accent-soft text-accent" : ""}`} aria-pressed={saved} disabled={savingDisabled} onClick={onToggleSaved}>
              {saved ? <Check size={16} aria-hidden="true" /> : <Bookmark size={16} aria-hidden="true" />}
              {saved ? "연구 보드에 저장됨" : "연구 보드에 저장"}
            </button>
            <button type="button" className={`${RESOURCE_BUTTON} gap-2`} onClick={() => void copyText(referenceAttributionText(item), "출처 표기를 복사했습니다.")}>
              <Copy size={16} aria-hidden="true" /> 출처 표기 복사
            </button>
            <button type="button" className={`${RESOURCE_BUTTON} gap-2`} onClick={() => onSimilar(referenceSimilarQuery(item))}>
              <Search size={16} aria-hidden="true" /> 비슷한 자료 찾기
            </button>
            <a className={`${RESOURCE_BUTTON} gap-2`} href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={16} aria-hidden="true" /> Met 원문 확인
            </a>
            {asset?.originalImageUrl ? (
              <a className={`${RESOURCE_BUTTON} gap-2 sm:col-span-2`} href={asset.originalImageUrl} target="_blank" rel="noopener noreferrer">
                <Maximize2 size={16} aria-hidden="true" /> 공개 고해상도 이미지 열기
              </a>
            ) : null}
          </div>
          <div className="mt-6 rounded-2xl border border-line bg-accent-soft/60 p-4 text-xs leading-6 text-fg-2">
            <p className="font-bold text-fg">이용 전 마지막 확인</p>
            <p>Met의 공개 도메인·CC0 표시가 확인된 이미지입니다. 작품에 포함된 인물, 상표, 문화재 관련 권리나 맥락은 제작 목적에 맞게 별도로 검토하세요.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

const COMPARISON_ROWS: Array<{
  label: string;
  value: (item: CreatorResource) => string;
}> = [
  { label: "작품명", value: (item) => item.title },
  { label: "제작자", value: (item) => item.creator || "미상" },
  { label: "연대", value: (item) => formatReferenceDateRange(item) || item.dateLabel || "원문 확인" },
  { label: "부서", value: (item) => item.asset?.department || "—" },
  { label: "문화권", value: (item) => item.asset?.culture || "—" },
  { label: "유형", value: (item) => item.asset?.objectName || item.asset?.classification || "—" },
  { label: "재료·기법", value: (item) => item.asset?.medium || "—" },
  { label: "크기", value: (item) => item.asset?.dimensions || "—" },
];

export function ReferenceComparisonDialog({
  items,
  returnFocus,
  onClose,
  onRemove,
  onOpenDetail,
}: {
  items: CreatorResource[];
  returnFocus: HTMLElement | null;
  onClose: () => void;
  onRemove: (id: string) => void;
  onOpenDetail: (item: CreatorResource) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useModalFocus({ dialogRef, initialFocusRef: closeRef, onClose, returnFocus });
  return (
    <div className="fixed inset-0 z-[75] grid place-items-center p-3 sm:p-6">
      <button type="button" aria-label="비교 닫기" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reference-compare-title"
        tabIndex={-1}
        className="relative max-h-[92vh] w-full max-w-7xl overflow-hidden rounded-3xl border border-line bg-canvas shadow-2xl outline-none"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line bg-panel p-5 sm:p-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Visual comparison</p>
            <h2 id="reference-compare-title" className="mt-1 text-2xl font-bold text-fg">레퍼런스 비교 보드</h2>
            <p className="mt-2 text-sm text-fg-2">형태·시대·재료·크기를 나란히 확인해 장면에 사용할 근거를 좁힙니다.</p>
          </div>
          <button ref={closeRef} type="button" aria-label="닫기" onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-full border border-line bg-canvas text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
            <X size={19} aria-hidden="true" />
          </button>
        </header>
        <div className="max-h-[calc(92vh-8rem)] overflow-auto p-4 sm:p-6">
          <div
            className="grid min-w-[52rem] overflow-hidden rounded-2xl border border-line bg-panel"
            style={{ gridTemplateColumns: `minmax(8rem, 0.7fr) repeat(${items.length}, minmax(13rem, 1fr))` }}
          >
            <div className="border-b border-r border-line bg-raised p-4 text-sm font-bold text-fg">미리보기</div>
            {items.map((item) => (
              <div key={item.id} className="relative border-b border-r border-line p-3 last:border-r-0">
                <button type="button" aria-label={`${item.title} 상세 보기`} className="block w-full" onClick={() => onOpenDetail(item)}>
                  <AssetImage item={item} className="aspect-square w-full rounded-xl p-2" eager />
                </button>
                <button type="button" aria-label={`${item.title} 비교에서 제거`} onClick={() => onRemove(item.id)} className="absolute right-5 top-5 grid size-8 place-items-center rounded-full bg-black/70 text-white">
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            ))}
            {COMPARISON_ROWS.map((row, rowIndex) => (
              <div key={row.label} className="contents">
                <div className={`${rowIndex < COMPARISON_ROWS.length - 1 ? "border-b" : ""} border-r border-line bg-raised p-4 text-xs font-bold uppercase tracking-wide text-fg-3`}>
                  {row.label}
                </div>
                {items.map((item) => (
                  <div key={`${row.label}-${item.id}`} className={`${rowIndex < COMPARISON_ROWS.length - 1 ? "border-b" : ""} border-r border-line p-4 text-sm leading-6 text-fg last:border-r-0`}>
                    {row.value(item)}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            {items.map((item) => (
              <a key={item.id} className={`${RESOURCE_BUTTON} gap-2`} href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
                {item.title.slice(0, 18)}{item.title.length > 18 ? "…" : ""} <ExternalLink size={14} aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
