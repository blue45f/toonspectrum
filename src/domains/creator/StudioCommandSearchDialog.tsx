/**
 * 통합 Command Search — 감사 §2.8 이 지적한 네 개의 부분 검색창을 대신하는
 * 단일 표면.
 *
 * 코퍼스는 `studio-command-search.ts` 가 만든 하나의 색인(명령 155 + 속성·패널
 * + 인스펙터 라우트 + 튜토리얼)이고, 타사 용어 별칭은 Wave A 카탈로그의
 * `aliases` 를 그대로 소비한다. "Paint Bucket", "스포이트", "QuickShape",
 * "Inherit Alpha" 같이 CSP·Photoshop·Krita·Procreate 에서 쓰던 이름으로 우리
 * 기능이 나온다.
 *
 * 결과가 쏟아지지 않게 하는 장치는 세 겹이다 — 토큰 AND, 구획별 상한, 전체
 * 상한. 잘린 개수는 감추지 않고 "외 N건"으로 보고한다.
 */

import { ChevronRight, HelpCircle, Search, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { searchStudio } from "./studio-command-search";

import type {
  StudioSearchOutcome,
  StudioSearchResult,
} from "./studio-command-search";
import type { StudioInspectorRoute } from "./studio-inspector-layout";

export interface StudioCommandSearchDialogProps {
  open: boolean;
  onClose: () => void;
  /** 인스펙터 라우트로 이동. 없으면 결과는 위치 안내만 하고 닫지 않는다. */
  onNavigateInspector?: (route: StudioInspectorRoute) => void;
  /** 튜토리얼 허브 열기. */
  onOpenTutorial?: (tutorialId: string) => void;
  /** 그리기 팔레트 펼치기. */
  onExpandPalette?: (paletteId: "sub-tools" | "tool-properties") => void;
  /**
   * 도움말 노드 열기. Wave A 카탈로그의 `helpNodeId` 를 그대로 넘긴다.
   * HelpGraph 가 아직 없으므로 소비자가 없으면 버튼을 그리지 않는다.
   */
  onOpenHelp?: (helpNodeId: string) => void;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function resultKey(result: StudioSearchResult): string {
  return `${result.entry.kind}:${result.entry.id}`;
}

/** 어떤 이름으로 맞았는지 — 타사 용어로 찾아온 사람에게 확인을 준다. */
function matchNote(result: StudioSearchResult): string | null {
  if (result.matchedOn === "alias" && result.matchedAlias) {
    const vendor = result.matchedAlias.vendor;
    const vendorLabel =
      vendor === "csp"
        ? "CSP"
        : vendor === "photoshop"
          ? "Photoshop"
          : vendor === "krita"
            ? "Krita"
            : vendor === "procreate"
              ? "Procreate"
              : "이전 이름";
    return `${vendorLabel} "${result.matchedAlias.term}"`;
  }
  return null;
}

export function StudioCommandSearchDialog({
  open,
  onClose,
  onNavigateInspector,
  onOpenTutorial,
  onExpandPalette,
  onOpenHelp,
}: StudioCommandSearchDialogProps) {
  const titleId = useId();
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const outcome: StudioSearchOutcome = useMemo(
    () => searchStudio(query),
    [query],
  );
  const flat = useMemo(
    () => outcome.sections.flatMap((section) => section.results),
    [outcome],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const activate = useCallback(
    (result: StudioSearchResult) => {
      const target = result.entry.target;
      switch (target.type) {
        case "inspector": {
          const route: StudioInspectorRoute = {
            primary: target.primary,
            ...(target.image ? { image: target.image } : {}),
          };
          onNavigateInspector?.(route);
          onClose();
          return;
        }
        case "tutorial": {
          onOpenTutorial?.(target.tutorialId);
          onClose();
          return;
        }
        case "palette": {
          onExpandPalette?.(target.paletteId);
          onClose();
          return;
        }
        default: {
          // 명령 실행 배선은 Wave A 레지스트리가 붙은 뒤에 온다. 그때까지는
          // "어디에 있는지"를 보여주는 것이 정직한 최선이고, 도움말은 열린다.
          onOpenHelp?.(result.entry.helpNodeId);
        }
      }
    },
    [onClose, onExpandPalette, onNavigateInspector, onOpenHelp, onOpenTutorial],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (flat.length === 0) return;
        setActiveIndex((previous) => {
          const step = event.key === "ArrowDown" ? 1 : -1;
          return (previous + step + flat.length) % flat.length;
        });
        return;
      }
      if (event.key === "Enter") {
        const result = flat[activeIndex];
        if (result) {
          event.preventDefault();
          activate(result);
        }
        return;
      }
      if (event.key !== "Tab") return;
      // aria-modal 계약을 지키는 포커스 트랩. 감사 §2.9 가 온로드 모달에서
      // 트랩 부재를 심각 결함으로 판정했으므로 새 모달은 처음부터 가둔다.
      const root = dialogRef.current;
      if (!root) return;
      const focusables = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [activate, activeIndex, flat, onClose],
  );

  // 키 처리는 JSX prop 대신 노드 리스너로 건다. `role="dialog"` 컨테이너는
  // 비인터랙티브 요소라 핸들러를 prop 으로 붙이면 a11y 규칙에 걸린다.
  useEffect(() => {
    const node = dialogRef.current;
    if (!open || !node) return;
    node.addEventListener("keydown", onKeyDown);
    return () => node.removeEventListener("keydown", onKeyDown);
  }, [open, onKeyDown]);

  if (!open || typeof document === "undefined") return null;

  let cursor = -1;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center bg-black/45 px-4 pt-[12vh] backdrop-blur-sm"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search size={16} aria-hidden className="shrink-0 text-fg-3" />
          <h2 id={titleId} className="sr-only">
            명령·속성 통합 검색
          </h2>
          <input
            ref={inputRef}
            id={inputId}
            type="search"
            role="searchbox"
            value={query}
            autoComplete="off"
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="기능 이름 또는 CSP·Photoshop 용어 (예: Paint Bucket, 레벨, 서브 도구)"
            className="min-h-11 min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-3"
          />
          <button
            type="button"
            onClick={onClose}
            title="닫기 (Esc)"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <X size={16} aria-hidden />
            <span className="sr-only">검색 닫기</span>
          </button>
        </div>

        <p role="status" aria-live="polite" className="sr-only">
          {query.trim().length === 0
            ? "검색어를 입력하세요."
            : `${outcome.totalMatched}개 중 ${outcome.totalShown}개를 표시합니다.`}
        </p>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          {query.trim().length === 0 ? (
            <p className="px-2 py-6 text-center text-xs leading-relaxed text-fg-3">
              쓰던 프로그램의 이름 그대로 찾아보세요.
              <br />
              CSP·Photoshop·Krita·Procreate 용어를 우리 기능으로 이어 줍니다.
            </p>
          ) : outcome.sections.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-fg-3">
              &ldquo;{query}&rdquo; 와 맞는 기능을 찾지 못했습니다.
            </p>
          ) : (
            outcome.sections.map((section) => (
              <section key={section.kind} className="mb-2 last:mb-0">
                <div className="flex items-baseline justify-between gap-2 px-2 py-1">
                  <h3 className="text-[0.66rem] font-semibold uppercase tracking-wider text-fg-3">
                    {section.label}
                  </h3>
                  {section.truncated ? (
                    <span className="text-[0.62rem] tabular-nums text-fg-3">
                      외 {section.matched - section.results.length}건
                    </span>
                  ) : null}
                </div>
                <ul className="space-y-0.5">
                  {section.results.map((result) => {
                    cursor += 1;
                    const index = cursor;
                    const note = matchNote(result);
                    return (
                      <li key={resultKey(result)} className="flex items-stretch gap-1">
                        <button
                          type="button"
                          data-active={index === activeIndex ? "true" : undefined}
                          onPointerEnter={() => setActiveIndex(index)}
                          onClick={() => activate(result)}
                          className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-raised data-[active=true]:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm text-fg">
                              {result.entry.label}
                            </span>
                            <span className="block truncate text-[0.66rem] text-fg-3">
                              {result.entry.location}
                              {note ? ` · ${note}` : ""}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            {result.entry.shortcut ? (
                              <kbd className="rounded border border-line bg-card px-1.5 py-px text-[0.66rem] text-fg-3">
                                {result.entry.shortcut}
                              </kbd>
                            ) : null}
                            <ChevronRight size={14} aria-hidden className="text-fg-3" />
                          </span>
                        </button>
                        {onOpenHelp ? (
                          <button
                            type="button"
                            onClick={() => onOpenHelp(result.entry.helpNodeId)}
                            title={`${result.entry.label} 도움말`}
                            className="flex size-11 shrink-0 items-center justify-center rounded-lg text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                          >
                            <HelpCircle size={15} aria-hidden />
                            <span className="sr-only">{result.entry.label} 도움말</span>
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-1.5 text-[0.62rem] text-fg-3">
          <span>↑↓ 이동 · Enter 실행 · Esc 닫기</span>
          {outcome.truncated ? (
            <span className="tabular-nums">
              {outcome.totalMatched}건 중 {outcome.totalShown}건 표시
            </span>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
