// 긴 작업대 화면을 "한 번에 한 단계" 탭으로 나눌 때 쓰는 공용 규칙 — 주소 해시 ↔ 선택 탭 동기화.
// 컴포넌트(SectionTabs.tsx)와 분리해 Fast Refresh 규칙을 지키고 화면 없이 테스트할 수 있다.
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export interface SectionTab<TId extends string = string> {
  readonly id: TId;
  readonly label: string;
  readonly icon: LucideIcon;
  /** 그 단계에 쌓인 항목 수(0이거나 없으면 표시하지 않는다). */
  readonly count?: number;
}

/** 주소 해시(`#id`)가 알려진 탭 id이면 그 id를, 아니면 null을 돌려준다(주소 인코딩이 깨져도 안전). */
export function sectionFromHash<TId extends string>(ids: readonly TId[], hash: string): TId | null {
  let id: string;
  try {
    id = decodeURIComponent(hash.replace(/^#/u, ""));
  } catch {
    return null;
  }
  return ids.find((entry) => entry === id) ?? null;
}

/**
 * 선택 탭 ↔ 주소 해시 동기화. 탭을 누르면 해시를 바꾸되 기록을 쌓지 않고(replaceState),
 * 페이지 안 해시 링크(<a href="#id">)나 뒤로 가기로 해시가 바뀌면 그 탭을 연다.
 * 해시가 바꾼 경우에만 `onHashNavigate`를 불러, 화면이 새 탭의 위치로 따라가게 한다(탭 클릭은 이미 그 자리에 있다).
 */
export function useSectionTabHash<TId extends string>(
  ids: readonly TId[],
  fallback: TId,
  onHashNavigate?: (id: TId) => void,
): { readonly active: TId; readonly select: (id: TId) => void } {
  const [active, setActive] = useState<TId>(() => sectionFromHash(ids, globalThis.location?.hash ?? "") ?? fallback);
  const navigateRef = useRef(onHashNavigate);
  const idsRef = useRef(ids);

  useEffect(() => {
    navigateRef.current = onHashNavigate;
    idsRef.current = ids;
  });

  useEffect(() => {
    const sync = () => {
      const next = sectionFromHash(idsRef.current, window.location.hash);
      if (!next) return;
      setActive(next);
      navigateRef.current?.(next);
    };
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  const select = useCallback((next: TId) => {
    setActive(next);
    try {
      // 라우터 상태(history.state)는 그대로 두고 해시만 바꾼다 — 새 기록을 만들지 않는다.
      window.history.replaceState(window.history.state, "", `#${next}`);
    } catch {
      // 기록을 바꿀 수 없는 환경에서도 탭 전환은 동작한다.
    }
  }, []);

  return { active, select };
}
