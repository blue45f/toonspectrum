/**
 * 터치 화면 첫 사용 조작 안내(참조 아트의 "모바일 조작 가이드").
 *
 * 실제로 동작하는 제스처만 적는다: 뷰포트는 OrbitControls(한 손가락 회전, 두 손가락 확대·축소,
 * 화면 이동 꺼짐)이고, 버튼을 길게 누르면 공용 툴팁 레이어가 설명을 띄운다. 닫은 기록은 이
 * 브라우저에만 남기며, 저장소를 쓸 수 없으면 매번 안내해도 편집은 막지 않는다.
 */
import { Hand, LayoutGrid, Move3d, Pointer, X } from "lucide-react";
import { useId } from "react";

import type { LucideIcon } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

interface GuideRow {
  readonly icon: LucideIcon;
  readonly gesture: string;
  readonly result: string;
}

export function CharacterShaperGestureGuide({ onDismiss }: { readonly onDismiss: () => void }) {
  const bt = useBilingual("CharacterShaperGestureGuide");
  const headingId = useId();
  const rows: readonly GuideRow[] = [
    { icon: Pointer, gesture: bt("한 손가락으로 끌기", "Drag with one finger"), result: bt("시점 회전", "Orbit the camera") },
    { icon: Move3d, gesture: bt("두 손가락 벌리기·오므리기", "Pinch with two fingers"), result: bt("확대·축소", "Zoom in and out") },
    { icon: LayoutGrid, gesture: bt("아래 카테고리 → 카드 누르기", "Category below → tap a card"), result: bt("바로 적용 · 되돌리기로 취소", "Applies at once · undo to revert") },
    { icon: Hand, gesture: bt("버튼 길게 누르기", "Long-press a button"), result: bt("버튼 설명 보기", "See what it does") },
  ];
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
            <li key={row.gesture}>
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
