import { Activity } from "lucide-react";
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const right = deckSideOffset(props.mobile, props.dockInsets);

  const close = useCallback((): void => {
    setOpen(false);
    queueMicrotask(() => triggerRef.current?.focus());
  }, []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-controls="studio-drawing-input-deck"
        aria-expanded={open}
        aria-label="펜 입력 센터 열기"
        title="펜 입력 센터 · 장치 진단과 작업별 보정 프로필"
        data-studio-drawing-input-deck-trigger="true"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[72] inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-line-strong bg-card/95 px-3 text-[0.68rem] font-bold text-fg shadow-[0_10px_30px_oklch(0.08_0.01_70/0.32)] backdrop-blur-xl",
          "hover:border-accent/45 hover:bg-raised active:scale-[0.98]",
          STUDIO_EASE,
          STUDIO_FOCUS_RING,
          open && "border-accent/55 bg-accent-soft text-accent"
        )}
        style={{ right }}
      >
        <Activity size={15} aria-hidden="true" />
        <span className={props.mobile ? "sr-only" : undefined}>입력</span>
      </button>

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
    </>
  );
}
