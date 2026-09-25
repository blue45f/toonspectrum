import { useMemo, useState } from "react";
import { ArrowRight, LockKeyhole, MapPin, Sparkles } from "lucide-react";

import "./studio-virtual-space-place-gallery.css";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioVirtualSpaceZoneId } from "./studio-virtual-space-model";
import {
  STUDIO_VIRTUAL_PLACE_CATEGORIES,
  studioVirtualPlacesForMode,
  type StudioVirtualPlaceCategory,
  type StudioVirtualPlaceDefinition,
} from "./studio-virtual-space-place-catalog";
import type { StudioWorldInteractionDefinition } from "./studio-virtual-space-world-manifest";

export interface StudioVirtualSpacePlaceGalleryProps {
  readonly personal: boolean;
  readonly currentRoomId: StudioVirtualSpaceZoneId;
  readonly onMove: (roomId: StudioVirtualSpaceZoneId) => void;
  readonly onOpen?: (action: StudioWorldInteractionDefinition["action"]) => void;
}

const CATEGORY_COPY: Readonly<Record<StudioVirtualPlaceCategory, readonly [string, string]>> = Object.freeze({
  all: ["전체", "All"],
  creation: ["제작", "Create"],
  review: ["검수", "Review"],
  community: ["광장", "Community"],
  collaboration: ["협업", "Collaborate"],
  archive: ["자료", "Archive"],
  rest: ["휴식", "Rest"],
  play: ["놀이", "Play"],
  production: ["관제", "Production"],
});

function placeLabel(place: StudioVirtualPlaceDefinition, bilingual: (ko: string, en: string) => string): string {
  return bilingual(place.labelKo, place.labelEn);
}

export function StudioVirtualSpacePlaceGallery({
  personal,
  currentRoomId,
  onMove,
  onOpen,
}: StudioVirtualSpacePlaceGalleryProps) {
  const bt = useBilingual("domains.creator.virtual-space.StudioVirtualSpacePlaceGallery");
  const [category, setCategory] = useState<StudioVirtualPlaceCategory>("all");
  const places = useMemo(() => {
    const available = studioVirtualPlacesForMode(personal);
    const filtered = category === "all" ? available : available.filter((item) => item.category === category);
    return [...filtered].sort((left, right) => Number(Boolean(right.recommended)) - Number(Boolean(left.recommended)));
  }, [category, personal]);
  const categories = STUDIO_VIRTUAL_PLACE_CATEGORIES.filter((candidate) => candidate === "all"
    || studioVirtualPlacesForMode(personal).some((place) => place.category === candidate));

  return (
    <section className="studio-place-gallery" aria-labelledby="studio-place-gallery-title">
      <div className="studio-place-gallery__heading">
        <div>
          <p><Sparkles size={14} aria-hidden />ImageGen 2.5 place collection</p>
          <h2 id="studio-place-gallery-title">{bt("장소 선택", "Choose a place")}</h2>
          <span>{bt(
            "각 장소는 이동 동선, 제작 기능, NPC와 환경음이 연결된 독립 작업 구역입니다.",
            "Each place connects navigation, production tools, NPCs and ambience.",
          )}</span>
        </div>
      </div>

      <div className="studio-place-gallery__filters" role="group" aria-label={bt("장소 분류", "Place categories")}>
        {categories.map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-pressed={category === candidate}
            onClick={() => setCategory(candidate)}
          >
            {bt(...CATEGORY_COPY[candidate])}
          </button>
        ))}
      </div>

      <div className="studio-place-gallery__grid">
        {places.map((place) => {
          const active = place.roomId === currentRoomId;
          const label = placeLabel(place, bt);
          return (
            <article key={place.id} data-active={active || undefined} data-recommended={place.recommended || undefined}>
              <button
                type="button"
                className="studio-place-gallery__preview"
                aria-label={bt(`${place.labelKo}로 이동`, `Move to ${place.labelEn}`)}
                onClick={() => onMove(place.roomId)}
              >
                <img src={place.previewUrl} alt="" loading="lazy" decoding="async" draggable={false} />
                <span className="studio-place-gallery__shade" aria-hidden />
                <span className="studio-place-gallery__badge">
                  {active ? bt("현재 장소", "Current") : place.recommended ? bt("추천", "Recommended") : bt(...CATEGORY_COPY[place.category])}
                </span>
                {place.projectOnly ? <span className="studio-place-gallery__project"><LockKeyhole size={12} aria-hidden />{bt("프로젝트", "Project")}</span> : null}
              </button>
              <div className="studio-place-gallery__copy">
                <h3>{label}</h3>
                <p>{bt(place.descriptionKo, place.descriptionEn)}</p>
                <div>
                  <button type="button" onClick={() => onMove(place.roomId)}>
                    <MapPin size={14} aria-hidden />{active ? bt("둘러보기", "Explore") : bt("이동", "Move")}
                  </button>
                  {place.action && onOpen ? (
                    <button type="button" onClick={() => onOpen(place.action!)}>
                      {bt("기능 열기", "Open tool")}<ArrowRight size={14} aria-hidden />
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default StudioVirtualSpacePlaceGallery;
