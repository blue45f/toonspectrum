/**
 * 문서에서 이미지 요소 식별자만 문서 순서대로 뽑는다.
 * 페이지 합성 필터는 합성 레이어를 image 타입 요소로 남기므로, 삽입 직전의
 * 식별자 집합과 비교해야 새로 삽입한 이미지를 정확히 하나만 가려낼 수 있다.
 */
export function canonicalImageElementIds(pagesList: unknown): string[] {
  if (!Array.isArray(pagesList)) return [];
  const ids: string[] = [];
  for (const page of pagesList) {
    if (page === null || typeof page !== "object") continue;
    const elements = (page as { elements?: unknown }).elements;
    if (!Array.isArray(elements)) continue;
    for (const element of elements) {
      if (element === null || typeof element !== "object") continue;
      const candidate = element as { type?: unknown; id?: unknown };
      if (candidate.type !== "image") continue;
      if (typeof candidate.id !== "string" || candidate.id.length === 0) continue;
      if (!ids.includes(candidate.id)) ids.push(candidate.id);
    }
  }
  return ids;
}

/** 삽입으로 새로 생긴 이미지 식별자를 찾는다. 기준 집합은 삽입 직전 문서에서 온다. */
export function newlyInsertedCanonicalImageId(
  pagesList: unknown,
  previousIds: ReadonlySet<string>,
): string | null {
  const added = canonicalImageElementIds(pagesList).filter((id) => !previousIds.has(id));
  return added.length === 1 ? added[0]! : null;
}
