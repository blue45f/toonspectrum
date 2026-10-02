import { useState } from "react";

/**
 * 처음 N개만 보여 주고 "더 보기"로 늘리는 목록 상태. 필터·검색이 바뀌면 `resetKey`를 바꿔
 * 다시 처음 N개부터 보여 준다(이전 필터에서 늘린 개수가 남지 않게).
 */
export function useShowMore(total: number, initial: number, resetKey = "") {
  const [state, setState] = useState({ key: resetKey, limit: initial });
  // 렌더 중 파생: 늘린 한도는 같은 키에서만 유효하고, 키가 바뀌면 이펙트 없이 초기값으로 돌아간다.
  const limit = state.key === resetKey ? state.limit : initial;
  const visible = Math.min(limit, total);
  return {
    visible,
    remaining: Math.max(0, total - visible),
    showMore: (step = initial) => setState({ key: resetKey, limit: visible + step }),
  } as const;
}

/**
 * 모바일에서만 처음 N개로 줄이는 목록 상태 — 넓은 화면(`sm` 이상)에서는 항목을 모두 보여 준다.
 *
 * 항목을 지우지 않고 CSS로만 숨기므로(`hiddenOnMobile(index)`가 참이면 `data-mobile-hidden`을 달고
 * 스타일시트가 휴대폭에서만 `display: none`), 화면 폭을 바꿔도 상태가 어긋나지 않고 서버·테스트 렌더도 같다.
 * "더 보기" 버튼은 `sm:hidden`으로 휴대폰에서만 보이게 한다. `resetKey`가 바뀌면(검색·필터) 다시 접는다.
 */
export function useMobileShowMore(total: number, initial: number, resetKey = "") {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const expanded = expandedKey === resetKey;
  return {
    expanded,
    remaining: expanded ? 0 : Math.max(0, total - initial),
    hiddenOnMobile: (index: number): boolean => !expanded && index >= initial,
    expand: () => setExpandedKey(resetKey),
  } as const;
}
