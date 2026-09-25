import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioVirtualControlMode } from "./studio-virtual-space-experience-preference";
import { studioJoystickVector } from "./studio-virtual-space-joystick-input";

export interface StudioVirtualSpaceJoystickVector {
  readonly x: number;
  readonly y: number;
}

export function StudioVirtualSpaceJoystick({
  mode = "fixed",
  onVectorChange,
}: {
  readonly mode?: StudioVirtualControlMode;
  readonly onVectorChange: (vector: StudioVirtualSpaceJoystickVector) => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceJoystick");
  const padRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const centerRef = useRef({ x: .5, y: .5 });
  const [center, setCenter] = useState(centerRef.current);
  const [vector, setVector] = useState<StudioVirtualSpaceJoystickVector>({ x: 0, y: 0 });
  const publish = useCallback((next: StudioVirtualSpaceJoystickVector) => {
    setVector(next);
    onVectorChange(next);
  }, [onVectorChange]);

  const updateFromPointer = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const rect = padRef.current?.getBoundingClientRect();
    if (!rect) return;
    const radius = Math.max(1, Math.min(rect.width, rect.height) / 2);
    const anchorX = rect.left + rect.width * centerRef.current.x;
    const anchorY = rect.top + rect.height * centerRef.current.y;
    publish(studioJoystickVector(
      (event.clientX - anchorX) / radius,
      (event.clientY - anchorY) / radius,
    ));
  }, [publish]);

  const reset = useCallback((event?: PointerEvent<HTMLDivElement>) => {
    if (event && pointerIdRef.current !== event.pointerId) return;
    pointerIdRef.current = null;
    if (mode === "floating") {
      centerRef.current = { x: .5, y: .5 };
      setCenter(centerRef.current);
    }
    publish({ x: 0, y: 0 });
  }, [mode, publish]);
  const latestPublish = useRef(onVectorChange);
  latestPublish.current = onVectorChange;
  useEffect(() => {
    const stop = () => {
      pointerIdRef.current = null;
      setVector({ x: 0, y: 0 });
      latestPublish.current({ x: 0, y: 0 });
    };
    const visibility = () => { if (document.hidden) stop(); };
    globalThis.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      globalThis.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", visibility);
      latestPublish.current({ x: 0, y: 0 });
    };
  }, []);

  if (mode === "tap") return null;
  const anchorStyle = {
    "--studio-joystick-anchor-x": `${center.x * 100}%`,
    "--studio-joystick-anchor-y": `${center.y * 100}%`,
  } as CSSProperties;

  return <div
    ref={padRef}
    className="studio-vspace-joystick relative size-28 touch-none select-none rounded-full border border-white/20 bg-panel/80 shadow-2xl backdrop-blur-xl"
    role="application"
    aria-label={bt("캐릭터 이동 조이스틱", "Character movement joystick")}
    data-studio-virtual-joystick="true"
    data-mode={mode}
    style={anchorStyle}
    onPointerDown={(event) => {
      if (pointerIdRef.current !== null || (event.button !== 0 && event.button !== undefined)) return;
      event.preventDefault();
      pointerIdRef.current = event.pointerId;
      if (mode === "floating") {
        const rect = padRef.current?.getBoundingClientRect();
        if (rect) {
          centerRef.current = {
            x: Math.max(.28, Math.min(.72, (event.clientX - rect.left) / Math.max(1, rect.width))),
            y: Math.max(.28, Math.min(.72, (event.clientY - rect.top) / Math.max(1, rect.height))),
          };
          setCenter(centerRef.current);
        }
      }
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
        // Synthetic and privacy-constrained pointers may not expose capture.
      }
      updateFromPointer(event);
    }}
    onPointerMove={(event) => {
      if (pointerIdRef.current === event.pointerId) updateFromPointer(event);
    }}
    onPointerUp={reset}
    onPointerCancel={reset}
    onLostPointerCapture={reset}
  >
    <span className="pointer-events-none absolute size-[86%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-black/10"
      style={{ left: "var(--studio-joystick-anchor-x)", top: "var(--studio-joystick-anchor-y)" }} aria-hidden />
    <span
      className="pointer-events-none absolute grid size-12 place-items-center rounded-full border border-white/20 bg-accent text-on-accent shadow-lg transition-[left,top,transform] duration-75"
      style={{
        left: "var(--studio-joystick-anchor-x)",
        top: "var(--studio-joystick-anchor-y)",
        transform: `translate(calc(-50% + ${vector.x * 28}px), calc(-50% + ${vector.y * 28}px))`,
      }}
      aria-hidden
    >
      <span className="size-2 rounded-full bg-current opacity-80" />
    </span>
    <span className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 text-[0.55rem] font-black text-fg-3" aria-hidden>W</span>
    <span className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 text-[0.55rem] font-black text-fg-3" aria-hidden>S</span>
    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[0.55rem] font-black text-fg-3" aria-hidden>A</span>
    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[0.55rem] font-black text-fg-3" aria-hidden>D</span>
  </div>;
}
