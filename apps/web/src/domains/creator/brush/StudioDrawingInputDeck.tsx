import { Activity, BookMarked } from "lucide-react";
import {
  Suspense,
  useCallback,
  useRef,
  useState,
  type ReactElement,
} from "react";

import { STUDIO_EASE, STUDIO_FOCUS_RING } from "../studio-panel-ui";

import type { StudioBrushStampTuning } from "./studio-brush-library";
import type {
  StudioPressureCurveUi,
  StudioStabilizerModeUi,
} from "./StudioDrawOptionsBar";

import { lazyRetry } from "@/shared/lib/lazy-retry";
import { cn } from "@/shared/lib/utils";

const StudioDrawingInputDeckPanel = lazyRetry(
  () =>
    import("./StudioDrawingInputDeckPanel").then((mod) => ({
      default: mod.StudioDrawingInputDeckPanel,
    })),
  "StudioDrawingInputDeckPanel"
);
const StudioDrawingInputProfileLibraryPanel = lazyRetry(
  () =>
    import("./StudioDrawingInputProfileLibraryPanel").then((mod) => ({
      default: mod.StudioDrawingInputProfileLibraryPanel,
    })),
  "StudioDrawingInputProfileLibraryPanel"
);

export interface StudioDrawingInputDeckProps {
  readonly brushLabel: string;
  readonly mobile: boolean;
  readonly dockInsets: Readonly<{ left: number; right: number }>;
  readonly stabilizer: number;
  readonly stabilizerMode: StudioStabilizerModeUi;
  readonly postCorrection: number;
  readonly pressureCurveId: StudioPressureCurveUi;
  readonly stampTuning: StudioBrushStampTuning | null;
  readonly onStabilizerChange: (value: number) => void;
  readonly onStabilizerModeChange: (mode: StudioStabilizerModeUi) => void;
  readonly onPostCorrectionChange: (value: number) => void;
  readonly onPressureCurveChange: (curve: StudioPressureCurveUi) => void;
  readonly onStampTuningChange: (tuning: StudioBrushStampTuning) => void;
  readonly onOpenBrushStudio: () => void;
}

function deckSideOffset(
  mobile: boolean,
  dockInsets: Readonly<{ right: number }>
): number {
  return mobile ? 12 : Math.max(12, dockInsets.right + 12);
}

export function StudioDrawingInputDeck(
  props: StudioDrawingInputDeckProps
): ReactElement {
  const [open, setOpen] = useState(false);
  const [profileLibraryOpen, setProfileLibraryOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const profileTriggerRef = useRef<HTMLButtonElement>(null);
  const right = deckSideOffset(props.mobile, props.dockInsets);
  // The mobile workspace toggle occupies the dock's right edge. Anchor this floating
  // launcher above the published canvas inset instead of overlapping that control.
  const bottom = props.mobile
    ? "calc(var(--studio-canvas-bottom-inset, 7rem) + 0.75rem)"
    : undefined;

  const close = useCallback((): void => {
    setOpen(false);
    queueMicrotask(() => triggerRef.current?.focus());
  }, []);
  const closeProfileLibrary = useCallback((): void => {
    setProfileLibraryOpen(false);
    queueMicrotask(() => profileTriggerRef.current?.focus());
  }, []);
  const anySurfaceOpen = open || profileLibraryOpen;

  return (
    <>
      <div
        className={cn(
          "fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] flex items-center gap-1 rounded-full border border-line-strong bg-card/95 p-1 shadow-[0_10px_30px_oklch(0.08_0.01_70/0.32)] backdrop-blur-xl",
          // Closed launchers must yield to mobile tool sheets (z53–55).
          props.mobile && !anySurfaceOpen ? "z-[52]" : "z-[72]",
        )}
        style={{ right, bottom }}
        data-studio-drawing-input-launchers="true"
      >
        <button
          ref={triggerRef}
          type="button"
          aria-controls="studio-drawing-input-deck"
          aria-expanded={open}
          aria-label="펜 입력 센터 열기"
          title="펜 입력 센터 · 장치 진단과 작업별 보정 프로필"
          data-studio-drawing-input-deck-trigger="true"
          onClick={() => {
            setProfileLibraryOpen(false);
            setOpen((current) => !current);
          }}
          className={cn(
            "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-3 text-[0.68rem] font-bold text-fg",
            "hover:bg-raised active:scale-[0.98]",
            STUDIO_EASE,
            STUDIO_FOCUS_RING,
            open && "bg-accent-soft text-accent"
          )}
        >
          <Activity size={15} aria-hidden="true" />
          <span className={props.mobile ? "sr-only" : undefined}>입력</span>
        </button>
        <button
          ref={profileTriggerRef}
          type="button"
          aria-controls="studio-drawing-input-profile-library"
          aria-expanded={profileLibraryOpen}
          aria-label="내 입력 프로필 열기"
          title="내 입력 프로필 · 현재 입력감을 저장하고 다시 적용"
          data-studio-drawing-input-profile-library-trigger="true"
          onClick={() => {
            setOpen(false);
            setProfileLibraryOpen((current) => !current);
          }}
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-full text-fg-2 hover:bg-raised hover:text-fg active:scale-[0.98]",
            STUDIO_EASE,
            STUDIO_FOCUS_RING,
            profileLibraryOpen && "bg-accent-soft text-accent"
          )}
        >
          <BookMarked size={15} aria-hidden="true" />
        </button>
      </div>

      {open ? (
        <Suspense
          fallback={
            <div
              role="status"
              data-studio-drawing-input-deck-pending="true"
              className="fixed bottom-[calc(8rem+env(safe-area-inset-bottom))] z-[73] w-[min(24rem,calc(100vw-1.5rem))] rounded-2xl border border-line bg-card/95 p-4 text-xs font-semibold text-fg-3 shadow-2xl backdrop-blur-xl"
              style={{ right }}
            >
              펜 입력 센터를 불러오는 중…
            </div>
          }
        >
          <StudioDrawingInputDeckPanel {...props} onClose={close} />
        </Suspense>
      ) : null}
      {profileLibraryOpen ? (
        <Suspense
          fallback={
            <div
              role="status"
              className="fixed bottom-[calc(8rem+env(safe-area-inset-bottom))] z-[73] w-[min(23rem,calc(100vw-1.5rem))] rounded-2xl border border-line bg-card/95 p-4 text-xs font-semibold text-fg-3 shadow-2xl backdrop-blur-xl"
              style={{ right }}
            >
              내 입력 프로필을 불러오는 중…
            </div>
          }
        >
          <StudioDrawingInputProfileLibraryPanel {...props} onClose={closeProfileLibrary} />
        </Suspense>
      ) : null}
    </>
  );
}
