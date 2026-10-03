import {
  creatorRoleDefinition,
  type CreatorRoleId,
} from "@/shared/lib/creator-role-contract";

/**
 * 로비 빠른 시작 프리셋(R-1)의 순서·강조 계산.
 *
 * 순서 값은 새로 만들지 않는다. 직군 정의(`CREATOR_ROLE_DEFINITIONS`)가 이미 선언한
 * 빠른 실행 액션 순서를 그대로 가져와, 그 액션과 닿는 로비 카드를 앞으로 당긴다.
 * 직군 액션과 닿지 않는 카드는 원래 상대 순서를 유지하므로 카드 집합은 전 직군 공통이고
 * 어떤 카드도 사라지지 않는다. 직군이 없거나 닿는 카드가 없으면 입력 순서를 그대로
 * 돌려주는 중립 기본값이다.
 */

function pathnameOf(href: string): string {
  const end = href.search(/[?#]/u);
  return end === -1 ? href : href.slice(0, end);
}

/**
 * 직군 액션 주소와 로비 카드 주소가 같은 목적지인지 판정한다.
 * 정확히 같은 주소, 경로만 같고 쿼리만 다른 경우, 한쪽이 다른 쪽의 하위 경로인 경우
 * (예: 직군 액션 `/studio/assets`와 카드 `/studio/assets/characters/new`,
 * 직군 액션 `/production/projects`와 카드 `/production`)를 같은 목적지로 본다.
 * 단 `/studio`(작품 라이브러리 자체)는 어떤 카드와도 연결하지 않는다 —
 * "라이브러리에서 이어가기"는 빠른 시작 카드가 아니기 때문이다.
 */
function isSameDestination(actionHref: string, lobbyHref: string): boolean {
  if (actionHref === lobbyHref) return true;
  const actionPath = pathnameOf(actionHref);
  const lobbyPath = pathnameOf(lobbyHref);
  if (actionPath === "/studio" || lobbyPath === "/studio") return false;
  if (actionPath === lobbyPath) return true;
  return lobbyPath.startsWith(`${actionPath}/`) || actionPath.startsWith(`${lobbyPath}/`);
}

export interface StudioLobbyRoleOrdering<T> {
  /** 직군 프리셋이 적용된 카드 순서. 입력과 같은 원소 집합이다. */
  readonly actions: readonly T[];
  /** 강조(추천 배지) 대상 카드. 직군이 없거나 닿는 카드가 없으면 null. */
  readonly featured: T | null;
}

export function orderStudioLobbyActionsForRole<T extends { readonly href: string }>(
  actions: readonly T[],
  activeRole: CreatorRoleId | null | undefined,
): StudioLobbyRoleOrdering<T> {
  const definition = creatorRoleDefinition(activeRole);
  if (!definition) return { actions, featured: null };
  const prioritized: T[] = [];
  const claimed = new Set<T>();
  for (const roleAction of definition.actions) {
    const match = actions.find(
      (candidate) => !claimed.has(candidate) && isSameDestination(roleAction.href, candidate.href),
    );
    if (!match) continue;
    claimed.add(match);
    prioritized.push(match);
  }
  if (prioritized.length === 0) return { actions, featured: null };
  const rest = actions.filter((action) => !claimed.has(action));
  return { actions: [...prioritized, ...rest], featured: prioritized[0] ?? null };
}
