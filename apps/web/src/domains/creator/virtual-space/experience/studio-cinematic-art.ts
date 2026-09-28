import type { StudioVirtualArtStyleKey } from "../studio-virtual-space-art-style";
import { studioVirtualBackdropUrl, type StudioVirtualBackdrop } from "../studio-virtual-space-environment-preference";

export const STUDIO_CINEMATIC_ART = [
  { id: "campus-day", labelKo: "창작 캠퍼스", labelEn: "Creative campus", height: 682,
    descriptionKo: "구름과 폭포 사이로 이어지는 창작 공간", descriptionEn: "Creative spaces between clouds and waterfalls" },
  { id: "campus-garden", labelKo: "정원 캠퍼스", labelEn: "Garden campus", height: 682,
    descriptionKo: "도서관과 정원에서 떠올리는 새로운 이야기", descriptionEn: "New stories in the library and gardens" },
  { id: "campus-social", labelKo: "함께하는 작업실", labelEn: "Shared atelier", height: 576,
    descriptionKo: "작업과 대화가 자연스럽게 이어지는 풍경", descriptionEn: "A landscape connecting creation and conversation" },
  { id: "studio-tour", labelKo: "스튜디오 디자인", labelEn: "Studio design", height: 576,
    descriptionKo: "함께 만들어 갈 스튜디오의 디자인 컨셉", descriptionEn: "A design concept for the studio we are building" },
] as const;

export type StudioCinematicArtId = typeof STUDIO_CINEMATIC_ART[number]["id"];
export function studioCinematicArtUrl(id: StudioCinematicArtId, width: 480 | 1024 = 1024): string {
  return `/assets/virtual-studio/cinematic-v9/${id}-${width}.webp`;
}

/** 원경만 교체한다. 사용자 월드·다른 테마의 작화와 물리·권한 모델은 변경하지 않는다. */
export function studioCinematicBackdropUrl(backdrop: StudioVirtualBackdrop, style: StudioVirtualArtStyleKey, builtin: boolean): string {
  if (builtin && style === "sky-island") {
    if (backdrop === "sky") return studioCinematicArtUrl("campus-day");
    if (backdrop === "forest") return studioCinematicArtUrl("campus-garden");
  }
  return studioVirtualBackdropUrl(backdrop, style);
}
