import { studioVirtualPlacesForMode, type StudioVirtualPlaceCategory, type StudioVirtualPlaceDefinition } from "../studio-virtual-space-place-catalog";

const CATEGORY_SEARCH: Readonly<Record<StudioVirtualPlaceCategory, string>> = {
  all: "전체 all", creation: "제작 창작 create", review: "검수 review", community: "광장 community",
  collaboration: "협업 collaborate", archive: "자료 archive", rest: "휴식 rest", play: "놀이 play", production: "관제 production",
};

function normalizeSearch(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
}

/** 검색은 개인 공간의 접근 가능한 목록 안에서만 수행한다. */
export function searchStudioVirtualPlaces(personal: boolean, category: StudioVirtualPlaceCategory, query: string): readonly StudioVirtualPlaceDefinition[] {
  const terms = normalizeSearch(query).split(" ").filter(Boolean);
  return studioVirtualPlacesForMode(personal)
    .filter((item) => category === "all" || item.category === category)
    .filter((item) => {
      const content = normalizeSearch(`${item.labelKo} ${item.labelEn} ${item.descriptionKo} ${item.descriptionEn} ${CATEGORY_SEARCH[item.category]}`);
      return terms.every((term) => content.includes(term));
    })
    .sort((left, right) => Number(Boolean(right.recommended)) - Number(Boolean(left.recommended)));
}
