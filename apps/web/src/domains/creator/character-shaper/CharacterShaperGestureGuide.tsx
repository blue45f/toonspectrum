/**
 * 터치 화면 첫 사용 조작 안내(참조 아트의 "모바일 조작 가이드").
 *
 * 목록은 `character-shaper-gestures.ts`가 소유한다(소개 페이지의 조작법 탭과 같은 목록).
 * 닫은 기록은 이 브라우저에만 남기며, 저장소를 쓸 수 없으면 매번 안내해도 편집은 막지 않는다.
 */
import { X } from "lucide-react";
import { useId } from "react";

import { CHARACTER_SHAPER_GESTURES } from "./character-shaper-gestures";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export function CharacterShaperGestureGuide({ onDismiss }: { readonly onDismiss: () => void }) {
  const bt = useBilingual("CharacterShaperGestureGuide");
  const headingId = useId();
  const rows = CHARACTER_SHAPER_GESTURES.map((row) => ({
    id: row.id,
    icon: row.icon,
    gesture: bt(row.gesture[0], row.gesture[1]),
    result: bt(row.result[0], row.result[1]),
  }));
  return (
    <section
      aria-labelledby={headingId}
      data-character-gesture-guide="true"
      className="character-gesture-guide"
    >
      <div className="character-gesture-guide__head">
        <h3 id={headingId}>{bt("화면 조작 안내", "Touch controls")}</h3>
        <button type="button" onClick={onDismiss} aria-label={bt("조작 안내 닫기", "Close touch controls")}>
          <X size={15} aria-hidden />
        </button>
      </div>
      <ul>
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <li key={row.id}>
              <span className="character-gesture-guide__icon"><Icon size={17} aria-hidden /></span>
              <span className="character-gesture-guide__text">
                <strong>{row.gesture}</strong>
                <span>{row.result}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <button type="button" className="character-gesture-guide__confirm" onClick={onDismiss}>
        {bt("확인", "Got it")}
      </button>
    </section>
  );
}
