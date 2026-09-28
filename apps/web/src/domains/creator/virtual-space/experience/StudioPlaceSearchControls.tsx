import { useId } from "react";
import { Search, X } from "lucide-react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import "./studio-cinematic-experience.css";

export function StudioPlaceSearchControls({ query, count, filtered, onQuery, onReset }: {
  readonly query: string; readonly count: number; readonly filtered: boolean;
  readonly onQuery: (value: string) => void; readonly onReset: () => void;
}) {
  const bt = useBilingual("StudioPlaceSearchControls");
  const id = useId();
  return <>
    <div className="studio-place-gallery__search">
      <Search size={17} aria-hidden />
      <input id={id} type="search" value={query} maxLength={160} aria-label={bt("장소 검색", "Search places")}
        placeholder={bt("장소·작업·분위기로 검색", "Search places, work or atmosphere")}
        onChange={(event) => onQuery(event.target.value)} />
      {query ? <button type="button" aria-label={bt("검색어 지우기", "Clear search")} onClick={() => onQuery("")}><X size={16} aria-hidden /></button> : null}
    </div>
    <div className="studio-place-gallery__results">
      <p role="status">{count ? bt(`${count}개의 장소`, `${count} places`) : bt("조건에 맞는 장소가 없습니다.", "No matching places.")}</p>
      {filtered ? <button type="button" onClick={onReset}>{bt("전체 장소 보기", "Show all places")}</button> : null}
    </div>
  </>;
}
