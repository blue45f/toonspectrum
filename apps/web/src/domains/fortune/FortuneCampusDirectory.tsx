import type { FortuneGroup } from "@toonspectrum/core/fortune";
import { useI18n } from "@/shared/lib/i18n";
import { FORTUNE_CAMPUS_ROOMS } from "./fortune-campus-map";

export function FortuneCampusDirectory({ group, onSelect }: {
  readonly group: FortuneGroup;
  readonly onSelect: (group: FortuneGroup) => void;
}) {
  const locale = useI18n((state) => state.lang.startsWith("ko") ? "ko" : "en");
  return <header className="fortune-campus-directory">
    <h1>{locale === "ko" ? "별빛 관측소" : "Starlight observatory"}</h1>
    <p>{locale === "ko" ? "카드, 시간, 관계와 창작의 상징을 나만의 속도로 살펴보세요." : "Explore cards, time, relationships and creativity at your own pace."}</p>
    <nav aria-label={locale === "ko" ? "관측소의 방" : "Observatory rooms"}>
      <button type="button" aria-pressed={group === "전체"} onClick={() => onSelect("전체")}>
        {locale === "ko" ? "전체 관측소" : "All rooms"}
      </button>
      {FORTUNE_CAMPUS_ROOMS.map((room) => <button type="button" key={room.id}
        aria-pressed={group === room.group} onClick={() => onSelect(room.group)}>
        {locale === "ko" ? room.title : room.en}
      </button>)}
    </nav>
  </header>;
}
