import { useCallback, useRef, useState, type PointerEvent } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export interface StudioVirtualSpaceJoystickVector {
  readonly x: number;
  readonly y: number;
}

export function StudioVirtualSpaceJoystick({
  onVectorChange,
}: {
  readonly onVectorChange: (vector: StudioVirtualSpaceJoystickVector) => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceJoystick");
  const padRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const [vector, setVector] = useState<StudioVirtualSpaceJoystickVector>({ x: 0, y: 0 });

  const publish = useCallback((next: StudioVirtualSpaceJoystickVector) => {
    setVector(next);
    onVectorChange(next);
  }, [onVectorChange]);

  const updateFromPointer = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const rect = padRef.current?.getBoundingClientRect();
    if (!rect) return;
    const radius = Math.max(1, Math.min(rect.width, rect.height) / 2);
    const dx = (event.clientX - (rect.left + rect.width / 2)) / radius;
    const dy = (event.clientY - (rect.top + rect.height / 2)) / radius;
    const length = Math.hypot(dx, dy);
    const scale = length > 1 ? 1 / length : 1;
    publish({ x: dx * scale, y: dy * scale });
  }, [publish]);

  const reset = useCallback((event?: PointerEvent<HTMLDivElement>) => {
    if (event && pointerIdRef.current !== event.pointerId) return;
    pointerIdRef.current = null;
    publish({ x: 0, y: 0 });
  }, [publish]);

  return (
    <div
      ref={padRef}
      className="studio-vspace-joystick relative size-28 touch-none select-none rounded-full border border-white/20 bg-panel/80 shadow-2xl backdrop-blur-xl"
      role="application"
      aria-label={bt("캐릭터 이동 조이스틱", "Character movement joystick")}
      data-studio-virtual-joystick="true"
      onPointerDown={(event) => {
        pointerIdRef.current = event.pointerId;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        updateFromPointer(event);
      }}
      onPointerMove={(event) => {
        if (pointerIdRef.current !== event.pointerId) return;
        updateFromPointer(event);
      }}
      onPointerUp={reset}
      onPointerCancel={reset}
    >
      <span className="pointer-events-none absolute inset-3 rounded-full border border-white/10 bg-black/10" aria-hidden />
      <span
        className="pointer-events-none absolute left-1/2 top-1/2 grid size-12 place-items-center rounded-full border border-white/20 bg-accent text-on-accent shadow-lg transition-transform duration-75"
        style={{ transform: `translate(calc(-50% + ${vector.x * 28}px), calc(-50% + ${vector.y * 28}px))` }}
        aria-hidden
      >
        <span className="size-2 rounded-full bg-current opacity-80" />
      </span>
      <span className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 text-[0.55rem] font-black text-fg-3" aria-hidden>W</span>
      <span className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 text-[0.55rem] font-black text-fg-3" aria-hidden>S</span>
      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[0.55rem] font-black text-fg-3" aria-hidden>A</span>
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[0.55rem] font-black text-fg-3" aria-hidden>D</span>
    </div>
  );
}
