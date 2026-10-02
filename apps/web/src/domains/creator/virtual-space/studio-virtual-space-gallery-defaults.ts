/**
 * 전시관 기본 액자 세트 (트랙 B 고도화).
 *
 * 빌트인 월드의 콘티 갤러리(storyboard 존, 340·40·270×210) 벽에 거는
 * 기본 전시 구성이다. 이미지 소재는 장소 갤러리가 이미 쓰는 스튜디오 자체
 * 아트(places 프리뷰)를 재사용한다 — 외부·유료 에셋을 새로 들이지 않는다.
 * 프로젝트 연동 시 호출자가 실제 작품 프레임으로 교체한다.
 */

import type { StudioGalleryFrame } from "./studio-virtual-space-gallery";

const ART_ROOT = "/assets/virtual-studio/imagegen25-v7/places";

/** 콘티 갤러리 벽(y=120)에 일정 간격으로 건 기본 액자 4점. */
export function studioVirtualSpaceDefaultGalleryFrames(): readonly StudioGalleryFrame[] {
  return Object.freeze([
    {
      id: "gallery-rainy-alley",
      titleKo: "비 내리는 골목", titleEn: "Rainy Alley",
      artistNoteKo: "1화 오프닝이에요. 우산 끝 물방울이 다음 컷으로 이어지게 그렸어요.",
      artistNoteEn: "The episode 1 opening. The droplet on the umbrella tip carries into the next panel.",
      imageUrl: `${ART_ROOT}/story-lab.webp`,
      position: { x: 385, y: 120 }, width: 64, height: 84, hall: "콘티 갤러리",
    },
    {
      id: "gallery-rooftop",
      titleKo: "옥상 위 두 사람", titleEn: "Two on the Rooftop",
      artistNoteKo: "감정이 바뀌는 장면이라 배경을 일부러 비워 뒀어요.",
      artistNoteEn: "The emotional turning point, so the background stays deliberately empty.",
      imageUrl: `${ART_ROOT}/creator-plaza.webp`,
      position: { x: 465, y: 120 }, width: 64, height: 84, hall: "콘티 갤러리",
    },
    {
      id: "gallery-night-store",
      titleKo: "심야 편의점", titleEn: "Late-Night Store",
      artistNoteKo: "형광등 색을 차갑게 잡아서 새벽 공기를 냈어요.",
      artistNoteEn: "The fluorescent light is kept cold to hold the pre-dawn air.",
      imageUrl: `${ART_ROOT}/tree-library.webp`,
      position: { x: 545, y: 120 }, width: 64, height: 84, hall: "콘티 갤러리",
    },
    {
      id: "gallery-first-snow",
      titleKo: "첫눈 오는 역", titleEn: "First Snow Station",
      artistNoteKo: "시즌 마지막 장면이에요. 발자국이 시선을 안쪽으로 끌어요.",
      artistNoteEn: "The season finale. Footprints pull the eye inward.",
      imageUrl: `${ART_ROOT}/review-gallery.webp`,
      position: { x: 560, y: 205 }, width: 64, height: 84, hall: "콘티 갤러리",
    },
  ]);
}
