import {
  Clock3,
  CornerDownLeft,
  Search,
  Star,
  X,
} from "lucide-react";
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
} from "react";

import {
  createStudioProjectCenterActionKey,
  normalizeStudioProjectCenterText,
  parseStudioProjectCenterKeys,
  prependStudioProjectCenterKey,
  rankStudioProjectCenterActions,
  type StudioProjectCenterSearchRecord,
} from "./studio-project-center-search-model";
import { StudioSurfaceState } from "./StudioSurfaceState";

import { cn } from "@/shared/lib/utils";

const StudioFileControlCenter = lazy(async () => {
  const module = await import("./StudioFileControlCenter");
  return { default: module.StudioFileControlCenter };
});

const FAVORITE_STORAGE_KEY =
  "toonspectrum-studio-project-center:favorites:v1";
const RECENT_STORAGE_KEY =
  "toonspectrum-studio-project-center:recent-actions:v1";
const FAVORITE_LIMIT = 24;
const RECENT_LIMIT = 8;
const RESULT_LIMIT = 18;

interface IndexedProjectAction extends StudioProjectCenterSearchRecord {
  readonly target: HTMLElement;
  readonly sectionId: string;
  readonly disabled: boolean;
}

interface IndexedProjectSection {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly element: HTMLElement;
  readonly contentElements: readonly HTMLElement[];
}

type ProjectCenterScope =
  | "all"
  | "favorites"
  | "recent"
  | "file-control"
  | string;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'input,textarea,select,[contenteditable="true"],[role="textbox"]',
    ),
  );
}

function compactText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function describedByText(element: HTMLElement): string {
  const ids = compactText(element.getAttribute("aria-describedby")).split(" ");
  return ids
    .filter(Boolean)
    .map((id) => compactText(document.getElementById(id)?.textContent))
    .filter(Boolean)
    .join(" ");
}

function actionLabel(element: HTMLElement): string {
  return compactText(
    element.getAttribute("aria-label")
      || element.textContent
      || element.getAttribute("title"),
  );
}

function actionDescription(
  element: HTMLElement,
  label: string,
  sectionDescription: string,
): string {
  const candidates = [
    element.getAttribute("title"),
    element.getAttribute("aria-description"),
    describedByText(element),
    sectionDescription,
  ];
  return candidates
    .map(compactText)
    .find((candidate) => candidate && candidate !== label)
    ?? sectionDescription;
}

function isActionDisabled(element: HTMLElement): boolean {
  return (
    (element instanceof HTMLButtonElement && element.disabled)
    || element.getAttribute("aria-disabled") === "true"
  );
}

function shouldIndexAction(root: HTMLElement, element: HTMLElement): boolean {
  if (root.contains(element)) return false;
  if (element.dataset.projectCenterControl === "true") return false;
  const label = actionLabel(element);
  if (!label) return false;
  if (label === "프로젝트 센터 닫기") return false;
  return true;
}

function readStoredKeys(key: string, limit: number): readonly string[] {
  if (typeof window === "undefined") return [];
  try {
    return parseStudioProjectCenterKeys(window.localStorage.getItem(key), limit);
  } catch {
    return [];
  }
}

function writeStoredKeys(key: string, values: readonly string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // Storage can be unavailable in private browsing or under quota pressure.
    // Session state still keeps the command hub fully usable.
  }
}

function sameActions(
  current: readonly IndexedProjectAction[],
  next: readonly IndexedProjectAction[],
): boolean {
  return current.length === next.length && current.every((action, index) => {
    const candidate = next[index];
    return Boolean(
      candidate
      && action.key === candidate.key
      && action.label === candidate.label
      && action.description === candidate.description
      && action.sectionId === candidate.sectionId
      && action.sectionLabel === candidate.sectionLabel
      && action.disabled === candidate.disabled
      && action.target === candidate.target,
    );
  });
}

function sameSections(
  current: readonly IndexedProjectSection[],
  next: readonly IndexedProjectSection[],
): boolean {
  return current.length === next.length && current.every((section, index) => {
    const candidate = next[index];
    return Boolean(
      candidate
      && section.id === candidate.id
      && section.label === candidate.label
      && section.description === candidate.description
      && section.element === candidate.element
      && section.contentElements.length === candidate.contentElements.length
      && section.contentElements.every(
        (element, contentIndex) =>
          element === candidate.contentElements[contentIndex],
      ),
    );
  });
}

function setManagedVisibility(
  element: HTMLElement,
  visible: boolean,
  authoredHidden: ReadonlyMap<HTMLElement, boolean>,
): void {
  const shouldHide = (authoredHidden.get(element) ?? false) || !visible;
  if (shouldHide) element.setAttribute("hidden", "");
  else element.removeAttribute("hidden");
}

export function StudioProjectCenterSection({
  title,
  description,
  className,
}: {
  title: string;
  description: string;
  className?: string;
}): ReactElement {
  return (
    <div
      data-project-center-section="true"
      data-project-center-section-title={title}
      data-project-center-section-description={description}
      className={cn(
        "col-span-full flex items-end justify-between gap-3 border-t border-line/60 px-1 pb-1 pt-3 first:border-t-0 first:pt-0",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-[0.72rem] font-bold tracking-tight text-fg">
          {title}
        </h2>
        <p className="mt-0.5 text-[0.62rem] leading-relaxed text-fg-3 text-pretty">
          {description}
        </p>
      </div>
    </div>
  );
}

/**
 * Project-center command hub.
 *
 * The existing buttons remain the single execution authority. This component
 * indexes their visible/accessibility metadata, then invokes the original DOM
 * target from ranked results, favorites and recents. That keeps save/import/
 * publish side effects on their audited paths while adding a faster navigation
 * layer over a large, dynamically mounted tool catalogue.
 */
export function StudioProjectCenterSearch(): ReactElement {
  const inputId = useId();
  const resultListId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const authoredHiddenRef = useRef(new Map<HTMLElement, boolean>());
  const actionsRef = useRef<readonly IndexedProjectAction[]>([]);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<ProjectCenterScope>("all");
  const [actions, setActions] = useState<readonly IndexedProjectAction[]>([]);
  const [sections, setSections] = useState<readonly IndexedProjectSection[]>([]);
  const [fileControlHost, setFileControlHost] = useState<HTMLElement | null>(null);
  const [favoriteKeys, setFavoriteKeys] = useState<readonly string[]>(() =>
    readStoredKeys(FAVORITE_STORAGE_KEY, FAVORITE_LIMIT),
  );
  const [recentKeys, setRecentKeys] = useState<readonly string[]>(() =>
    readStoredKeys(RECENT_STORAGE_KEY, RECENT_LIMIT),
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [announcement, setAnnouncement] = useState("");

  const rememberAuthoredVisibility = useCallback((element: HTMLElement) => {
    if (!authoredHiddenRef.current.has(element)) {
      authoredHiddenRef.current.set(element, element.hasAttribute("hidden"));
    }
  }, []);

  const rebuildIndex = useCallback(() => {
    const root = rootRef.current;
    const panel = root?.closest<HTMLElement>(
      '[data-studio-project-actions-menu="true"]',
    );
    if (!root || !panel) return;

    const nextFileControlHost = panel.querySelector<HTMLElement>(
      '[data-project-center-file-control-host="true"]',
    );
    if (nextFileControlHost) rememberAuthoredVisibility(nextFileControlHost);
    setFileControlHost((current) =>
      current === nextFileControlHost ? current : nextFileControlHost,
    );

    const sectionElements = Array.from(
      panel.querySelectorAll<HTMLElement>(
        '[data-project-center-section="true"]',
      ),
    ).filter((element) => !root.contains(element));
    const seenSectionIds = new Map<string, number>();
    const nextSections = sectionElements.map((element) => {
      const label = compactText(
        element.dataset.projectCenterSectionTitle
          || element.querySelector("h2")?.textContent,
      ) || "프로젝트 도구";
      const description = compactText(
        element.dataset.projectCenterSectionDescription
          || element.querySelector("p")?.textContent,
      );
      const baseId = createStudioProjectCenterActionKey("section", label);
      const duplicate = seenSectionIds.get(baseId) ?? 0;
      seenSectionIds.set(baseId, duplicate + 1);
      const id = duplicate === 0 ? baseId : `${baseId}-${duplicate + 1}`;
      const contentElements: HTMLElement[] = [];
      let sibling = element.nextElementSibling;
      while (
        sibling
        && !(sibling instanceof HTMLElement
          && sibling.dataset.projectCenterSection === "true")
      ) {
        if (sibling instanceof HTMLElement) contentElements.push(sibling);
        sibling = sibling.nextElementSibling;
      }
      rememberAuthoredVisibility(element);
      for (const content of contentElements) rememberAuthoredVisibility(content);
      return { id, label, description, element, contentElements };
    });

    const sectionForElement = (element: HTMLElement) => {
      if (element.closest('[data-studio-file-control-center="true"]')) {
        return {
          id: "file-control",
          label: "파일 제어 센터",
          description: "저장 사본, 복구 준비 상태와 가져오기 호환성을 관리합니다.",
        };
      }
      let matched: IndexedProjectSection | null = null;
      for (const section of nextSections) {
        const relation = section.element.compareDocumentPosition(element);
        if (relation & Node.DOCUMENT_POSITION_FOLLOWING) matched = section;
      }
      return matched ?? {
        id: "quick-actions",
        label: "빠른 작업",
        description: "현재 프로젝트에서 바로 실행할 수 있는 작업입니다.",
      };
    };

    const candidates = Array.from(
      panel.querySelectorAll<HTMLElement>('button,a[href],[role="button"]'),
    ).filter((element) => shouldIndexAction(root, element));
    const seenActionKeys = new Map<string, number>();
    const nextActions: IndexedProjectAction[] = [];
    for (const [order, target] of candidates.entries()) {
      rememberAuthoredVisibility(target);
      if (authoredHiddenRef.current.get(target) === true) continue;
      const section = sectionForElement(target);
      const label = actionLabel(target);
      const description = actionDescription(
        target,
        label,
        section.description,
      );
      const baseKey = createStudioProjectCenterActionKey(
        section.label,
        label,
      );
      const duplicate = seenActionKeys.get(baseKey) ?? 0;
      seenActionKeys.set(baseKey, duplicate + 1);
      const key = duplicate === 0 ? baseKey : `${baseKey}-${duplicate + 1}`;
      nextActions.push({
        key,
        label,
        description,
        sectionId: section.id,
        sectionLabel: section.label,
        keywords: [
          compactText(target.getAttribute("title")),
          compactText(target.getAttribute("aria-label")),
          compactText(target.dataset.projectCenterSearchTerms),
          section.description,
          target.id,
        ].filter(Boolean),
        order,
        target,
        disabled: isActionDisabled(target),
      });
    }

    actionsRef.current = nextActions;
    setActions((current) => sameActions(current, nextActions) ? current : nextActions);
    setSections((current) =>
      sameSections(current, nextSections) ? current : nextSections,
    );
  }, [rememberAuthoredVisibility]);

  const rememberRecent = useCallback((key: string) => {
    setRecentKeys((current) => {
      const next = prependStudioProjectCenterKey(current, key, RECENT_LIMIT);
      writeStoredKeys(RECENT_STORAGE_KEY, next);
      return next;
    });
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const panel = root?.closest<HTMLElement>(
      '[data-studio-project-actions-menu="true"]',
    );
    if (!root || !panel) return;
    rebuildIndex();

    const observer = typeof MutationObserver === "function"
      ? new MutationObserver((mutations) => {
        if (mutations.every((mutation) => root.contains(mutation.target))) return;
        rebuildIndex();
      })
      : null;
    observer?.observe(panel, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-disabled", "aria-label", "disabled", "title"],
    });

    const recordAction = (event: Event) => {
      if (!(event.target instanceof Element)) return;
      const target = event.target.closest<HTMLElement>(
        'button,a[href],[role="button"]',
      );
      if (!target || root.contains(target)) return;
      const action = actionsRef.current.find(
        (candidate) => candidate.target === target,
      );
      if (action && !isActionDisabled(target)) rememberRecent(action.key);
    };
    panel.addEventListener("click", recordAction, true);
    return () => {
      observer?.disconnect();
      panel.removeEventListener("click", recordAction, true);
    };
  }, [rebuildIndex, rememberRecent]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const panel = rootRef.current?.closest<HTMLElement>(
        '[data-studio-project-actions-menu="true"]',
      );
      if (!panel) return;
      if (
        event.key === "/"
        && !event.metaKey
        && !event.ctrlKey
        && !event.altKey
        && !isEditableTarget(event.target)
      ) {
        event.preventDefault();
        inputRef.current?.focus({ preventScroll: true });
        return;
      }
      if (event.key !== "Escape") return;
      if (normalizeStudioProjectCenterText(query)) {
        event.preventDefault();
        event.stopPropagation();
        setQuery("");
        inputRef.current?.focus({ preventScroll: true });
      } else if (scope !== "all") {
        event.preventDefault();
        event.stopPropagation();
        setScope("all");
        inputRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [query, scope]);

  const normalizedQuery = normalizeStudioProjectCenterText(query);
  const queryActive = normalizedQuery.length > 0;
  const actionByKey = useMemo(
    () => new Map(actions.map((action) => [action.key, action] as const)),
    [actions],
  );
  const favoriteActions = useMemo(
    () => favoriteKeys
      .map((key) => actionByKey.get(key))
      .filter((action): action is IndexedProjectAction => Boolean(action)),
    [actionByKey, favoriteKeys],
  );
  const recentActions = useMemo(
    () => recentKeys
      .map((key) => actionByKey.get(key))
      .filter((action): action is IndexedProjectAction => Boolean(action)),
    [actionByKey, recentKeys],
  );
  const rankedActions = useMemo(
    () => queryActive
      ? rankStudioProjectCenterActions(actions, query)
      : scope === "favorites"
        ? favoriteActions
        : scope === "recent"
          ? recentActions
          : [],
    [actions, favoriteActions, query, queryActive, recentActions, scope],
  );
  const visibleResults = rankedActions.slice(0, RESULT_LIMIT);
  const resultMode = queryActive || scope === "favorites" || scope === "recent";
  const sectionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const action of actions) {
      counts.set(action.sectionId, (counts.get(action.sectionId) ?? 0) + 1);
    }
    return counts;
  }, [actions]);

  useEffect(() => {
    setActiveIndex(visibleResults.length > 0 ? 0 : -1);
  }, [normalizedQuery, scope, visibleResults.length]);

  useEffect(() => {
    if (
      scope !== "all"
      && scope !== "favorites"
      && scope !== "recent"
      && scope !== "file-control"
      && !sections.some((section) => section.id === scope)
    ) {
      setScope("all");
    }
  }, [scope, sections]);

  useEffect(() => {
    const showFileControl = !resultMode
      && (scope === "all" || scope === "file-control");
    if (fileControlHost) {
      setManagedVisibility(
        fileControlHost,
        showFileControl,
        authoredHiddenRef.current,
      );
    }

    for (const section of sections) {
      const showSection = !resultMode
        && (scope === "all" || scope === section.id);
      setManagedVisibility(
        section.element,
        showSection,
        authoredHiddenRef.current,
      );
      for (const element of section.contentElements) {
        setManagedVisibility(
          element,
          showSection,
          authoredHiddenRef.current,
        );
      }
    }

    for (const action of actions) {
      const showAction = !resultMode && (
        scope === "all"
        || scope === action.sectionId
        || (scope === "file-control" && action.sectionId === "file-control")
      );
      setManagedVisibility(
        action.target,
        showAction,
        authoredHiddenRef.current,
      );
    }
  }, [actions, fileControlHost, resultMode, scope, sections]);

  useEffect(() => () => {
    for (const [element, hidden] of authoredHiddenRef.current) {
      if (hidden) element.setAttribute("hidden", "");
      else element.removeAttribute("hidden");
    }
    authoredHiddenRef.current.clear();
  }, []);

  const invokeAction = useCallback((action: IndexedProjectAction) => {
    if (isActionDisabled(action.target)) {
      const reason = compactText(action.target.getAttribute("title"));
      setAnnouncement(
        reason || `${action.label}은 현재 프로젝트 상태에서 사용할 수 없습니다.`,
      );
      return;
    }
    setAnnouncement(`${action.label} 실행`);
    action.target.click();
  }, []);

  const toggleFavorite = useCallback((action: IndexedProjectAction) => {
    setFavoriteKeys((current) => {
      const removing = current.includes(action.key);
      const next = removing
        ? current.filter((key) => key !== action.key)
        : prependStudioProjectCenterKey(
          current,
          action.key,
          FAVORITE_LIMIT,
        );
      writeStoredKeys(FAVORITE_STORAGE_KEY, next);
      setAnnouncement(
        removing
          ? `${action.label}을 즐겨찾기에서 해제했습니다.`
          : `${action.label}을 즐겨찾기에 추가했습니다.`,
      );
      return next;
    });
  }, []);

  const onSearchKeyDown = useCallback((
    event: ReactKeyboardEvent<HTMLInputElement>,
  ) => {
    if (visibleResults.length === 0) {
      if (event.key === "ArrowDown" && !queryActive && scope === "all") {
        const firstAvailable = actions.find((action) => !action.disabled);
        if (firstAvailable) {
          event.preventDefault();
          firstAvailable.target.focus({ preventScroll: true });
        }
      }
      return;
    }
    if (event.altKey && event.key.toLocaleLowerCase() === "p") {
      event.preventDefault();
      const active = visibleResults[Math.max(0, activeIndex)];
      if (active) toggleFavorite(active);
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((current) => (current + 1) % visibleResults.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((current) =>
          current <= 0 ? visibleResults.length - 1 : current - 1,
        );
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(visibleResults.length - 1);
        break;
      case "Enter": {
        event.preventDefault();
        const active = visibleResults[Math.max(0, activeIndex)];
        if (active) invokeAction(active);
        break;
      }
    }
  }, [
    actions,
    activeIndex,
    invokeAction,
    queryActive,
    scope,
    toggleFavorite,
    visibleResults,
  ]);

  const scopeStatus = queryActive
    ? `${rankedActions.length}/${actions.length}개`
    : scope === "favorites"
      ? `${favoriteActions.length}개 즐겨찾기`
      : scope === "recent"
        ? `${recentActions.length}개 최근 사용`
        : scope === "file-control"
          ? "파일 제어"
          : scope === "all"
            ? `${actions.length}개 도구`
            : `${sectionCounts.get(scope) ?? 0}개 도구`;
  const activeResult = visibleResults[Math.max(0, activeIndex)];
  const activeResultId = activeResult
    ? `${resultListId}-${activeResult.key}`
    : undefined;
  const emptyTitle = queryActive
    ? "일치하는 프로젝트 도구가 없습니다"
    : scope === "favorites"
      ? "즐겨찾기한 프로젝트 도구가 없습니다"
      : "최근 실행한 프로젝트 도구가 없습니다";
  const emptyDescription = queryActive
    ? "백업, archive, 검수, publish, 버전처럼 작업 목적을 입력해 보세요."
    : scope === "favorites"
      ? "검색 결과의 별 버튼으로 반복 작업을 고정할 수 있습니다."
      : "프로젝트 도구를 실행하면 이 기기의 최근 목록에 기록됩니다.";

  return (
    <>
      <div
        ref={rootRef}
        data-project-center-search="true"
        className="col-span-full sticky top-0 z-[2] -mx-1 rounded-2xl border border-transparent bg-card/95 px-1 pb-2 pt-1 backdrop-blur supports-[backdrop-filter]:bg-card/85"
      >
        <label
          htmlFor={inputId}
          className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-canvas/80 px-3 shadow-inner transition-colors focus-within:border-accent/60 focus-within:bg-card"
        >
          <Search size={15} aria-hidden className="shrink-0 text-fg-3" />
          <input
            ref={inputRef}
            id={inputId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="도구·목적 검색 · /"
            aria-label="프로젝트 센터 도구 검색"
            aria-controls={resultMode ? resultListId : undefined}
            aria-activedescendant={resultMode ? activeResultId : undefined}
            aria-expanded={resultMode}
            className="min-w-0 flex-1 bg-transparent text-[0.75rem] text-fg outline-none placeholder:text-fg-3"
          />
          <span
            role="status"
            aria-live="polite"
            className="shrink-0 text-[0.62rem] font-semibold tabular-nums text-fg-3"
          >
            {scopeStatus}
          </span>
          {queryActive ? (
            <button
              type="button"
              data-project-keep-open
              data-project-center-control="true"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus({ preventScroll: true });
              }}
              aria-label="프로젝트 센터 검색 초기화"
              className="grid size-8 shrink-0 place-items-center rounded-lg text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <X size={14} aria-hidden />
            </button>
          ) : (
            <kbd className="hidden shrink-0 rounded border border-line/70 bg-card px-1.5 py-0.5 text-[0.58rem] font-semibold text-fg-3 sm:inline-flex">
              /
            </kbd>
          )}
        </label>

        <div
          role="toolbar"
          aria-label="프로젝트 센터 보기 범위"
          className="mt-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]"
        >
          <button
            type="button"
            data-project-keep-open
            data-project-center-control="true"
            data-project-center-scope="all"
            aria-pressed={scope === "all"}
            onClick={() => {
              setQuery("");
              setScope("all");
            }}
            className={cn(
              "min-h-8 shrink-0 rounded-full border px-2.5 text-[0.62rem] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              scope === "all"
                ? "border-accent/40 bg-accent/12 text-accent"
                : "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg",
            )}
          >
            전체 {actions.length}
          </button>
          <button
            type="button"
            data-project-keep-open
            data-project-center-control="true"
            data-project-center-scope="favorites"
            aria-pressed={scope === "favorites"}
            onClick={() => {
              setQuery("");
              setScope("favorites");
            }}
            className={cn(
              "inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[0.62rem] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              scope === "favorites"
                ? "border-accent/40 bg-accent/12 text-accent"
                : "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg",
            )}
          >
            <Star size={11} aria-hidden /> 즐겨찾기 {favoriteActions.length}
          </button>
          <button
            type="button"
            data-project-keep-open
            data-project-center-control="true"
            data-project-center-scope="recent"
            aria-pressed={scope === "recent"}
            onClick={() => {
              setQuery("");
              setScope("recent");
            }}
            className={cn(
              "inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[0.62rem] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              scope === "recent"
                ? "border-accent/40 bg-accent/12 text-accent"
                : "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg",
            )}
          >
            <Clock3 size={11} aria-hidden /> 최근 {recentActions.length}
          </button>
          {fileControlHost ? (
            <button
              type="button"
              data-project-keep-open
              data-project-center-control="true"
              data-project-center-scope="file-control"
              aria-pressed={scope === "file-control"}
              onClick={() => {
                setQuery("");
                setScope("file-control");
              }}
              className={cn(
                "min-h-8 shrink-0 rounded-full border px-2.5 text-[0.62rem] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                scope === "file-control"
                  ? "border-accent/40 bg-accent/12 text-accent"
                  : "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg",
              )}
            >
              파일 제어
            </button>
          ) : null}
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              data-project-keep-open
              data-project-center-control="true"
              data-project-center-scope={section.id}
              aria-pressed={scope === section.id}
              onClick={() => {
                setQuery("");
                setScope(section.id);
              }}
              className={cn(
                "min-h-8 shrink-0 rounded-full border px-2.5 text-[0.62rem] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                scope === section.id
                  ? "border-accent/40 bg-accent/12 text-accent"
                  : "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg",
              )}
            >
              {section.label} {sectionCounts.get(section.id) ?? 0}
            </button>
          ))}
        </div>

        {!queryActive && scope === "all" && (
          favoriteActions.length > 0 || recentActions.length > 0
        ) ? (
          <div
            data-project-center-quick-access="true"
            className="mt-2 grid gap-1.5 rounded-xl border border-line/70 bg-canvas/55 p-2 sm:grid-cols-2"
          >
            {favoriteActions.length > 0 ? (
              <div className="min-w-0">
                <p className="px-1 text-[0.56rem] font-black uppercase tracking-[0.13em] text-fg-3">
                  즐겨찾기
                </p>
                <div className="mt-1 flex gap-1 overflow-x-auto">
                  {favoriteActions.slice(0, 3).map((action) => (
                    <button
                      key={action.key}
                      type="button"
                      data-project-keep-open
                      data-project-center-control="true"
                      onClick={() => invokeAction(action)}
                      className="min-h-8 shrink-0 rounded-lg bg-card px-2 text-[0.61rem] font-bold text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {recentActions.length > 0 ? (
              <div className="min-w-0">
                <p className="px-1 text-[0.56rem] font-black uppercase tracking-[0.13em] text-fg-3">
                  최근 사용
                </p>
                <div className="mt-1 flex gap-1 overflow-x-auto">
                  {recentActions.slice(0, 3).map((action) => (
                    <button
                      key={action.key}
                      type="button"
                      data-project-keep-open
                      data-project-center-control="true"
                      onClick={() => invokeAction(action)}
                      className="min-h-8 shrink-0 rounded-lg bg-card px-2 text-[0.61rem] font-bold text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {resultMode ? (
          <div className="mt-2 rounded-xl border border-line bg-canvas/75 shadow-lg">
            {visibleResults.length > 0 ? (
              <div
                id={resultListId}
                role="list"
                aria-label="프로젝트 센터 검색 결과"
                data-project-center-search-results="true"
                className="max-h-[min(48vh,28rem)] overflow-y-auto p-1.5"
              >
                {visibleResults.map((action, index) => {
                  const favorite = favoriteKeys.includes(action.key);
                  const active = index === activeIndex;
                  return (
                    <div
                      key={action.key}
                      role="listitem"
                      data-project-center-search-result="true"
                      data-active={active ? "true" : "false"}
                      className={cn(
                        "grid grid-cols-[minmax(0,1fr)_2.5rem] items-stretch rounded-lg border transition-colors",
                        active
                          ? "border-accent/35 bg-accent/10"
                          : "border-transparent hover:bg-raised",
                      )}
                      onMouseEnter={() => setActiveIndex(index)}
                    >
                      <button
                        id={`${resultListId}-${action.key}`}
                        type="button"
                        data-project-keep-open
                        data-project-center-control="true"
                        disabled={action.disabled}
                        onClick={() => invokeAction(action)}
                        className="min-w-0 px-3 py-2.5 text-left disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-[0.72rem] font-black text-fg">
                            {action.label}
                          </span>
                          <span className="shrink-0 rounded-full border border-line bg-card px-1.5 py-0.5 text-[0.54rem] font-bold text-fg-3">
                            {action.sectionLabel}
                          </span>
                        </span>
                        <span className="mt-1 line-clamp-2 block text-[0.61rem] leading-relaxed text-fg-3">
                          {action.description}
                        </span>
                      </button>
                      <button
                        type="button"
                        data-project-keep-open
                        data-project-center-control="true"
                        aria-pressed={favorite}
                        aria-label={`${action.label} 즐겨찾기 ${favorite ? "해제" : "추가"}`}
                        onClick={() => toggleFavorite(action)}
                        className="grid place-items-center rounded-r-lg text-fg-3 hover:bg-card hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                      >
                        <Star
                          size={15}
                          aria-hidden
                          className={favorite ? "fill-current text-accent" : undefined}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <StudioSurfaceState
                state="empty"
                compact
                title={emptyTitle}
                description={emptyDescription}
                className="m-2"
                action={(
                  <button
                    type="button"
                    data-project-keep-open
                    data-project-center-control="true"
                    onClick={() => {
                      setQuery("");
                      setScope("all");
                    }}
                    className="min-h-9 rounded-lg border border-line bg-card px-3 text-[0.7rem] font-semibold text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    전체 도구 보기
                  </button>
                )}
              />
            )}
            {visibleResults.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/70 px-3 py-2 text-[0.56rem] text-fg-3">
                <span>
                  {rankedActions.length > RESULT_LIMIT
                    ? `상위 ${RESULT_LIMIT}개 표시 · 검색어를 더 구체화하세요.`
                    : `${rankedActions.length}개 결과`}
                </span>
                <span className="inline-flex items-center gap-2">
                  <span>↑↓ 이동</span>
                  <span className="inline-flex items-center gap-1">
                    <CornerDownLeft size={10} aria-hidden /> 실행
                  </span>
                  <span>Alt+P 즐겨찾기</span>
                </span>
              </div>
            ) : null}
          </div>
        ) : null}
        <span className="sr-only" role="status" aria-live="polite">
          {announcement}
        </span>
      </div>

      <div
        data-project-center-file-control-host="true"
        className="col-span-full"
      >
        <Suspense
          fallback={(
            <div
              data-studio-file-control-center-loading="true"
              className="mt-2 rounded-2xl border border-line bg-canvas/55 px-4 py-5 text-center text-[0.66rem] text-fg-3"
            >
              파일 제어 센터를 불러오는 중…
            </div>
          )}
        >
          <StudioFileControlCenter />
        </Suspense>
      </div>
    </>
  );
}
