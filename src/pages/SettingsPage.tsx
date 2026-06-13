"use client";

import { Settings, Globe, Star, SlidersHorizontal, ShieldCheck, Trash2, Check, Download, Upload, Clock } from "lucide-react";
import { useState, useEffect, useRef } from "react";

import { Container } from "@/components/section";
import { useI18n, type Lang } from "@/lib/i18n";
import { useApp, useHydrated, type RatingScale } from "@/lib/store";
import {
  getRememberFlag,
  setRememberFlag,
  clearAllRememberedFilters,
} from "@/lib/use-remembered-filters";

const LANGS: { id: Lang; label: string }[] = [
  { id: "ko", label: "한국어" },
  { id: "en", label: "English" },
];
const SCALES: { id: RatingScale; label: string }[] = [
  { id: "star", label: "별점 ★" },
  { id: "ten", label: "10점" },
  { id: "hundred", label: "100점" },
];

function Choice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-line bg-card/40 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            value === o.id ? "bg-accent text-on-accent" : "text-fg-3 hover:text-fg"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Row({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: typeof Globe;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-line/60 py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <Icon size={16} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fg">{title}</p>
          <p className="mt-0.5 text-[0.78rem] leading-relaxed text-fg-3">{desc}</p>
        </div>
      </div>
      <div className="shrink-0 sm:pl-4">{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const hydrated = useHydrated();
  const lang = useI18n((s) => s.lang);
  const setLang = useI18n((s) => s.setLang);
  const ratingScale = useApp((s) => s.ratingScale);
  const setRatingScale = useApp((s) => s.setRatingScale);
  const adultVerified = useApp((s) => s.adultVerified);
  const adultBirthdate = useApp((s) => s.adultBirthdate);
  const setAdultVerified = useApp((s) => s.setAdultVerified);
  const openAgeGate = useApp((s) => s.openAgeGate);
  const resetAll = useApp((s) => s.resetAll);
  const hydrateFromServer = useApp((s) => s.hydrateFromServer);
  const recentCount = useApp((s) => s.recentlyViewed.length);
  const clearRecentlyViewed = useApp((s) => s.clearRecentlyViewed);

  const [remember, setRemember] = useState(false);
  const [filtersCleared, setFiltersCleared] = useState(false);
  const [recentCleared, setRecentCleared] = useState(false);
  const [dataReset, setDataReset] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [imported, setImported] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // 내 서재(별점·읽음·구독·컬렉션)는 이 브라우저에만 저장되므로 JSON 백업으로 내보내기/가져오기 지원.
  const doExport = () => {
    const s = useApp.getState();
    const payload = {
      _app: "toonspectrum-library",
      version: 1,
      exportedAt: new Date().toISOString(),
      ratings: s.ratings,
      reads: s.reads,
      subscriptions: s.subscriptions,
      reviews: s.reviews,
      likedReviews: s.likedReviews,
      collections: s.collections,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `toonspectrum-library-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImportPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const d = JSON.parse(String(reader.result)) as Partial<Record<string, unknown>>;
        if (!d || typeof d !== "object") throw new Error("invalid");
        hydrateFromServer({
          ratings: (d.ratings as Record<string, number>) ?? {},
          reads: (d.reads as Record<string, never>) ?? {},
          subscriptions: (d.subscriptions as Record<string, boolean>) ?? {},
          reviews: (d.reviews as Record<string, never>) ?? {},
          likedReviews: (d.likedReviews as Record<string, boolean>) ?? {},
          collections: Array.isArray(d.collections) ? (d.collections as never[]) : [],
        });
        setImported(true);
        setImportError(null);
      } catch {
        setImportError("파일을 읽을 수 없어요. 올바른 백업 파일인지 확인해주세요.");
        setImported(false);
      }
    };
    reader.readAsText(file);
  };

  // 클라이언트에서만 localStorage 기반 선호값 반영.
  useStateOnceHydrated(hydrated, () => setRemember(getRememberFlag()));

  const toggleRemember = () => {
    const next = !remember;
    setRemember(next);
    setRememberFlag(next);
    if (!next) setFiltersCleared(true);
  };
  const clearFilters = () => {
    clearAllRememberedFilters();
    setRemember(false);
    setFiltersCleared(true);
  };
  const doReset = () => {
    resetAll();
    setDataReset(true);
    setConfirmReset(false);
  };

  return (
    <Container size="prose" className="py-10 sm:py-14">
      <header className="mb-6">
        <p className="eyebrow flex items-center gap-1.5 text-accent">
          <Settings size={14} /> SETTINGS
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">설정</h1>
        <p className="mt-2 text-sm leading-relaxed text-fg-2">
          표시 방식과 필터를 저장하거나 초기화합니다. 모든 설정은 이 브라우저에만 저장됩니다.
        </p>
      </header>

      {/* 표시 설정 */}
      <section className="rounded-2xl border border-line bg-panel/40 px-5">
        <Row icon={Globe} title="언어" desc="메뉴·버튼 표기 언어 (작품 데이터는 한국어 원본)">
          <Choice options={LANGS} value={lang} onChange={setLang} />
        </Row>
        <Row icon={Star} title="평점 표시 단위" desc="별점을 어떤 척도로 보여줄지 선택">
          <Choice options={SCALES} value={ratingScale} onChange={setRatingScale} />
        </Row>
      </section>

      {/* 필터 */}
      <h2 className="mb-2 mt-8 text-sm font-bold uppercase tracking-wide text-fg-3">필터</h2>
      <section className="rounded-2xl border border-line bg-panel/40 px-5">
        <Row
          icon={SlidersHorizontal}
          title="필터 기억"
          desc="랭킹·추천·캘린더에서 설정한 필터를 다음 방문에도 유지합니다."
        >
          <button
            type="button"
            onClick={toggleRemember}
            role="switch"
            aria-checked={hydrated && remember}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
              hydrated && remember ? "bg-accent" : "bg-line-strong"
            }`}
          >
            <span
              className={`inline-block size-5 rounded-full bg-canvas transition-transform ${
                hydrated && remember ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </Row>
        <Row icon={Trash2} title="저장된 필터 초기화" desc="모든 페이지의 저장된 필터 값을 지웁니다.">
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-fg-2 transition-colors hover:bg-raised hover:text-fg"
          >
            {filtersCleared ? <Check size={14} className="text-good" /> : <Trash2 size={14} />}
            {filtersCleared ? "초기화됨" : "필터 초기화"}
          </button>
        </Row>
      </section>

      {/* 연령 확인 */}
      <h2 className="mb-2 mt-8 text-sm font-bold uppercase tracking-wide text-fg-3">연령 확인</h2>
      <section className="rounded-2xl border border-line bg-panel/40 px-5">
        <Row
          icon={ShieldCheck}
          title="19금 표지 열람"
          desc={
            hydrated && adultVerified
              ? `만 19세 이상으로 확인됨${adultBirthdate ? ` (${adultBirthdate})` : ""}`
              : "생년월일로 만 19세 이상을 확인하면 19금 표지가 보입니다."
          }
        >
          {hydrated && adultVerified ? (
            <button
              type="button"
              onClick={() => setAdultVerified(false)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-fg-2 transition-colors hover:bg-raised hover:text-fg"
            >
              확인 해제
            </button>
          ) : (
            <button
              type="button"
              onClick={openAgeGate}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90"
            >
              연령 확인
            </button>
          )}
        </Row>
      </section>

      {/* 내 데이터 */}
      <h2 className="mb-2 mt-8 text-sm font-bold uppercase tracking-wide text-fg-3">내 데이터</h2>
      <section className="rounded-2xl border border-line bg-panel/40 px-5">
        <Row icon={Download} title="내 서재 백업 내보내기" desc="별점·읽음·구독·컬렉션을 JSON 파일로 저장합니다.">
          <button
            type="button"
            onClick={doExport}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-fg-2 transition-colors hover:bg-raised"
          >
            <Download size={14} /> 내보내기
          </button>
        </Row>
        <Row icon={Upload} title="백업 가져오기" desc="내보낸 JSON으로 복원합니다. 현재 이 브라우저의 데이터를 덮어씁니다.">
          <span className="inline-flex items-center gap-2">
            {imported && (
              <span className="inline-flex items-center gap-1 text-sm font-medium text-good">
                <Check size={14} /> 가져옴
              </span>
            )}
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-fg-2 transition-colors hover:bg-raised"
            >
              <Upload size={14} /> 가져오기
            </button>
            <input ref={importInputRef} type="file" accept="application/json,.json" className="hidden" onChange={onImportPick} />
          </span>
        </Row>
        {importError && <p className="-mt-1 pb-3 text-xs text-bad">{importError}</p>}
        <Row
          icon={Clock}
          title="최근 본 기록 지우기"
          desc={`홈·서재·검색에 표시되는 최근 본 작품 기록을 지웁니다.${recentCount > 0 ? ` (현재 ${recentCount}개)` : ""}`}
        >
          {recentCleared ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-good">
              <Check size={14} /> 지움
            </span>
          ) : (
            <button
              type="button"
              disabled={recentCount === 0}
              onClick={() => {
                clearRecentlyViewed();
                setRecentCleared(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-fg-2 transition-colors hover:bg-raised disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <Clock size={14} /> 기록 지우기
            </button>
          )}
        </Row>
        <Row
          icon={Trash2}
          title="내 활동 초기화"
          desc="별점·읽음 상태·구독·컬렉션을 모두 지웁니다. 되돌릴 수 없습니다."
        >
          {dataReset ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-good">
              <Check size={14} /> 초기화됨
            </span>
          ) : confirmReset ? (
            <span className="inline-flex items-center gap-2">
              <button
                type="button"
                onClick={doReset}
                className="rounded-lg bg-bad px-3 py-1.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90"
              >
                정말 초기화
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-fg-2 hover:bg-raised"
              >
                취소
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-bad/50 px-3 py-1.5 text-sm font-medium text-bad transition-colors hover:bg-bad/10"
            >
              <Trash2 size={14} /> 초기화
            </button>
          )}
        </Row>
      </section>
    </Container>
  );
}

// 하이드레이션 직후 1회 초기화(localStorage 선호값 반영). effect 의존성 가드.
function useStateOnceHydrated(hydrated: boolean, fn: () => void) {
  const done = useRef(false);
  useEffect(() => {
    if (hydrated && !done.current) {
      done.current = true;
      fn();
    }
  }, [hydrated, fn]);
}
