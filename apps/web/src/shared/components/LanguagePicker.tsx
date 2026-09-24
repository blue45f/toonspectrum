import { Check, Languages, Search, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { cx } from "@/shared/lib/cx";
import { getLanguageOptions, useI18n } from "@/shared/lib/i18n";

const MAX_VISIBLE_RESULTS = 60;

export interface LanguagePickerProps {
  readonly value: string;
  readonly onChange: (locale: string) => void;
  readonly disabled?: boolean;
  readonly ariaLabel?: string;
  readonly className?: string;
  readonly triggerClassName?: string;
  readonly panelClassName?: string;
  readonly compact?: boolean;
}

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/**
 * Search-first locale picker.
 *
 * The former native select eagerly rendered the entire worldwide locale catalog (290+ options),
 * including duplicate regional labels, in every shell instance. That made closed controls noisy
 * for screen readers and expensive to duplicate between desktop/mobile shells. This picker keeps
 * the current and fully translated languages discoverable, then searches the complete catalog on
 * demand while rendering at most MAX_VISIBLE_RESULTS options.
 */
export function LanguagePicker({
  value,
  onChange,
  disabled = false,
  ariaLabel,
  className,
  triggerClassName,
  panelClassName,
  compact = false,
}: LanguagePickerProps) {
  const appLanguage = useI18n((state) => state.lang);
  const korean = appLanguage.toLowerCase().startsWith("ko");
  const options = useMemo(() => getLanguageOptions(appLanguage), [appLanguage]);
  const current = options.find((option) => option.code === value) ?? options[0] ?? null;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const listId = useId();
  const label = ariaLabel ?? (korean ? "언어 선택" : "Choose language");

  const visibleOptions = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);
    const candidates = normalizedQuery
      ? options.filter((option) => {
          const searchTarget = `${option.code} ${option.label} ${option.nativeLabel} ${option.englishLabel}`
            .toLocaleLowerCase();
          return searchTarget.includes(normalizedQuery);
        })
      : options.filter((option) => option.fullyTranslated || option.code === value);
    return {
      options: candidates.slice(0, MAX_VISIBLE_RESULTS),
      total: candidates.length,
    };
  }, [options, query, value]);

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    setQuery("");
    if (restoreFocus) window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => searchRef.current?.focus(), 0);
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [close, open]);

  const focusRelativeOption = (
    event: ReactKeyboardEvent<HTMLElement>,
    delta: number,
  ) => {
    const optionNodes = Array.from(
      rootRef.current?.querySelectorAll<HTMLElement>(`[data-language-option="true"]`) ?? [],
    );
    if (optionNodes.length === 0) return;
    event.preventDefault();
    const currentIndex = optionNodes.indexOf(event.currentTarget);
    const nextIndex = currentIndex < 0
      ? delta > 0 ? 0 : optionNodes.length - 1
      : Math.max(0, Math.min(optionNodes.length - 1, currentIndex + delta));
    optionNodes[nextIndex]?.focus();
  };

  const optionKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown") focusRelativeOption(event, 1);
    else if (event.key === "ArrowUp") focusRelativeOption(event, -1);
    else if (event.key === "Home") {
      event.preventDefault();
      rootRef.current?.querySelector<HTMLElement>(`[data-language-option="true"]`)?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      const nodes = rootRef.current?.querySelectorAll<HTMLElement>(`[data-language-option="true"]`);
      nodes?.item(Math.max(0, nodes.length - 1)).focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  return (
    <div ref={rootRef} className={cx("relative", className)} data-language-picker="true">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((currentOpen) => !currentOpen)}
        className={cx(
          "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-panel px-3 text-xs font-semibold text-fg outline-none transition-colors hover:border-line-strong focus-visible:ring-2 focus-visible:ring-accent/35 disabled:cursor-not-allowed disabled:opacity-55",
          triggerClassName,
        )}
      >
        <Languages size={15} aria-hidden />
        <span className={cx("max-w-48 truncate", compact && "sr-only")}>{current?.label ?? value}</span>
      </button>

      {open ? (
        <section
          role="dialog"
          aria-labelledby={titleId}
          className={cx(
            "absolute bottom-[calc(100%+0.5rem)] right-0 z-[80] w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-line bg-panel p-3 text-left shadow-2xl",
            panelClassName,
          )}
        >
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-sm font-bold text-fg">
                {korean ? "언어 선택" : "Choose language"}
              </h2>
              <p className="mt-0.5 text-[0.7rem] leading-relaxed text-fg-3">
                {korean
                  ? "번역 완료 언어는 바로 보이고, 다른 언어는 이름이나 코드로 검색할 수 있습니다."
                  : "Translated languages appear first. Search by language name or code for the full catalog."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => close()}
              aria-label={korean ? "언어 선택 닫기" : "Close language picker"}
              className="grid size-9 shrink-0 place-items-center rounded-lg text-fg-3 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <X size={16} aria-hidden />
            </button>
          </div>

          <label className="relative mt-3 block">
            <span className="sr-only">{korean ? "언어 검색" : "Search languages"}</span>
            <Search
              size={14}
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3"
            />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  close();
                } else if (event.key === "ArrowDown") {
                  focusRelativeOption(event, 1);
                }
              }}
              aria-controls={listId}
              placeholder={korean ? "예: 한국어, English, tlh" : "e.g. Korean, English, tlh"}
              className="h-11 w-full rounded-xl border border-line bg-canvas pl-9 pr-3 text-sm text-fg outline-none focus:border-accent/55 focus-visible:ring-2 focus-visible:ring-accent/30"
            />
          </label>

          <div
            id={listId}
            role="listbox"
            aria-label={korean ? "언어 검색 결과" : "Language search results"}
            className="mt-2 max-h-72 space-y-1 overflow-y-auto overscroll-contain rounded-xl border border-line bg-canvas/50 p-1"
          >
            {visibleOptions.options.length > 0 ? visibleOptions.options.map((option) => (
              <button
                key={option.code}
                type="button"
                role="option"
                aria-selected={option.code === value}
                data-language-option="true"
                onKeyDown={optionKeyDown}
                onClick={() => {
                  onChange(option.code);
                  close();
                }}
                className={cx(
                  "flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm outline-none transition-colors hover:bg-raised focus-visible:bg-raised focus-visible:ring-2 focus-visible:ring-accent/30",
                  option.code === value ? "bg-accent-soft/35 text-accent" : "text-fg",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                <span className="shrink-0 font-mono text-[0.65rem] text-fg-3">{option.code}</span>
                {option.code === value ? <Check size={14} aria-hidden className="shrink-0" /> : null}
              </button>
            )) : (
              <p className="px-3 py-8 text-center text-xs text-fg-3">
                {korean ? "일치하는 언어가 없습니다." : "No matching language."}
              </p>
            )}
          </div>
          {visibleOptions.total > visibleOptions.options.length ? (
            <p className="mt-2 text-[0.68rem] text-fg-3" role="status">
              {korean
                ? `결과가 많아 ${visibleOptions.options.length}개만 표시합니다. 더 구체적으로 검색하세요.`
                : `Showing the first ${visibleOptions.options.length} results. Refine your search.`}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
