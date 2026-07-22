import { ImageIcon, LocateFixed, Move } from "lucide-react";
import { useRef, type KeyboardEvent, type PointerEvent } from "react";

import {
  normalizeStudioCompanionPoint,
  type StudioCompanionNormalizedPoint,
  type StudioCompanionNormalizedRect,
} from "./studio-companion-review-projection";

import { cn } from "@/lib/utils";

export interface StudioCompanionNavigatorProps {
  imageUrl: string | null;
  imageWidth: number;
  imageHeight: number;
  viewport: StudioCompanionNormalizedRect;
  connected: boolean;
  captureAllowed: boolean;
  onNavigate: (point: StudioCompanionNormalizedPoint, final?: boolean) => void;
}

function pointFromPointer(
  event: PointerEvent<HTMLButtonElement>
): StudioCompanionNormalizedPoint {
  const bounds = event.currentTarget.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return { x: 0.5, y: 0.5 };
  return normalizeStudioCompanionPoint({
    x: (event.clientX - bounds.left) / bounds.width,
    y: (event.clientY - bounds.top) / bounds.height,
  });
}

export function StudioCompanionNavigator({
  imageUrl,
  imageWidth,
  imageHeight,
  viewport,
  connected,
  captureAllowed,
  onNavigate,
}: StudioCompanionNavigatorProps) {
  const activePointerRef = useRef<number | null>(null);
  const interactionReady = connected && imageUrl !== null && captureAllowed;
  const currentCenter = {
    x: viewport.x + viewport.width / 2,
    y: viewport.y + viewport.height / 2,
  };

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (!interactionReady) return;
    activePointerRef.current = event.pointerId;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Older WebViews still deliver click navigation without pointer capture.
    }
    onNavigate(pointFromPointer(event));
  }

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (!interactionReady || activePointerRef.current !== event.pointerId) return;
    onNavigate(pointFromPointer(event));
  }

  function releasePointer(event: PointerEvent<HTMLButtonElement>) {
    if (activePointerRef.current !== event.pointerId) return;
    if (interactionReady) onNavigate(pointFromPointer(event), true);
    activePointerRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The browser may have released capture after leaving the popup.
    }
  }

  function cancelPointer(event: PointerEvent<HTMLButtonElement>) {
    if (activePointerRef.current !== event.pointerId) return;
    activePointerRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer cancellation commonly means capture was already revoked by the browser.
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!interactionReady) return;
    const step = event.shiftKey ? 0.2 : 0.05;
    let next: StudioCompanionNormalizedPoint | null = null;
    if (event.key === "ArrowLeft") next = { x: currentCenter.x - step, y: currentCenter.y };
    else if (event.key === "ArrowRight") next = { x: currentCenter.x + step, y: currentCenter.y };
    else if (event.key === "ArrowUp") next = { x: currentCenter.x, y: currentCenter.y - step };
    else if (event.key === "ArrowDown") next = { x: currentCenter.x, y: currentCenter.y + step };
    else if (event.key === "Home") next = { x: 0.5, y: 0.5 };
    if (!next) return;
    event.preventDefault();
    onNavigate(normalizeStudioCompanionPoint(next));
  }

  const aspectRatio = imageWidth > 0 && imageHeight > 0
    ? `${imageWidth} / ${imageHeight}`
    : "4 / 5";

  return (
    <section aria-labelledby="companion-navigator-title" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="companion-navigator-title" className="text-sm font-semibold text-fg">
            캔버스 Navigator
          </h2>
          <p id="companion-navigator-help" className="mt-0.5 text-xs leading-relaxed text-fg-3">
            미리보기를 누르거나 끌어 기본 탭의 보이는 위치를 옮깁니다. 방향키도 사용할 수 있어요.
          </p>
        </div>
        <span className="inline-flex min-h-7 shrink-0 items-center gap-1 rounded-full border border-line bg-card px-2 text-[0.65rem] font-semibold text-fg-2">
          <LocateFixed className="size-3" aria-hidden />
          최대 2fps
        </span>
      </div>

      <button
        type="button"
        disabled={!interactionReady}
        aria-label="전체 캔버스 미리보기에서 보이는 위치 이동"
        aria-describedby="companion-navigator-help"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={releasePointer}
        onPointerCancel={cancelPointer}
        onLostPointerCapture={() => {
          activePointerRef.current = null;
        }}
        onKeyDown={handleKeyDown}
        className={cn(
          "relative grid min-h-48 w-full touch-none place-items-center overflow-hidden rounded-xl border border-line bg-[oklch(0.145_0.008_70)] text-left outline-none",
          "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/35",
          interactionReady
            ? "cursor-crosshair hover:border-line-strong"
            : "cursor-not-allowed opacity-70"
        )}
        style={{ aspectRatio }}
      >
        {imageUrl ? (
          <>
            <img
              src={imageUrl}
              alt="현재 페이지 전체 캔버스"
              draggable={false}
              className="pointer-events-none absolute inset-0 size-full object-fill"
            />
            <span
              aria-hidden
              data-testid="studio-companion-viewport-box"
              className="pointer-events-none absolute rounded-sm border-2 border-accent bg-accent/10 shadow-[0_0_0_1px_oklch(0.18_0.01_70/0.7)] motion-safe:transition-[left,top,width,height] motion-safe:duration-150 motion-reduce:transition-none"
              style={{
                left: `${viewport.x * 100}%`,
                top: `${viewport.y * 100}%`,
                width: `${viewport.width * 100}%`,
                height: `${viewport.height * 100}%`,
              }}
            />
          </>
        ) : (
          <span className="flex max-w-56 flex-col items-center px-5 text-center">
            <span className="grid size-11 place-items-center rounded-xl border border-line bg-card text-fg-3">
              <ImageIcon className="size-5" aria-hidden />
            </span>
            <strong className="mt-3 text-xs font-semibold text-fg-2">
              {connected ? "미리보기를 준비하고 있어요" : "기본 스튜디오 미연결"}
            </strong>
            <span className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">
              연결 후 안전한 WebP 전체 캔버스가 표시됩니다.
            </span>
          </span>
        )}
      </button>

      <p role="status" aria-live="polite" className="flex min-h-6 items-center gap-2 text-xs text-fg-3">
        <Move className="size-3.5 shrink-0" aria-hidden />
        {!connected
          ? "연결되면 위치 이동을 사용할 수 있습니다."
          : !captureAllowed
            ? "획을 그리는 동안 캡처를 멈췄습니다. 획이 끝나면 갱신합니다."
            : imageUrl
              ? "주황색 상자가 기본 탭에서 현재 보이는 영역입니다."
              : "변경된 캔버스를 압축하는 중입니다."}
      </p>
    </section>
  );
}

export default StudioCompanionNavigator;
