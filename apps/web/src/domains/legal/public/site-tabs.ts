import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

/** 탭 버튼 id — 패널의 `aria-labelledby`가 가리킨다. */
export const siteTabId = (prefix: string, id: string): string => `${prefix}-tab-${id}`;
/** 탭 패널 id — 탭 버튼의 `aria-controls`가 가리킨다. */
export const siteTabPanelId = (prefix: string, id: string): string => `${prefix}-panel-${id}`;

/** 동작 줄이기 설정이면 부드러운 스크롤 대신 즉시 이동한다. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export interface SiteTabsState<T extends string> {
  readonly value: T;
  readonly select: (next: T) => void;
  /** 활성 탭이거나 한 번 열어 본 탭인지 — `SiteTabPanel`의 `mounted`에 넘긴다. */
  readonly isMounted: (id: T) => boolean;
}

/**
 * 탭 상태 훅. `param`을 주면 `?param=id`로 공유·새로고침·뒤로 가기에 같은 탭이 열린다
 * (기본 탭은 주소에 남기지 않고, 기록은 replace로 바꿔 뒤로 가기가 페이지 단위로 동작한다).
 */
export function useSiteTabs<T extends string>({
  ids,
  fallback,
  param,
}: {
  readonly ids: readonly T[];
  readonly fallback: T;
  readonly param?: string;
}): SiteTabsState<T> {
  const [params, setParams] = useSearchParams();
  const [localValue, setLocalValue] = useState<T>(fallback);
  const raw = param ? params.get(param) : null;
  const fromUrl = ids.find((id) => id === raw);
  const value: T = param ? fromUrl ?? fallback : localValue;
  const [visited, setVisited] = useState<ReadonlySet<T>>(() => new Set<T>([value]));

  const select = useCallback((next: T) => {
    // 주소(뒤로 가기)로 열린 탭도 떠날 때 함께 기억해 다시 돌아왔을 때 입력값을 유지한다.
    setVisited((previous) => (previous.has(next) && previous.has(value) ? previous : new Set<T>(previous).add(value).add(next)));
    if (!param) {
      setLocalValue(next);
      return;
    }
    setParams((current) => {
      const updated = new URLSearchParams(current);
      if (next === fallback) updated.delete(param);
      else updated.set(param, next);
      return updated;
    }, { replace: true, preventScrollReset: true });
  }, [fallback, param, setParams, value]);

  const isMounted = useCallback((id: T) => id === value || visited.has(id), [value, visited]);

  return { value, select, isMounted };
}

export interface SiteTabAnchors {
  /** 앵커가 속한 탭을 고르고, 패널이 그려지면 그 요소로 스크롤한다. */
  readonly openAnchor: (anchor: string) => void;
  /**
   * 탭은 이미 다른 방법(예: 필터와 탭을 한 번에 바꾸는 주소 갱신)으로 고른 경우 —
   * 그 탭이 활성화되면 스크롤만 한다.
   */
  readonly revealAnchor: (anchor: string) => void;
}

/**
 * 예전 섹션 앵커(`#saved-board` 같은 공유 링크·페이지 안 버튼)를 탭으로 연다.
 * 해당 탭을 고른 뒤 패널이 그려지면 목적지 요소로 스크롤한다 — 긴 세로 나열을 탭으로 바꿔도
 * 예전 주소와 "다음 단계" 버튼이 막다른 길이 되지 않게 한다.
 *
 * `anchors`는 렌더마다 새로 만들지 않도록 모듈 상수로 넘긴다.
 */
export function useSiteTabAnchors<T extends string>(
  anchors: Readonly<Record<string, T>>,
  activeTab: T,
  selectTab: (tab: T) => void,
): SiteTabAnchors {
  const { hash } = useLocation();
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);
  const handledHashRef = useRef("");

  const revealAnchor = useCallback((anchor: string) => {
    if (anchors[anchor]) setPendingAnchor(anchor);
  }, [anchors]);

  const openAnchor = useCallback((anchor: string) => {
    const tab = anchors[anchor];
    if (!tab) return;
    selectTab(tab);
    setPendingAnchor(anchor);
  }, [anchors, selectTab]);

  useEffect(() => {
    if (hash === handledHashRef.current) return;
    handledHashRef.current = hash;
    if (anchors[hash]) openAnchor(hash);
  }, [anchors, hash, openAnchor]);

  useEffect(() => {
    if (!pendingAnchor || anchors[pendingAnchor] !== activeTab) return;
    document.getElementById(pendingAnchor.slice(1))?.scrollIntoView?.({
      block: "start",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
    setPendingAnchor(null);
  }, [activeTab, anchors, pendingAnchor]);

  return { openAnchor, revealAnchor };
}
