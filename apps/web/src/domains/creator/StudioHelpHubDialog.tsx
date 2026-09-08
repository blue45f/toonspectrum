import {
  ArrowLeft,
  BookOpen,
  Bookmark,
  Bug,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Command,
  ExternalLink,
  GraduationCap,
  Home,
  Keyboard,
  LifeBuoy,
  Search,
  Sparkles,
  Stethoscope,
  ThumbsDown,
  ThumbsUp,
  WifiOff,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { STUDIO_SHORTCUT_ACTIONS, formatStudioShortcutChord } from "./studio-app-settings";
import { buildStudioToolHelp } from "./studio-current-tool-help";
import { requestStudioCommandSearch } from "./studio-help-center-channel";
import {
  STUDIO_HELP_ARTICLES,
  STUDIO_HELP_CATEGORY_LABELS,
  STUDIO_HELP_GUIDES,
  STUDIO_HELP_UPDATES,
  findStudioHelpArticle,
  recommendStudioHelpArticles,
  searchStudioHelpArticles,
  studioHelpText,
  type StudioHelpArticle,
  type StudioHelpLocale,
} from "./studio-help-knowledge";
import { studioSearchTextMatches } from "./studio-search-text";
import { STUDIO_Z_CLASS } from "./studio-z-index";

import { useI18n, useT } from "@/shared/lib/i18n";

import type { StudioHelpCenterSection } from "./studio-help-center-channel";
import type { StudioHelpHubActions, StudioHelpHubTab } from "./studio-help-hub-channel";

export interface StudioHelpHubDialogProps {
  readonly open: boolean;
  readonly initialTab: StudioHelpHubTab;
  readonly initialQuery: string;
  readonly toolCommandId: string | null;
  readonly actions: StudioHelpHubActions;
  readonly onOpenLegacySection: (section: StudioHelpCenterSection) => void;
  readonly onClose: () => void;
}

const STORAGE_KEYS = {
  bookmarks: "toonspectrum-studio-help:bookmarks:v1",
  recentSearches: "toonspectrum-studio-help:recent-searches:v1",
  guideProgress: "toonspectrum-studio-help:guide-progress:v1",
  feedback: "toonspectrum-studio-help:feedback:v1",
  updatesSeen: "toonspectrum-studio-help:updates-seen:v1",
} as const;

interface HelpHubCopy {
  readonly title: string;
  readonly subtitle: string;
  readonly close: string;
  readonly searchLabel: string;
  readonly searchPlaceholder: string;
  readonly clearSearch: string;
  readonly searchResults: (count: number) => string;
  readonly noResults: string;
  readonly noResultsBody: string;
  readonly recentSearches: string;
  readonly clearHistory: string;
  readonly currentTool: string;
  readonly recommended: string;
  readonly quickActions: string;
  readonly saved: string;
  readonly allTopics: string;
  readonly readMinutes: (minutes: number) => string;
  readonly back: string;
  readonly steps: string;
  readonly helpful: string;
  readonly helpfulThanks: string;
  readonly bookmark: string;
  readonly removeBookmark: string;
  readonly offlineTitle: string;
  readonly offlineBody: string;
  readonly progress: (completed: number, total: number) => string;
  readonly outcome: string;
  readonly openFullTutorial: string;
  readonly openFullShortcuts: string;
  readonly defaultShortcutNotice: string;
  readonly showAll: string;
  readonly technicalTools: string;
  readonly updatesSeen: string;
}

const COPY: Readonly<Record<StudioHelpLocale, HelpHubCopy>> = {
  ko: {
    title: "도움말 · 배우기",
    subtitle: "지금 하는 작업에 맞춰 찾고, 따라 하고, 문제를 해결하세요.",
    close: "도움말 닫기",
    searchLabel: "도움말, 기능, 단축키 검색",
    searchPlaceholder: "예: 채우기 틈, 선 떨림, 내보내기, ⌘Z",
    clearSearch: "검색어 지우기",
    searchResults: (count) => `검색 결과 ${count}개`,
    noResults: "맞는 도움말을 찾지 못했습니다",
    noResultsBody: "짧은 기능 이름이나 증상으로 다시 검색하거나 F1 통합 검색을 사용해 보세요.",
    recentSearches: "최근 검색",
    clearHistory: "기록 지우기",
    currentTool: "현재 도구",
    recommended: "지금 추천",
    quickActions: "바로가기",
    saved: "저장한 도움말",
    allTopics: "주제별 도움말",
    readMinutes: (minutes) => `약 ${minutes}분`,
    back: "목록으로",
    steps: "확인 순서",
    helpful: "이 도움말이 문제 해결에 도움이 되었나요?",
    helpfulThanks: "의견이 이 기기에 저장되었습니다.",
    bookmark: "저장",
    removeBookmark: "저장 해제",
    offlineTitle: "현재 오프라인입니다",
    offlineBody: "외부 매뉴얼보다 로컬 저장·복구 안전 수칙을 먼저 보여 드립니다.",
    progress: (completed, total) => `${completed}/${total} 완료`,
    outcome: "완성 목표",
    openFullTutorial: "인터랙티브 튜토리얼 열기",
    openFullShortcuts: "전체 단축키 · 사용자 설정 보기",
    defaultShortcutNotice: "아래 키는 기본값입니다. 실제 사용자 설정은 전체 단축키에서 확인하세요.",
    showAll: "전체 보기",
    technicalTools: "기술 지원 도구",
    updatesSeen: "업데이트를 모두 확인함",
  },
  en: {
    title: "Help and learning",
    subtitle: "Find guidance for the task at hand, follow a path, or troubleshoot a problem.",
    close: "Close help",
    searchLabel: "Search help, features and shortcuts",
    searchPlaceholder: "Try fill gaps, wobbly lines, export, or ⌘Z",
    clearSearch: "Clear search",
    searchResults: (count) => `${count} search result${count === 1 ? "" : "s"}`,
    noResults: "No matching guidance",
    noResultsBody: "Try a shorter feature name or symptom, or open F1 command search.",
    recentSearches: "Recent searches",
    clearHistory: "Clear history",
    currentTool: "Current tool",
    recommended: "Recommended now",
    quickActions: "Quick actions",
    saved: "Saved guidance",
    allTopics: "Browse by topic",
    readMinutes: (minutes) => `About ${minutes} min`,
    back: "Back to list",
    steps: "Steps to check",
    helpful: "Did this guidance help solve the problem?",
    helpfulThanks: "Your response was saved on this device.",
    bookmark: "Save",
    removeBookmark: "Remove saved item",
    offlineTitle: "You are offline",
    offlineBody: "Local save and recovery guidance is prioritised over external documentation.",
    progress: (completed, total) => `${completed}/${total} complete`,
    outcome: "Target outcome",
    openFullTutorial: "Open interactive tutorials",
    openFullShortcuts: "Open all shortcuts and custom settings",
    defaultShortcutNotice: "These are defaults. Open the full shortcut reference for your current mappings.",
    showAll: "Show all",
    technicalTools: "Technical support tools",
    updatesSeen: "All updates reviewed",
  },
};

const NAV_ITEMS: readonly {
  readonly id: StudioHelpHubTab;
  readonly label: Readonly<Record<StudioHelpLocale, string>>;
  readonly icon: LucideIcon;
}[] = [
  { id: "home", label: { ko: "홈", en: "Home" }, icon: Home },
  { id: "learn", label: { ko: "따라 배우기", en: "Guided learning" }, icon: GraduationCap },
  { id: "shortcuts", label: { ko: "단축키", en: "Shortcuts" }, icon: Keyboard },
  { id: "solve", label: { ko: "문제 해결", en: "Troubleshoot" }, icon: Wrench },
  { id: "updates", label: { ko: "새 기능", en: "What's new" }, icon: Sparkles },
];

const TECHNICAL_SECTION_LABELS: Readonly<
  Record<Extract<StudioHelpCenterSection, "terminology" | "diagnostics" | "recovery" | "bug-report">, Readonly<Record<StudioHelpLocale, string>>>
> = {
  terminology: { ko: "용어 사전 열기", en: "Open terminology" },
  diagnostics: { ko: "기기 · 브라우저 진단", en: "Device and browser diagnostics" },
  recovery: { ko: "복구 가이드 열기", en: "Open recovery guide" },
  "bug-report": { ko: "버그 리포트 패키지", en: "Build a bug report package" },
};

type GuideProgress = Record<string, readonly string[]>;
type FeedbackMap = Record<string, "yes" | "no">;

function readStoredJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Help must remain usable when storage is unavailable or full.
  }
}

function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <h3 className="text-[0.72rem] font-semibold uppercase tracking-wide text-fg-3">{children}</h3>
      {action}
    </div>
  );
}

function ArticleCard({
  article,
  locale,
  copy,
  bookmarked,
  onOpen,
  onToggleBookmark,
}: {
  article: StudioHelpArticle;
  locale: StudioHelpLocale;
  copy: HelpHubCopy;
  bookmarked: boolean;
  onOpen: () => void;
  onToggleBookmark: () => void;
}) {
  return (
    <article className="group relative rounded-xl border border-line bg-card p-3 transition hover:border-accent/40 hover:bg-raised/60">
      <button type="button" className="block w-full pr-9 text-left" onClick={onOpen}>
        <span className="text-[0.66rem] font-medium text-accent">
          {studioHelpText(STUDIO_HELP_CATEGORY_LABELS[article.category], locale)}
        </span>
        <span className="mt-1 block text-sm font-semibold text-fg">
          {studioHelpText(article.title, locale)}
        </span>
        <span className="mt-1 block text-xs leading-relaxed text-fg-3">
          {studioHelpText(article.summary, locale)}
        </span>
        <span className="mt-2 inline-flex items-center gap-1 text-[0.66rem] text-fg-3">
          <Clock3 className="size-3" aria-hidden />
          {copy.readMinutes(article.readMinutes)}
        </span>
      </button>
      <button
        type="button"
        onClick={onToggleBookmark}
        aria-label={bookmarked ? copy.removeBookmark : copy.bookmark}
        aria-pressed={bookmarked}
        className="absolute right-2 top-2 grid size-9 place-items-center rounded-lg text-fg-3 hover:bg-panel hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Bookmark className={`size-4 ${bookmarked ? "fill-current text-accent" : ""}`} aria-hidden />
      </button>
    </article>
  );
}

export function StudioHelpHubDialog({
  open,
  initialTab,
  initialQuery,
  toolCommandId,
  actions,
  onOpenLegacySection,
  onClose,
}: StudioHelpHubDialogProps) {
  const language = useI18n((state) => state.lang);
  const locale: StudioHelpLocale = language.toLocaleLowerCase().startsWith("ko") ? "ko" : "en";
  const copy = COPY[locale];
  const t = useT();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const closeFromEffect = useEffectEvent(onClose);

  const [activeTab, setActiveTab] = useState<StudioHelpHubTab>(initialTab);
  const [query, setQuery] = useState(initialQuery);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<readonly string[]>(() =>
    readStoredJson<readonly string[]>(STORAGE_KEYS.bookmarks, []),
  );
  const [recentSearches, setRecentSearches] = useState<readonly string[]>(() =>
    readStoredJson<readonly string[]>(STORAGE_KEYS.recentSearches, []),
  );
  const [guideProgress, setGuideProgress] = useState<GuideProgress>(() =>
    readStoredJson<GuideProgress>(STORAGE_KEYS.guideProgress, {}),
  );
  const [feedback, setFeedback] = useState<FeedbackMap>(() =>
    readStoredJson<FeedbackMap>(STORAGE_KEYS.feedback, {}),
  );
  const [updatesSeen, setUpdatesSeen] = useState(() =>
    readStoredJson<boolean>(STORAGE_KEYS.updatesSeen, false),
  );
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    if (!open) return;
    setActiveTab(initialTab);
    setQuery(initialQuery);
    setSelectedArticleId(null);
  }, [initialQuery, initialTab, open]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const update = () => setOnline(window.navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [open]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousBodyOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const overlay = overlayRef.current;
    const inertStates: Array<readonly [HTMLElement, boolean]> = [];
    for (const child of document.body.children) {
      if (!(child instanceof HTMLElement) || child === overlay) continue;
      inertStates.push([child, child.inert]);
      child.inert = true;
    }

    const focusSearch = () => searchRef.current?.focus({ preventScroll: true });
    const usesAnimationFrame = typeof window.requestAnimationFrame === "function";
    const focusTask = usesAnimationFrame
      ? window.requestAnimationFrame(focusSearch)
      : window.setTimeout(focusSearch, 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeFromEffect();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [])].filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      if (usesAnimationFrame) window.cancelAnimationFrame(focusTask);
      else window.clearTimeout(focusTask);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
      for (const [element, wasInert] of inertStates) element.inert = wasInert;
      const opener = openerRef.current;
      openerRef.current = null;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open]);

  const selectedArticle = useMemo(
    () => findStudioHelpArticle(selectedArticleId),
    [selectedArticleId],
  );
  const currentTool = useMemo(
    () => (toolCommandId ? buildStudioToolHelp(toolCommandId) : null),
    [toolCommandId],
  );
  const recommended = useMemo(
    () => recommendStudioHelpArticles({ toolCommandId, online, limit: 4 }),
    [online, toolCommandId],
  );
  const articleResults = useMemo(
    () => searchStudioHelpArticles(query, locale).slice(0, 12),
    [locale, query],
  );
  const shortcutResults = useMemo(
    () => STUDIO_SHORTCUT_ACTIONS.filter((action) =>
      studioSearchTextMatches(query, [t(action.labelKey), action.label, action.defaultKeys]),
    ),
    [query, t],
  );
  const searching = query.trim().length > 0;

  const rememberSearch = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setRecentSearches((current) => {
      const next = [trimmed, ...current.filter((item) => item !== trimmed)].slice(0, 6);
      writeStoredJson(STORAGE_KEYS.recentSearches, next);
      return next;
    });
  }, []);

  const openArticle = useCallback((article: StudioHelpArticle) => {
    rememberSearch(query);
    setSelectedArticleId(article.id);
  }, [query, rememberSearch]);

  const toggleBookmark = useCallback((articleId: string) => {
    setBookmarks((current) => {
      const next = current.includes(articleId)
        ? current.filter((id) => id !== articleId)
        : [...current, articleId];
      writeStoredJson(STORAGE_KEYS.bookmarks, next);
      return next;
    });
  }, []);

  const toggleGuideStep = useCallback((guideId: string, stepId: string) => {
    setGuideProgress((current) => {
      const completed = current[guideId] ?? [];
      const nextCompleted = completed.includes(stepId)
        ? completed.filter((id) => id !== stepId)
        : [...completed, stepId];
      const next = { ...current, [guideId]: nextCompleted };
      writeStoredJson(STORAGE_KEYS.guideProgress, next);
      return next;
    });
  }, []);

  const setArticleFeedback = useCallback((articleId: string, value: "yes" | "no") => {
    setFeedback((current) => {
      const next = { ...current, [articleId]: value };
      writeStoredJson(STORAGE_KEYS.feedback, next);
      return next;
    });
  }, []);

  const exitThen = useCallback((action: () => unknown) => {
    onClose();
    window.setTimeout(() => {
      action();
    }, 0);
  }, [onClose]);

  const openCommandSearch = useCallback(() => {
    rememberSearch(query);
    exitThen(() => requestStudioCommandSearch());
  }, [exitThen, query, rememberSearch]);

  const openManual = useCallback(() => {
    window.open("/studio/manual", "_blank", "noopener,noreferrer");
  }, []);

  const savedArticles = bookmarks
    .map((id) => findStudioHelpArticle(id))
    .filter((article): article is StudioHelpArticle => article !== null);

  const renderArticleDetail = (article: StudioHelpArticle) => (
    <article className="mx-auto max-w-3xl">
      <button
        type="button"
        onClick={() => setSelectedArticleId(null)}
        className="mb-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {copy.back}
      </button>
      <div className="rounded-2xl border border-line bg-card p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.68rem] font-semibold text-accent">
              {studioHelpText(STUDIO_HELP_CATEGORY_LABELS[article.category], locale)}
              <span className="mx-1.5 text-fg-3">·</span>
              {copy.readMinutes(article.readMinutes)}
            </p>
            <h2 className="mt-1 text-xl font-bold leading-tight text-fg">
              {studioHelpText(article.title, locale)}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => toggleBookmark(article.id)}
            aria-label={bookmarks.includes(article.id) ? copy.removeBookmark : copy.bookmark}
            aria-pressed={bookmarks.includes(article.id)}
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-line px-3 text-xs font-semibold text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Bookmark className={`size-4 ${bookmarks.includes(article.id) ? "fill-current text-accent" : ""}`} aria-hidden />
            {bookmarks.includes(article.id) ? copy.removeBookmark : copy.bookmark}
          </button>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-fg-2">
          {studioHelpText(article.summary, locale)}
        </p>
        <h3 className="mt-6 text-sm font-semibold text-fg">{copy.steps}</h3>
        <ol className="mt-3 space-y-3">
          {article.steps.map((step, index) => (
            <li key={`${article.id}:${index}`} className="flex gap-3 rounded-xl border border-line/70 bg-panel/50 p-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent">
                {index + 1}
              </span>
              <p className="pt-0.5 text-sm leading-relaxed text-fg-2">{studioHelpText(step, locale)}</p>
            </li>
          ))}
        </ol>
        <div className="mt-5 flex flex-wrap gap-2 border-t border-line/60 pt-4">
          <button
            type="button"
            onClick={openCommandSearch}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-panel px-3 text-xs font-semibold text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Command className="size-4" aria-hidden />
            F1
          </button>
          {article.technicalSection ? (
            <button
              type="button"
              onClick={() => onOpenLegacySection(article.technicalSection!)}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-panel px-3 text-xs font-semibold text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <LifeBuoy className="size-4" aria-hidden />
              {TECHNICAL_SECTION_LABELS[article.technicalSection][locale]}
            </button>
          ) : null}
          <button
            type="button"
            onClick={openManual}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-panel px-3 text-xs font-semibold text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <ExternalLink className="size-4" aria-hidden />
            {locale === "ko" ? "전체 매뉴얼" : "Full manual"}
          </button>
        </div>
      </div>
      <div className="mt-3 rounded-2xl border border-line bg-card p-4">
        <p className="text-sm font-semibold text-fg">{copy.helpful}</p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => setArticleFeedback(article.id, "yes")}
            aria-pressed={feedback[article.id] === "yes"}
            className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${feedback[article.id] === "yes" ? "border-accent bg-accent-soft text-accent" : "border-line text-fg-2 hover:bg-raised"}`}
          >
            <ThumbsUp className="size-4" aria-hidden />
            {locale === "ko" ? "예" : "Yes"}
          </button>
          <button
            type="button"
            onClick={() => setArticleFeedback(article.id, "no")}
            aria-pressed={feedback[article.id] === "no"}
            className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${feedback[article.id] === "no" ? "border-accent bg-accent-soft text-accent" : "border-line text-fg-2 hover:bg-raised"}`}
          >
            <ThumbsDown className="size-4" aria-hidden />
            {locale === "ko" ? "아니요" : "No"}
          </button>
        </div>
        {feedback[article.id] ? <p className="mt-2 text-[0.68rem] text-fg-3">{copy.helpfulThanks}</p> : null}
      </div>
    </article>
  );

  const renderSearchResults = () => (
    <section aria-live="polite">
      <SectionTitle>{copy.searchResults(articleResults.length + shortcutResults.length)}</SectionTitle>
      {articleResults.length + shortcutResults.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-card/50 px-4 py-10 text-center">
          <CircleHelp className="mx-auto size-8 text-fg-3" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-fg">{copy.noResults}</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-fg-3">{copy.noResultsBody}</p>
          <button
            type="button"
            onClick={openCommandSearch}
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-accent px-4 text-xs font-semibold text-on-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Command className="size-4" aria-hidden />
            F1
          </button>
        </div>
      ) : (
        <div className="grid gap-2 lg:grid-cols-2">
          {articleResults.map((article) => (
            <ArticleCard
              key={article.id}
              article={article}
              locale={locale}
              copy={copy}
              bookmarked={bookmarks.includes(article.id)}
              onOpen={() => openArticle(article)}
              onToggleBookmark={() => toggleBookmark(article.id)}
            />
          ))}
          {shortcutResults.slice(0, 8).map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => {
                rememberSearch(query);
                setActiveTab("shortcuts");
              }}
              className="flex min-h-16 items-center justify-between gap-3 rounded-xl border border-line bg-card px-3 text-left hover:border-accent/40 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <span>
                <span className="block text-[0.66rem] font-medium text-accent">{locale === "ko" ? "단축키" : "Shortcut"}</span>
                <span className="mt-0.5 block text-sm font-semibold text-fg">{t(action.labelKey)}</span>
              </span>
              <kbd className="shrink-0 rounded-lg border border-line bg-panel px-2 py-1 font-mono text-xs text-fg-2">
                {formatStudioShortcutChord(action.defaultKeys)}
              </kbd>
            </button>
          ))}
        </div>
      )}
    </section>
  );

  const renderHome = () => (
    <div className="space-y-5">
      {!online ? (
        <div className="flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-fg">
          <WifiOff className="mt-0.5 size-5 shrink-0 text-amber-500" aria-hidden />
          <div>
            <p className="text-sm font-semibold">{copy.offlineTitle}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-fg-3">{copy.offlineBody}</p>
          </div>
        </div>
      ) : null}

      {currentTool ? (
        <section>
          <SectionTitle>{copy.currentTool}</SectionTitle>
          <div className="rounded-2xl border border-accent/30 bg-gradient-to-br from-accent-soft/40 via-card to-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-bold text-fg">{currentTool.label}</span>
              {currentTool.labelEn ? <span className="text-xs text-fg-3">{currentTool.labelEn}</span> : null}
              {currentTool.shortcut ? (
                <kbd className="rounded-md border border-line bg-panel px-2 py-0.5 font-mono text-[0.68rem] text-fg-2">
                  {currentTool.shortcut}
                </kbd>
              ) : null}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-fg-3">
              {currentTool.description ?? (locale === "ko" ? "이 도구와 관련된 도움말을 추천합니다." : "Recommended guidance for this tool.")}
            </p>
            {currentTool.aliases.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {currentTool.aliases.slice(0, 4).map((alias) => (
                  <span key={`${alias.vendor}:${alias.term}`} className="rounded-full border border-line bg-panel/80 px-2 py-0.5 text-[0.62rem] text-fg-3">
                    {alias.term}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <section>
        <SectionTitle>{copy.quickActions}</SectionTitle>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <button type="button" onClick={openCommandSearch} className="flex min-h-20 items-start gap-3 rounded-xl border border-line bg-card p-3 text-left hover:border-accent/40 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
            <Command className="mt-0.5 size-5 text-accent" aria-hidden />
            <span><b className="block text-sm text-fg">F1</b><span className="mt-0.5 block text-xs leading-relaxed text-fg-3">{locale === "ko" ? "명령 · 속성 · 도움말 통합 검색" : "Search commands, properties and help"}</span></span>
          </button>
          <button type="button" onClick={() => setActiveTab("learn")} className="flex min-h-20 items-start gap-3 rounded-xl border border-line bg-card p-3 text-left hover:border-accent/40 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
            <GraduationCap className="mt-0.5 size-5 text-accent" aria-hidden />
            <span><b className="block text-sm text-fg">{locale === "ko" ? "단계별 학습" : "Guided learning"}</b><span className="mt-0.5 block text-xs leading-relaxed text-fg-3">{locale === "ko" ? "목표별 체크리스트로 끝까지 따라가기" : "Follow goal-based checklists"}</span></span>
          </button>
          <button type="button" onClick={() => setActiveTab("shortcuts")} className="flex min-h-20 items-start gap-3 rounded-xl border border-line bg-card p-3 text-left hover:border-accent/40 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
            <Keyboard className="mt-0.5 size-5 text-accent" aria-hidden />
            <span><b className="block text-sm text-fg">?</b><span className="mt-0.5 block text-xs leading-relaxed text-fg-3">{locale === "ko" ? "기능 이름과 키로 단축키 찾기" : "Find shortcuts by feature or key"}</span></span>
          </button>
          <button type="button" onClick={() => setActiveTab("solve")} className="flex min-h-20 items-start gap-3 rounded-xl border border-line bg-card p-3 text-left hover:border-accent/40 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
            <LifeBuoy className="mt-0.5 size-5 text-accent" aria-hidden />
            <span><b className="block text-sm text-fg">{locale === "ko" ? "문제 해결" : "Troubleshoot"}</b><span className="mt-0.5 block text-xs leading-relaxed text-fg-3">{locale === "ko" ? "진단 · 복구 · 버그 리포트" : "Diagnostics, recovery and bug reports"}</span></span>
          </button>
        </div>
      </section>

      <section>
        <SectionTitle>{copy.recommended}</SectionTitle>
        <div className="grid gap-2 lg:grid-cols-2">
          {recommended.map((article) => (
            <ArticleCard
              key={article.id}
              article={article}
              locale={locale}
              copy={copy}
              bookmarked={bookmarks.includes(article.id)}
              onOpen={() => openArticle(article)}
              onToggleBookmark={() => toggleBookmark(article.id)}
            />
          ))}
        </div>
      </section>

      {savedArticles.length > 0 ? (
        <section>
          <SectionTitle>{copy.saved}</SectionTitle>
          <div className="grid gap-2 lg:grid-cols-2">
            {savedArticles.slice(0, 4).map((article) => (
              <ArticleCard
                key={article.id}
                article={article}
                locale={locale}
                copy={copy}
                bookmarked
                onOpen={() => openArticle(article)}
                onToggleBookmark={() => toggleBookmark(article.id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <SectionTitle>{copy.allTopics}</SectionTitle>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(STUDIO_HELP_CATEGORY_LABELS).map(([category, label]) => {
            const count = STUDIO_HELP_ARTICLES.filter((article) => article.category === category).length;
            return (
              <button
                key={category}
                type="button"
                onClick={() => setQuery(studioHelpText(label, locale))}
                className="flex min-h-14 items-center justify-between rounded-xl border border-line bg-card px-3 text-left hover:border-accent/40 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                <span className="text-sm font-semibold text-fg">{studioHelpText(label, locale)}</span>
                <span className="text-xs text-fg-3">{count}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );

  const renderLearn = () => (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card p-4">
        <div>
          <h2 className="text-lg font-bold text-fg">{locale === "ko" ? "목표를 끝까지 따라가는 학습 경로" : "Guided paths that end in a result"}</h2>
          <p className="mt-1 text-xs leading-relaxed text-fg-3">{locale === "ko" ? "체크 상태는 이 브라우저에만 저장되며 언제든 직접 해제할 수 있습니다." : "Checklist progress is stored only in this browser and can be changed at any time."}</p>
        </div>
        {actions.openFeatureTutorial ? (
          <button type="button" onClick={() => exitThen(actions.openFeatureTutorial!)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-accent px-4 text-xs font-semibold text-on-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            <BookOpen className="size-4" aria-hidden />
            {copy.openFullTutorial}
          </button>
        ) : null}
      </div>
      {STUDIO_HELP_GUIDES.map((guide) => {
        const completed = guideProgress[guide.id] ?? [];
        return (
          <section key={guide.id} className="rounded-2xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-[0.68rem] text-fg-3">
                  <span>{copy.readMinutes(guide.minutes)}</span>
                  <span aria-hidden>·</span>
                  <span>{copy.progress(completed.length, guide.steps.length)}</span>
                </div>
                <h2 className="mt-1 text-base font-bold text-fg">{studioHelpText(guide.title, locale)}</h2>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-fg-3">{studioHelpText(guide.summary, locale)}</p>
              </div>
              <div className="min-w-36 rounded-xl bg-panel px-3 py-2 text-xs text-fg-2">
                <span className="block text-[0.62rem] font-semibold uppercase tracking-wide text-fg-3">{copy.outcome}</span>
                <span className="mt-1 block leading-relaxed">{studioHelpText(guide.outcome, locale)}</span>
              </div>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-panel" aria-hidden>
              <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.round((completed.length / guide.steps.length) * 100)}%` }} />
            </div>
            <ol className="mt-3 space-y-1.5">
              {guide.steps.map((step) => {
                const article = findStudioHelpArticle(step.articleId);
                const checked = completed.includes(step.id);
                return (
                  <li key={step.id} className="flex min-h-12 items-center gap-2 rounded-xl border border-line/70 bg-panel/40 px-2.5 py-1.5">
                    <label className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-lg hover:bg-raised">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleGuideStep(guide.id, step.id)}
                        className="peer sr-only"
                      />
                      <span className={`grid size-5 place-items-center rounded-md border ${checked ? "border-accent bg-accent text-on-accent" : "border-line bg-card"}`} aria-hidden>
                        {checked ? <Check className="size-3.5" /> : null}
                      </span>
                      <span className="sr-only">{studioHelpText(step.label, locale)}</span>
                    </label>
                    <button
                      type="button"
                      disabled={!article}
                      onClick={() => article && openArticle(article)}
                      className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg px-1.5 py-2 text-left hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      <span className={`truncate text-sm ${checked ? "text-fg-3 line-through" : "font-medium text-fg"}`}>{studioHelpText(step.label, locale)}</span>
                      <ChevronRight className="size-4 shrink-0 text-fg-3" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );

  const renderShortcuts = () => (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-card p-4">
        <h2 className="text-lg font-bold text-fg">{locale === "ko" ? "키를 외우기보다 동작으로 찾으세요" : "Search by action instead of memorising keys"}</h2>
        <p className="mt-1 text-xs leading-relaxed text-fg-3">{copy.defaultShortcutNotice}</p>
        {actions.openShortcuts ? (
          <button type="button" onClick={() => exitThen(actions.openShortcuts!)} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-accent px-4 text-xs font-semibold text-on-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            <Keyboard className="size-4" aria-hidden />
            {copy.openFullShortcuts}
          </button>
        ) : null}
      </div>
      {shortcutResults.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-fg-3">{copy.noResults}</div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {shortcutResults.map((action) => (
            <div key={action.id} className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-line bg-card px-3">
              <span className="text-xs font-medium text-fg-2">{t(action.labelKey)}</span>
              <kbd className="shrink-0 rounded-lg border border-line bg-panel px-2 py-1 font-mono text-[0.68rem] text-fg">
                {formatStudioShortcutChord(action.defaultKeys)}
              </kbd>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderSolve = () => (
    <div className="space-y-5">
      <div className="rounded-2xl border border-line bg-card p-4">
        <h2 className="text-lg font-bold text-fg">{locale === "ko" ? "증상에서 해결 도구로 바로 이동" : "Go from symptom to the right support tool"}</h2>
        <p className="mt-1 text-xs leading-relaxed text-fg-3">{locale === "ko" ? "진단 정보는 사용자가 복사하거나 내려받기 전까지 기기 밖으로 전송하지 않습니다." : "Diagnostic information stays on-device until you choose to copy or download it."}</p>
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        {[
          { section: "diagnostics" as const, icon: Stethoscope, title: locale === "ko" ? "느림 · 검은 화면 · 입력 문제" : "Slowness, black canvas or input issues", body: locale === "ko" ? "브라우저·GPU·저장소·렌더 백엔드를 실제 값으로 점검합니다." : "Inspect browser, GPU, storage and render backend using measured values." },
          { section: "recovery" as const, icon: LifeBuoy, title: locale === "ko" ? "초안·작업 복구" : "Draft and work recovery", body: locale === "ko" ? "로컬 저장소와 복구 후보를 덮어쓰기 전에 안전하게 확인합니다." : "Inspect local storage and recovery candidates before overwriting them." },
          { section: "bug-report" as const, icon: Bug, title: locale === "ko" ? "재현되는 오류 신고" : "Report a reproducible problem", body: locale === "ko" ? "포함·제외 항목을 먼저 보여 주고 오류 저널과 진단 패키지를 만듭니다." : "Review included and excluded data, then build a diagnostic package." },
          { section: "terminology" as const, icon: Command, title: locale === "ko" ? "CSP · Photoshop 용어로 찾기" : "Find features using CSP or Photoshop terms", body: locale === "ko" ? "익숙한 타사 도구 이름을 툰스튜디오 명령과 연결합니다." : "Map familiar editor terms to ToonStudio commands." },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.section} type="button" onClick={() => onOpenLegacySection(item.section)} className="flex min-h-28 items-start gap-3 rounded-2xl border border-line bg-card p-4 text-left hover:border-accent/40 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><Icon className="size-5" aria-hidden /></span>
              <span className="min-w-0"><b className="block text-sm text-fg">{item.title}</b><span className="mt-1 block text-xs leading-relaxed text-fg-3">{item.body}</span><span className="mt-2 inline-flex items-center gap-1 text-[0.68rem] font-semibold text-accent">{locale === "ko" ? "열기" : "Open"}<ChevronRight className="size-3.5" aria-hidden /></span></span>
            </button>
          );
        })}
      </div>
      <section>
        <SectionTitle>{copy.technicalTools}</SectionTitle>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={openCommandSearch} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"><Search className="size-4" aria-hidden />F1</button>
          <button type="button" onClick={openManual} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"><ExternalLink className="size-4" aria-hidden />{locale === "ko" ? "사용자 매뉴얼" : "User manual"}</button>
        </div>
      </section>
    </div>
  );

  const renderUpdates = () => (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card p-4">
        <div>
          <h2 className="text-lg font-bold text-fg">{locale === "ko" ? "도움말에서 새로 달라진 점" : "What's new in help"}</h2>
          <p className="mt-1 text-xs text-fg-3">{locale === "ko" ? "과장된 출시 문구 대신 실제로 사용할 수 있는 변화만 기록합니다." : "Only shipped, usable changes are listed here."}</p>
        </div>
        <button
          type="button"
          disabled={updatesSeen}
          onClick={() => {
            setUpdatesSeen(true);
            writeStoredJson(STORAGE_KEYS.updatesSeen, true);
          }}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line px-3 text-xs font-semibold text-fg-2 hover:bg-raised disabled:cursor-default disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <Check className="size-4" aria-hidden />
          {updatesSeen ? copy.updatesSeen : locale === "ko" ? "모두 확인" : "Mark all reviewed"}
        </button>
      </div>
      {STUDIO_HELP_UPDATES.map((update) => (
        <article key={update.id} className="rounded-2xl border border-line bg-card p-4">
          <div className="flex flex-wrap items-center gap-2 text-[0.66rem] text-fg-3">
            <time dateTime={update.date}>{update.date}</time>
            {update.tags.map((tag) => <span key={tag.en} className="rounded-full bg-accent-soft px-2 py-0.5 text-accent">{studioHelpText(tag, locale)}</span>)}
          </div>
          <h3 className="mt-2 text-base font-bold text-fg">{studioHelpText(update.title, locale)}</h3>
          <p className="mt-1 text-xs leading-relaxed text-fg-3">{studioHelpText(update.summary, locale)}</p>
        </article>
      ))}
    </div>
  );

  if (!open) return null;

  const content = (
    <div ref={overlayRef} className={`fixed inset-0 ${STUDIO_Z_CLASS.help} flex items-end justify-center bg-canvas/75 backdrop-blur-sm sm:items-center sm:p-5`}>
      <button type="button" tabIndex={-1} aria-label={copy.close} className="absolute inset-0 cursor-default" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-help-hub-title"
        tabIndex={-1}
        data-testid="studio-help-hub"
        className="relative z-10 flex h-[min(94dvh,56rem)] w-full max-w-6xl flex-col overflow-hidden rounded-t-2xl border border-line bg-panel pb-[env(safe-area-inset-bottom)] shadow-2xl sm:rounded-2xl sm:pb-0"
      >
        <header className="shrink-0 border-b border-line bg-gradient-to-br from-accent-soft/25 via-panel to-panel px-3 pb-3 pt-3 sm:px-4 sm:pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 id="studio-help-hub-title" className="text-base font-bold text-fg">{copy.title}</h1>
              <p className="mt-0.5 text-[0.7rem] leading-relaxed text-fg-3">{copy.subtitle}</p>
            </div>
            <button type="button" onClick={onClose} aria-label={copy.close} className="grid size-10 shrink-0 place-items-center rounded-xl border border-line text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <form
            role="search"
            className="mt-3 flex min-h-12 items-center gap-2 rounded-xl border border-line bg-card px-3 shadow-sm focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/15"
            onSubmit={(event) => {
              event.preventDefault();
              rememberSearch(query);
              if (articleResults.length === 1 && shortcutResults.length === 0) openArticle(articleResults[0]);
            }}
          >
            <Search className="size-4 shrink-0 text-fg-3" aria-hidden />
            <label htmlFor="studio-help-hub-search" className="sr-only">{copy.searchLabel}</label>
            <input
              ref={searchRef}
              id="studio-help-hub-search"
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.currentTarget.value);
                setSelectedArticleId(null);
              }}
              placeholder={copy.searchPlaceholder}
              className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-3"
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} aria-label={copy.clearSearch} className="grid size-9 shrink-0 place-items-center rounded-lg text-fg-3 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
                <X className="size-3.5" aria-hidden />
              </button>
            ) : (
              <kbd className="hidden rounded-md border border-line bg-panel px-2 py-0.5 font-mono text-[0.65rem] text-fg-3 sm:inline">F1</kbd>
            )}
          </form>
          {!searching && recentSearches.length > 0 ? (
            <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5 text-[0.66rem]">
              <span className="shrink-0 text-fg-3">{copy.recentSearches}</span>
              {recentSearches.map((item) => (
                <button key={item} type="button" onClick={() => setQuery(item)} className="shrink-0 rounded-full border border-line bg-card px-2 py-1 text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">{item}</button>
              ))}
              <button type="button" onClick={() => { setRecentSearches([]); writeStoredJson(STORAGE_KEYS.recentSearches, []); }} className="shrink-0 rounded-full px-2 py-1 text-fg-3 hover:bg-raised hover:text-fg">{copy.clearHistory}</button>
            </div>
          ) : null}
        </header>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav aria-label={copy.title} className="shrink-0 overflow-x-auto border-b border-line bg-card/45 px-2 py-2 sm:w-44 sm:overflow-visible sm:border-b-0 sm:border-r sm:px-2 sm:py-3">
            <div className="flex gap-1 sm:flex-col">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setSelectedArticleId(null);
                    }}
                    aria-current={active ? "page" : undefined}
                    className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent sm:w-full ${active ? "bg-accent-soft text-accent" : "text-fg-2 hover:bg-raised"}`}
                  >
                    <Icon className="size-4" aria-hidden />
                    {item.label[locale]}
                    {item.id === "updates" && !updatesSeen ? <span className="ml-auto size-1.5 rounded-full bg-accent" aria-label={locale === "ko" ? "읽지 않은 업데이트" : "Unread updates"} /> : null}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 hidden border-t border-line/60 pt-3 sm:block">
              <button type="button" onClick={openManual} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[0.68rem] text-fg-3 hover:bg-raised hover:text-fg-2"><ExternalLink className="size-3.5" aria-hidden />{locale === "ko" ? "전체 매뉴얼" : "Full manual"}</button>
            </div>
          </nav>

          <main className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 lg:p-5">
            {selectedArticle
              ? renderArticleDetail(selectedArticle)
              : searching && activeTab !== "shortcuts"
                ? renderSearchResults()
                : activeTab === "home"
                  ? renderHome()
                  : activeTab === "learn"
                    ? renderLearn()
                    : activeTab === "shortcuts"
                      ? renderShortcuts()
                      : activeTab === "solve"
                        ? renderSolve()
                        : renderUpdates()}
          </main>
        </div>
      </div>
    </div>
  );

  return typeof document === "undefined" ? content : createPortal(content, document.body);
}
