// 스톡 사진 검색 패널 — Unsplash BYOK(Bring Your Own Key) 검색 + 캔버스 삽입.
//
// StudioAiCompositionPanel과 동일하게 **자기완결형(self-contained)**이다 — Access Key/검색어/결과/
// busy/error를 전부 이 컴포넌트가 직접 useState로 소유하고, studio-stock-image-client.ts의 세 함수
// (searchStockPhotos/inlineStockPhotoForCanvas/triggerStockImageDownload)도 전부 이 안에서 직접
// 호출한다. StudioAiSettingsPanel과 달리 **별도 설정 패널을 만들지 않았다** — Unsplash 설정은
// Access Key 한 개뿐이라(baseURL·모델·엔드포인트 경로 없음), 그리고 이 키를 공유해서 봐야 하는
// "형제 패널"이 여러 개 있는 AI 어시스트(설정+배경생성+채색+구도제안 4패널)와 달리 이 기능은 패널이
// 이거 하나뿐이라 부모(StudioPage.tsx)로 상태를 끌어올릴 이유가 없다(docs/studio-stock-image-
// integration.md "설계 결정" 참고).
//
// 부모에게 필요한 건 onInsert 콜백 하나뿐이다 — 이 패널이 이미 (1) 선택한 사진을 이 앱의 "항상
// data: URL" 불변식에 맞게 인라인 변환하고 (2) Unsplash API Guidelines가 요구하는 download_location
// 트리거를 fire-and-forget으로 쏜 뒤에 호출하므로, 부모는 그냥 주어진 dataUrl/width/height/사진
// 메타데이터를 캔버스에 얹기만 하면 된다(addRenderedImage와 동일한 "이미 준비된 이미지 삽입" 책임
// 분리).
//
// 이 패널은 "생성형 AI 최초 사용 고지" 모달의 대상이 **아니다** — Unsplash 사진은 실사진(라이선스
// 사진)이지 AI 생성물이 아니다.
import { Eye, EyeOff, ExternalLink, Images, Loader2, Search } from "lucide-react";
import { useRef, useState } from "react";

import {
  inlineStockPhotoForCanvas,
  isStudioStockImageConfigured,
  loadStudioStockImageAccessKey,
  saveStudioStockImageAccessKey,
  searchStockPhotos,
  STUDIO_STOCK_IMAGE_DEVELOPER_SIGNUP_URL,
  triggerStockImageDownload,
  type StudioStockImageRateLimit,
  type StudioStockPhoto,
} from "./studio-stock-image-client";

export interface StudioStockImagePanelProps {
  /** 선택한 사진(이미 data: URL로 인라인 변환됨) + 원본 픽셀 크기를 캔버스에 얹고 싶을 때 호출된다.
   *  다운로드 트리거는 이 패널이 이미 쐈으므로, 이 콜백은 캔버스 배치만 신경 쓰면 된다. */
  onInsert: (photo: StudioStockPhoto, dataUrl: string, width: number, height: number) => void;
}

export function StudioStockImagePanel({ onInsert }: StudioStockImagePanelProps) {
  const [accessKey, setAccessKey] = useState(() => loadStudioStockImageAccessKey(globalThis.localStorage));
  const [showAccessKey, setShowAccessKey] = useState(false);
  const configured = isStudioStockImageConfigured(accessKey);
  // <details>의 초기 펼침 상태 — "마운트 시점"의 Access Key 유무만 반영하고, 그 뒤로는 절대 다시
  // 계산하지 않는다. 예전에는 <details open={!configured}>처럼 매 렌더 반응형으로 파생시켰는데,
  // 그러면 사용자가 Access Key 입력란에 글자를 단 하나라도 치는 순간 configured가 true로 바뀌어
  // open prop이 true→false로 바뀐다 — React는 이전 렌더와 다른 prop 값이므로 실제 DOM의 open
  // 속성을 다시 써서 <details>를 강제로 접어버리고, 그 안에 있던(지금 포커스 중인) <input>이
  // display:none 처리되며 포커스를 잃는다 — 즉 키를 타이핑하는 도중 입력창 자체가 사라지는 버그였다
  // (붙여넣기라도 입력 직후 패널이 한 번 튕기듯 접힌다). useRef로 마운트 시점 값만 고정해 두면,
  // 이후 configured가 바뀌어도 이 값 자체가 변하지 않으므로 React가 open 속성을 다시 쓰지 않고
  // (이전 렌더와 동일한 prop 값이라 diffing에서 스킵됨), 사용자가 <summary>를 눌러 직접 여닫는 것도
  // 이후 재렌더에서 되돌려지지 않는다.
  const detailsInitiallyOpenRef = useRef(!configured);

  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [photos, setPhotos] = useState<StudioStockPhoto[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [rateLimit, setRateLimit] = useState<StudioStockImageRateLimit | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insertingId, setInsertingId] = useState<string | null>(null);

  function updateAccessKey(next: string) {
    setAccessKey(next);
    saveStudioStockImageAccessKey(globalThis.localStorage, next);
  }

  async function runSearch(nextPage: number) {
    const term = (nextPage === 1 ? query : submittedQuery).trim();
    if (!term || loading || !configured) return;
    setLoading(true);
    setError(null);
    const result = await searchStockPhotos(term, accessKey, { page: nextPage });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSubmittedQuery(term);
    setPage(result.data.page);
    setTotalPages(result.data.totalPages);
    setRateLimit(result.data.rateLimit);
    setPhotos((prev) => (nextPage === 1 ? result.data.photos : [...prev, ...result.data.photos]));
  }

  async function onPick(photo: StudioStockPhoto) {
    if (insertingId) return;
    setInsertingId(photo.id);
    setError(null);
    const inlined = await inlineStockPhotoForCanvas(photo.insertUrl);
    if (!inlined.ok) {
      setError(inlined.error);
      setInsertingId(null);
      return;
    }
    onInsert(photo, inlined.data.dataUrl, inlined.data.width, inlined.data.height);
    // Unsplash API Guidelines가 요구하는 "다운로드" 트리거 — 실패해도 이미 삽입은 끝났으니 사용자
    // 흐름을 막지 않는다(fire-and-forget, studio-stock-image-client.ts §5-2).
    void triggerStockImageDownload(photo.downloadLocationUrl, accessKey);
    setInsertingId(null);
  }

  return (
    <div className="fixed inset-x-2 top-48 z-30 flex max-h-[calc(100dvh-13rem)] flex-col gap-2 overflow-y-auto rounded-xl border border-line bg-panel p-3 shadow-lg sm:absolute sm:left-0 sm:right-auto sm:top-full sm:mt-1 sm:w-80 sm:max-h-none sm:overflow-visible">
      <div className="flex items-center gap-1.5 text-sm font-medium text-fg-1">
        <Images size={14} />
        스톡 사진 검색 (Unsplash)
      </div>

      <details
        open={detailsInitiallyOpenRef.current}
        className="rounded-md border border-line bg-card/50 px-2 py-1.5 text-fg-3"
      >
        <summary className="cursor-pointer select-none text-[0.63rem] font-medium text-fg-2">
          {configured ? "Unsplash Access Key 등록됨 · 변경" : "Unsplash Access Key 등록"}
        </summary>
        <div className="mt-1.5 flex flex-col gap-1.5">
          <p className="text-[0.6rem] leading-relaxed text-fg-3">
            무료 Unsplash 계정으로 Access Key를 발급받아 입력하면 사진을 검색할 수 있어요. 키는{" "}
            <span className="font-semibold text-fg-2">이 브라우저에만</span> 저장되고, 이 앱 서버로는
            전송되지 않아요 — 검색은 브라우저가 Unsplash로 직접 요청해요.{" "}
            <a
              href={STUDIO_STOCK_IMAGE_DEVELOPER_SIGNUP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 font-medium text-accent hover:underline"
            >
              키 발급받기 <ExternalLink size={9} />
            </a>
          </p>
          <span className="relative flex items-center">
            <input
              type={showAccessKey ? "text" : "password"}
              value={accessKey}
              onChange={(e) => updateAccessKey(e.target.value)}
              placeholder="Access Key"
              className="w-full rounded-md border border-line bg-panel px-2 py-1 pr-7 text-[0.65rem] text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-accent"
              spellCheck={false}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowAccessKey((v) => !v)}
              aria-label={showAccessKey ? "Access Key 숨기기" : "Access Key 표시"}
              className="absolute right-1.5 text-fg-3 transition-colors hover:text-fg-2"
            >
              {showAccessKey ? <EyeOff size={12} /> : <Eye size={12} />}
            </button>
          </span>
        </div>
      </details>

      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-fg-3" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value.slice(0, 200))}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSearch(1);
            }}
            placeholder="예: 도시 야경, 카페, 바다"
            disabled={!configured || loading}
            className="w-full rounded-lg border border-line bg-card py-1 pl-6 pr-2 text-[0.65rem] placeholder:text-fg-3 outline-none transition-colors focus:border-accent disabled:opacity-60"
          />
        </div>
        <button
          type="button"
          onClick={() => void runSearch(1)}
          disabled={!configured || loading || !query.trim()}
          className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-[0.65rem] font-medium text-on-accent transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-55"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
          검색
        </button>
      </div>

      {/* 검색 결과 없이 정적으로 항상 보이는 문구는 아니다 — 실제로 검색을 해서 헤더에 요청 한도가
          왔을 때만 보여준다(무료 티어 시간당 50회를 사용자가 스스로 가늠할 수 있게). */}
      {rateLimit && (
        <p className="text-[0.58rem] leading-relaxed text-fg-3">
          이번 시간 남은 검색 한도: {rateLimit.remaining}/{rateLimit.limit} (Unsplash 무료 티어)
        </p>
      )}

      {error && <p className="text-xs text-bad">{error}</p>}

      {photos.length === 0 && !loading && !error && (
        <div className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed border-line p-4 text-center">
          <p className="text-xs text-fg-3">
            {!configured
              ? "Access Key를 먼저 등록하세요."
              : submittedQuery
                ? "검색 결과가 없습니다."
                : "검색어를 입력해 무료 사진을 찾아보세요."}
          </p>
        </div>
      )}

      {photos.length > 0 && (
        <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto pr-1">
          {photos.map((photo) => (
            <div key={photo.id} className="flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => void onPick(photo)}
                disabled={insertingId !== null}
                title={photo.description || "이 사진을 캔버스에 삽입"}
                className="group relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-line bg-neutral-100 disabled:cursor-not-allowed dark:bg-neutral-800"
              >
                <img
                  src={photo.thumbUrl}
                  alt={photo.description || "Unsplash 스톡 사진"}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                />
                {insertingId === photo.id && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <Loader2 size={16} className="animate-spin text-white" />
                  </span>
                )}
              </button>
              {/* Unsplash API Guidelines 크레딧 표시 — 작가·Unsplash 양쪽 링크(UTM 포함, 이미
                  studio-stock-image-client.ts에서 붙여서 온다). */}
              <p className="truncate text-center text-[0.55rem] text-fg-3">
                <a
                  href={photo.credit.photographerProfileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-fg-2 hover:underline"
                >
                  {photo.credit.photographerName}
                </a>{" "}
                ·{" "}
                <a
                  href={photo.credit.unsplashPhotoPageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-fg-2 hover:underline"
                >
                  Unsplash
                </a>
              </p>
            </div>
          ))}
        </div>
      )}

      {photos.length > 0 && page < totalPages && (
        <button
          type="button"
          onClick={() => void runSearch(page + 1)}
          disabled={loading}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-line bg-card py-1.5 text-xs font-medium text-fg-2 transition-colors hover:bg-raised disabled:opacity-60"
        >
          {loading && <Loader2 size={13} className="animate-spin" />}
          더 보기
        </button>
      )}

      <p className="text-[0.6rem] leading-relaxed text-fg-3">
        Unsplash 무료 사진 — 상업적 이용 가능, 사진작가·Unsplash 출처 표시가 자동으로 포함돼요.
      </p>
    </div>
  );
}
