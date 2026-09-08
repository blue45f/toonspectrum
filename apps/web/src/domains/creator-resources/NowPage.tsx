import {
  ArrowRight,
  Bookmark,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  CloudSun,
  Copy,
  Flame,
  PackageSearch,
  PanelsTopLeft,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { cn } from "@/shared/lib/utils";

import {
  buildStoryBeats,
  calculateStreak,
  createEmptyNowState,
  formatTimer,
  getKstDay,
  getMode,
  getThemeForDay,
  makeBriefText,
  NOW_ARCHIVE_DAYS,
  NOW_MODES,
  NOW_PROGRESS_STEPS,
  NOW_STORAGE_KEY,
  NOW_TIMER_SECONDS,
  parseNowState,
  serializeNowState,
  type NowModeId,
  type NowProgressStepId,
  type NowState,
} from "./now";
import { RESOURCE_BUTTON } from "./navigation";
import { LocalSaveNotice, ResourceLayout } from "./ResourceLayout";

const ACTION_BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-panel px-4 py-2 text-sm font-bold text-fg transition-colors hover:border-accent/55 hover:bg-accent-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none";

function readStoredState(): NowState {
  if (typeof window === "undefined") return createEmptyNowState();
  try {
    return parseNowState(window.localStorage.getItem(NOW_STORAGE_KEY));
  } catch {
    return createEmptyNowState();
  }
}

function trimDates(dates: readonly string[], limit: number): string[] {
  return [...new Set(dates)].slice(-limit);
}

function IngredientCard({
  icon: Icon,
  eyebrow,
  title,
  body,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <article className="group rounded-2xl border border-line bg-panel p-5 transition-colors hover:border-accent/35 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold tracking-[0.16em] text-accent">{eyebrow}</span>
        <span className="grid size-9 place-items-center rounded-xl bg-canvas text-fg-3 transition-colors group-hover:text-accent">
          <Icon size={18} aria-hidden="true" />
        </span>
      </div>
      <h3 className="mt-5 text-lg font-bold text-fg">{title}</h3>
      <p className="mt-2 text-sm leading-7 text-fg-2">{body}</p>
    </article>
  );
}

function FocusSprint() {
  const [remaining, setRemaining] = useState(NOW_TIMER_SECONDS);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => {
      setRemaining((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          setRunning(false);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  function reset() {
    setRunning(false);
    setRemaining(NOW_TIMER_SECONDS);
  }

  return (
    <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6" aria-labelledby="focus-sprint-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.14em] text-accent">FOCUS SPRINT</p>
          <h2 id="focus-sprint-title" className="mt-2 text-xl font-bold text-fg">
            20분 첫 장면 스프린트
          </h2>
          <p className="mt-2 text-sm leading-7 text-fg-2">
            자료 탐색을 멈추고 썸네일 다섯 개를 만드는 데만 집중합니다.
          </p>
        </div>
        <Clock size={22} className="shrink-0 text-fg-3" aria-hidden="true" />
      </div>
      <time
        className="mt-6 block font-display text-5xl font-bold tabular-nums tracking-tight text-fg"
        dateTime={`PT${remaining}S`}
        aria-label={`남은 시간 ${formatTimer(remaining)}`}
      >
        {formatTimer(remaining)}
      </time>
      {remaining === 0 && (
        <p className="mt-3 font-semibold text-good" role="status">
          스프린트 완료. 가장 읽히는 썸네일 하나를 선택하세요.
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          className={ACTION_BUTTON}
          onClick={() => setRunning((current) => !current)}
          disabled={remaining === 0}
        >
          {running ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
          {running ? "일시정지" : "집중 시작"}
        </button>
        <button type="button" className={ACTION_BUTTON} onClick={reset}>
          <RotateCcw size={16} aria-hidden="true" /> 타이머 초기화
        </button>
      </div>
    </section>
  );
}

export function NowPage() {
  const nowRef = useRef(new Date());
  const archive = useMemo(
    () =>
      Array.from({ length: NOW_ARCHIVE_DAYS }, (_, offset) => {
        const day = getKstDay(nowRef.current, offset);
        return { day, theme: getThemeForDay(day) };
      }),
    [],
  );
  const [selectedOffset, setSelectedOffset] = useState(0);
  const [state, setState] = useState<NowState>(readStoredState);
  const [storageError, setStorageError] = useState("");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = archive[selectedOffset] ?? archive[0]!;
  const today = archive[0]!.day;
  const theme = selected.theme;
  const mode = getMode(state.mode);
  const storyBeats = buildStoryBeats(theme, mode);
  const selectedProgress = state.progressByDate[selected.day.iso] ?? [];
  const progressPercent = Math.round((selectedProgress.length / NOW_PROGRESS_STEPS.length) * 100);
  const streak = calculateStreak(state.completedDates, today.iso);
  const isSaved = state.savedDates.includes(selected.day.iso);
  const completedThisWeek = archive.filter(({ day }) => state.completedDates.includes(day.iso)).length;
  const assetHref = `/research/assets?q=${encodeURIComponent(theme.assetQuery)}&page=1`;
  const bookHref = `/research/books?q=${encodeURIComponent(theme.bookQuery)}&page=1`;

  useEffect(() => {
    try {
      window.localStorage.setItem(NOW_STORAGE_KEY, serializeNowState(state));
      setStorageError("");
    } catch {
      setStorageError("브라우저 저장 공간에 기록하지 못했습니다. 비공개 모드 또는 저장 용량을 확인하세요.");
    }
  }, [state]);

  useEffect(() => {
    function syncFromAnotherTab(event: StorageEvent) {
      if (event.key === NOW_STORAGE_KEY) setState(parseNowState(event.newValue));
    }
    window.addEventListener("storage", syncFromAnotherTab);
    return () => window.removeEventListener("storage", syncFromAnotherTab);
  }, []);

  useEffect(
    () => () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    },
    [],
  );

  function setMode(modeId: NowModeId) {
    setState((current) => ({ ...current, mode: modeId }));
  }

  function toggleSaved() {
    setState((current) => {
      const saved = current.savedDates.includes(selected.day.iso)
        ? current.savedDates.filter((date) => date !== selected.day.iso)
        : trimDates([...current.savedDates, selected.day.iso], 60);
      return { ...current, savedDates: saved };
    });
  }

  function toggleProgress(stepId: NowProgressStepId) {
    setState((current) => {
      const completedSteps = new Set(current.progressByDate[selected.day.iso] ?? []);
      if (completedSteps.has(stepId)) completedSteps.delete(stepId);
      else completedSteps.add(stepId);

      const nextSteps = NOW_PROGRESS_STEPS.map((step) => step.id).filter((id) => completedSteps.has(id));
      const progressByDate = { ...current.progressByDate };
      if (nextSteps.length > 0) progressByDate[selected.day.iso] = nextSteps;
      else delete progressByDate[selected.day.iso];

      const completedDates = new Set(current.completedDates);
      if (nextSteps.length === NOW_PROGRESS_STEPS.length) completedDates.add(selected.day.iso);
      else completedDates.delete(selected.day.iso);

      return {
        ...current,
        progressByDate,
        completedDates: trimDates([...completedDates], 400),
      };
    });
  }

  async function copyBrief() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(makeBriefText(selected.day, theme, mode));
      setCopyStatus("copied");
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopyStatus("idle"), 1800);
    } catch {
      setCopyStatus("error");
    }
  }

  return (
    <ResourceLayout
      title="오늘의 영감"
      intro="하루 한 장면을 발견하는 데서 끝내지 않고, 연출 방향을 고르고 5컷으로 시작해 완주 기록까지 남기는 데일리 창작 데스크입니다. 모든 진행 정보는 이 브라우저에만 저장됩니다."
    >
      <section className="relative overflow-hidden rounded-3xl border border-line bg-panel p-6 sm:p-10">
        <span className="absolute -right-12 -top-12 size-48 rounded-full bg-accent/15 blur-3xl" aria-hidden="true" />
        <span className="absolute -bottom-16 left-1/3 size-40 rounded-full bg-good/10 blur-3xl" aria-hidden="true" />
        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-accent">
              <Sparkles size={15} aria-hidden="true" />
              {selectedOffset === 0 ? "TODAY’S SPARK" : "SPARK ARCHIVE"} · {selected.day.label}
            </div>
            <h2 className="mt-5 text-balance font-display text-3xl font-bold leading-tight text-fg sm:text-5xl">
              {theme.title}
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-8 text-fg-2 sm:text-lg">{theme.tagline}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {theme.moods.map((mood) => (
                <Link
                  key={mood}
                  className="rounded-full border border-line bg-canvas/70 px-3 py-1 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/45 hover:text-accent"
                  to={`/research/assets?q=${encodeURIComponent(mood)}&page=1`}
                >
                  #{mood}
                </Link>
              ))}
            </div>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-on-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                to="/studio"
                reloadDocument
              >
                Studio에서 시작 <ArrowRight size={15} aria-hidden="true" />
              </Link>
              <button type="button" className={ACTION_BUTTON} onClick={() => void copyBrief()} aria-live="polite">
                {copyStatus === "copied" ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                {copyStatus === "copied" ? "브리프 복사됨" : "브리프 복사"}
              </button>
              <button
                type="button"
                className={cn(ACTION_BUTTON, isSaved && "border-accent/45 bg-accent-soft text-accent")}
                aria-pressed={isSaved}
                onClick={toggleSaved}
              >
                <Bookmark size={16} fill={isSaved ? "currentColor" : "none"} aria-hidden="true" />
                {isSaved ? "영감 저장 해제" : "영감 저장"}
              </button>
            </div>
            {copyStatus === "copied" && <span className="sr-only" role="status">브리프가 클립보드에 복사되었습니다.</span>}
            {copyStatus === "error" && (
              <p className="mt-3 text-sm font-semibold text-bad" role="alert">
                클립보드에 복사하지 못했습니다. 브라우저 권한을 확인하세요.
              </p>
            )}
          </div>

          <aside className="rounded-2xl border border-line bg-canvas/70 p-5" aria-label="이번 주 창작 페이스">
            <p className="text-xs font-bold tracking-[0.14em] text-accent">WEEKLY PULSE</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-line bg-panel p-3">
                <Flame size={18} className="text-warn" aria-hidden="true" />
                <strong className="mt-2 block text-2xl text-fg">{streak}일</strong>
                <span className="text-xs text-fg-3">연속 완주</span>
              </div>
              <div className="rounded-xl border border-line bg-panel p-3">
                <CheckCircle2 size={18} className="text-good" aria-hidden="true" />
                <strong className="mt-2 block text-2xl text-fg">{completedThisWeek}/7</strong>
                <span className="text-xs text-fg-3">최근 7일</span>
              </div>
            </div>
            <p className="mt-4 text-xs leading-6 text-fg-3">
              오늘을 아직 끝내지 않았어도 어제까지의 연속 기록은 유지됩니다.
            </p>
          </aside>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="spark-archive-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-accent">SEVEN-DAY ARCHIVE</p>
            <h2 id="spark-archive-title" className="mt-1 text-xl font-bold text-fg">
              놓친 영감 다시 열기
            </h2>
          </div>
          {selectedOffset > 0 && (
            <button type="button" className={ACTION_BUTTON} onClick={() => setSelectedOffset(0)}>
              오늘로 돌아가기
            </button>
          )}
        </div>
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2" aria-label="최근 7일 영감">
          {archive.map(({ day, theme: archiveTheme }, offset) => {
            const active = offset === selectedOffset;
            const completed = state.completedDates.includes(day.iso);
            const saved = state.savedDates.includes(day.iso);
            return (
              <button
                key={day.iso}
                type="button"
                aria-pressed={active}
                aria-label={`${day.shortLabel} · ${archiveTheme.title}${completed ? " · 완주" : ""}${saved ? " · 저장됨" : ""}`}
                onClick={() => setSelectedOffset(offset)}
                className={`min-h-28 min-w-40 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  active ? "border-accent bg-accent-soft" : "border-line bg-panel hover:border-accent/45"
                }`}
              >
                <span className="flex items-center justify-between gap-2 text-xs font-bold text-fg-3">
                  {offset === 0 ? "오늘" : day.shortLabel}
                  <span className="flex items-center gap-1">
                    {saved && <Bookmark size={13} className="text-accent" fill="currentColor" aria-hidden="true" />}
                    {completed && <CheckCircle2 size={14} className="text-good" aria-hidden="true" />}
                  </span>
                </span>
                <span className="mt-3 block line-clamp-2 text-sm font-bold leading-5 text-fg">{archiveTheme.title}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-panel p-5 sm:p-7" aria-labelledby="directing-mode-title">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <SlidersHorizontal size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-accent">DIRECTING MODE</p>
            <h2 id="directing-mode-title" className="mt-1 text-xl font-bold text-fg">
              같은 소재를 내 방식으로 보기
            </h2>
            <p className="mt-2 text-sm leading-7 text-fg-2">
              추천을 숨겨진 알고리즘에 맡기지 않고, 오늘 집중할 연출 문법을 직접 선택합니다.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" role="group" aria-label="연출 모드">
          {NOW_MODES.map((candidate) => {
            const active = state.mode === candidate.id;
            return (
              <button
                key={candidate.id}
                type="button"
                aria-pressed={active}
                onClick={() => setMode(candidate.id)}
                className={`rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  active ? "border-accent bg-accent-soft" : "border-line bg-canvas/60 hover:border-accent/45"
                }`}
              >
                <strong className="block text-sm text-fg">{candidate.label}</strong>
                <span className="mt-1 block text-xs leading-5 text-fg-3">{candidate.tagline}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            ["렌즈", mode.lens],
            ["색 설계", mode.palette],
            ["패널 리듬", mode.pacing],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-line bg-canvas/60 p-4">
              <span className="text-xs font-bold text-accent">{label}</span>
              <p className="mt-2 text-sm font-semibold leading-6 text-fg">{value}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 rounded-xl bg-accent-soft/60 p-4 text-sm leading-7 text-fg-2">{mode.note}</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2" aria-label="오늘의 장면 재료">
        <IngredientCard icon={PackageSearch} eyebrow="OBJECT" title="오늘의 사물" body={theme.object} />
        <IngredientCard icon={Building2} eyebrow="PLACE" title="오늘의 공간" body={theme.place} />
        <IngredientCard icon={CloudSun} eyebrow="LIGHT" title="오늘의 빛" body={theme.light} />
        <IngredientCard icon={Volume2} eyebrow="SOUND" title="오늘의 소리" body={theme.sound.join(" · ")} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
        <article className="rounded-2xl border border-accent/30 bg-accent-soft p-5 sm:p-7">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-canvas text-accent">
              <PanelsTopLeft size={20} aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-bold tracking-[0.14em] text-accent">FIVE-PANEL MISSION</p>
              <h2 className="mt-2 text-xl font-bold text-fg">오늘의 5컷 미션</h2>
              <p className="mt-3 text-base leading-8 text-fg-2">{theme.mission}</p>
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-line bg-panel p-5 sm:p-6" aria-labelledby="progress-title">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold tracking-[0.14em] text-accent">CREATION LOOP</p>
              <h2 id="progress-title" className="mt-2 text-xl font-bold text-fg">
                오늘의 진행률
              </h2>
            </div>
            <strong className="text-2xl tabular-nums text-fg">{progressPercent}%</strong>
          </div>
          <div
            className="mt-4 h-2 overflow-hidden rounded-full bg-canvas"
            role="progressbar"
            aria-label={`${selected.day.iso} 창작 진행률`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
          >
            <span className="block h-full rounded-full bg-accent transition-[width] motion-reduce:transition-none" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="mt-5 space-y-2">
            {NOW_PROGRESS_STEPS.map((step) => {
              const checked = selectedProgress.includes(step.id);
              return (
                <label
                  aria-label={`${step.label}: ${step.detail}`}
                  key={step.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                    checked ? "border-good/35 bg-good/10" : "border-line bg-canvas/50 hover:border-accent/35"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-1 size-4"
                    checked={checked}
                    onChange={() => toggleProgress(step.id)}
                  />
                  <span>
                    <strong className="block text-sm text-fg">{step.label}</strong>
                    <span className="mt-0.5 block text-xs leading-5 text-fg-3">{step.detail}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </article>
      </section>

      <section className="space-y-4" aria-labelledby="storyboard-title">
        <div>
          <p className="text-xs font-bold tracking-[0.14em] text-accent">STORY BEATS</p>
          <h2 id="storyboard-title" className="mt-1 text-xl font-bold text-fg">
            {mode.label}용 5컷 비트 보드
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-fg-2">
            정답이 아니라 첫 썸네일을 빠르게 만들기 위한 연출 발판입니다. 각 문장을 그대로 복사하기보다 화면 안의 정보 순서로 번역하세요.
          </p>
        </div>
        <ol className="grid gap-3 lg:grid-cols-5">
          {storyBeats.map((beat, index) => (
            <li key={beat.id} className="relative rounded-2xl border border-line bg-panel p-4">
              <span className="text-xs font-black tracking-[0.14em] text-accent">{beat.label}</span>
              <h3 className="mt-3 text-sm font-bold leading-6 text-fg">{beat.title}</h3>
              <p className="mt-2 text-xs leading-6 text-fg-2">{beat.body}</p>
              {index < storyBeats.length - 1 && (
                <ArrowRight
                  size={15}
                  className="absolute -right-2.5 top-1/2 hidden -translate-y-1/2 rounded-full bg-canvas text-fg-3 lg:block"
                  aria-hidden="true"
                />
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <FocusSprint />
        <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6" aria-labelledby="research-launchpad-title">
          <p className="text-xs font-bold tracking-[0.14em] text-accent">RESEARCH LAUNCHPAD</p>
          <h2 id="research-launchpad-title" className="mt-2 text-xl font-bold text-fg">
            필요한 자료만 짧게 찾기
          </h2>
          <p className="mt-2 text-sm leading-7 text-fg-2">
            탐색이 제작을 대신하지 않도록 사물·공간과 작품 조사 경로를 분리했습니다. 외부 자료의 권리와 출처는 각 카드에서 확인하세요.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <article className="rounded-xl border border-line bg-canvas/60 p-4">
              <PackageSearch size={18} className="text-accent" aria-hidden="true" />
              <h3 className="mt-3 text-sm font-bold text-fg">사물·공간 레퍼런스</h3>
              <p className="mt-1 text-xs leading-5 text-fg-3">공개 미술 자료에서 오늘의 장면 요소를 찾습니다.</p>
              <Link className={`${RESOURCE_BUTTON} mt-4`} to={assetHref}>
                창작 자료 검색 <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </article>
            <article className="rounded-xl border border-line bg-canvas/60 p-4">
              <Sparkles size={18} className="text-accent" aria-hidden="true" />
              <h3 className="mt-3 text-sm font-bold text-fg">작품·판본 리서치</h3>
              <p className="mt-1 text-xs leading-5 text-fg-3">관련 키워드의 작품과 판본 메타데이터를 비교합니다.</p>
              <Link className={`${RESOURCE_BUTTON} mt-4`} to={bookHref}>
                글로벌 판본 검색 <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </article>
          </div>
          <Link className={`${RESOURCE_BUTTON} mt-4`} to="/research">
            연구 보드 전체 열기
          </Link>
        </section>
      </section>

      <LocalSaveNotice error={storageError || undefined} writable={!storageError} />

      <aside className="flex items-start gap-3 rounded-2xl border border-line bg-card/40 p-5 text-sm leading-7 text-fg-2">
        <ShieldCheck size={20} className="mt-0.5 shrink-0 text-good" aria-hidden="true" />
        <p>
          오늘의 주제·미션·연출 가이드는 ToonStudio의 오리지널 에디토리얼 콘텐츠입니다. 외부 자료는 Studio에 자동 삽입하지 않으며,
          원문·출처·현재 이용조건을 확인한 뒤 사용해야 합니다. 기준일: {selected.day.iso}
        </p>
      </aside>
    </ResourceLayout>
  );
}
