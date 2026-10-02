import { Hand, LayoutGrid, Move3d, Pointer } from "lucide-react";

import type { LucideIcon } from "lucide-react";

/**
 * 캐릭터 셰이퍼의 터치·마우스 조작(참조 아트의 "모바일 조작 가이드").
 *
 * 실제로 동작하는 제스처만 적는다: 뷰포트는 OrbitControls(한 손가락 회전, 두 손가락 확대·축소,
 * 화면 이동 꺼짐)이고, 버튼을 길게 누르면 공용 툴팁 레이어가 설명을 띄운다. 편집기 첫 사용 안내와
 * 소개 페이지의 조작법 탭이 같은 목록을 쓰도록 한곳에 둔다.
 */
export interface CharacterShaperGesture {
  readonly id: "orbit" | "zoom" | "card" | "long-press";
  readonly icon: LucideIcon;
  readonly gesture: readonly [ko: string, en: string];
  readonly result: readonly [ko: string, en: string];
}

export const CHARACTER_SHAPER_GESTURES: readonly CharacterShaperGesture[] = [
  { id: "orbit", icon: Pointer, gesture: ["한 손가락으로 끌기", "Drag with one finger"], result: ["시점 회전", "Orbit the camera"] },
  { id: "zoom", icon: Move3d, gesture: ["두 손가락 벌리기·오므리기", "Pinch with two fingers"], result: ["확대·축소", "Zoom in and out"] },
  {
    id: "card",
    icon: LayoutGrid,
    gesture: ["아래 카테고리 → 카드 누르기", "Category below → tap a card"],
    result: ["바로 적용 · 되돌리기로 취소", "Applies at once · undo to revert"],
  },
  { id: "long-press", icon: Hand, gesture: ["버튼 길게 누르기", "Long-press a button"], result: ["버튼 설명 보기", "See what it does"] },
];
