import { useRef } from "react";

import type { CharacterSlotCardProps } from "./character-shaper-ui-contract";
import type { KeyboardEvent, MouseEvent, PointerEvent } from "react";

type CharacterPresetInteractionProps = Pick<CharacterSlotCardProps,
  "entry" | "onCommit" | "onHover" | "onFocus" | "onPreviewStart" | "onPreviewEnd"> & { readonly unavailable: boolean };

/** 터치 접촉과 스크롤은 후보 적용 의도가 아니다. 마우스와 키보드만 가역 미리보기를 시작한다. */
export function useCharacterPresetInteraction({
  entry, unavailable, onCommit, onHover, onFocus, onPreviewStart, onPreviewEnd,
}: CharacterPresetInteractionProps) {
  const pointerInsideRef = useRef(false);
  const focusedRef = useRef(false);
  const contactRef = useRef<{ x: number; y: number; active: boolean; cancelled: boolean } | null>(null);
  const suppressFocusPreviewRef = useRef(false);
  const isContact = (event: PointerEvent<HTMLButtonElement>) => event.pointerType === "touch" || event.pointerType === "pen";
  const startPreview = () => { if (!unavailable) onPreviewStart?.(entry); };
  const endPreview = () => onPreviewEnd?.(entry.id);

  return {
    onClick: (event: MouseEvent<HTMLButtonElement>) => {
      suppressFocusPreviewRef.current = false;
      // 키보드와 보조 기술의 합성 click(detail=0)은 앞선 터치 취소와 독립적이다.
      if (unavailable || (contactRef.current?.cancelled && event.detail !== 0)) return;
      onCommit(entry);
    },
    onPointerEnter: (event: PointerEvent<HTMLButtonElement>) => {
      if (isContact(event)) { suppressFocusPreviewRef.current = true; return; }
      suppressFocusPreviewRef.current = false;
      pointerInsideRef.current = true;
      onHover(entry.id);
      startPreview();
    },
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      suppressFocusPreviewRef.current = isContact(event);
      contactRef.current = isContact(event)
        ? { x: event.clientX, y: event.clientY, active: true, cancelled: event.isPrimary === false }
        : null;
      if (isContact(event)) {
        pointerInsideRef.current = false;
        focusedRef.current = false;
        endPreview();
      }
    },
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
      const contact = contactRef.current;
      if (contact?.active && Math.hypot(event.clientX - contact.x, event.clientY - contact.y) > 8) contact.cancelled = true;
    },
    onPointerUp: () => {
      if (contactRef.current) {
        contactRef.current.active = false;
        if (contactRef.current.cancelled) suppressFocusPreviewRef.current = false;
      }
    },
    onPointerCancel: () => {
      suppressFocusPreviewRef.current = false;
      if (contactRef.current) { contactRef.current.active = false; contactRef.current.cancelled = true; }
      pointerInsideRef.current = false;
      focusedRef.current = false;
      onHover(null);
      endPreview();
    },
    onPointerLeave: () => {
      if (contactRef.current?.active) {
        contactRef.current.cancelled = true;
        suppressFocusPreviewRef.current = false;
      }
      pointerInsideRef.current = false;
      onHover(null);
      if (!focusedRef.current) endPreview();
    },
    onFocus: () => {
      onFocus(entry.id);
      if (suppressFocusPreviewRef.current) return;
      focusedRef.current = true;
      startPreview();
    },
    onBlur: () => {
      focusedRef.current = false;
      suppressFocusPreviewRef.current = false;
      if (!pointerInsideRef.current) endPreview();
    },
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      contactRef.current = null;
      if (!focusedRef.current) {
        suppressFocusPreviewRef.current = false;
        focusedRef.current = true;
        if (event.key !== "Escape" && event.key !== "Tab") startPreview();
      }
    },
  };
}

