import { lazy, Suspense } from "react";

import { normalizeAutoAdjust, type AutoAdjust } from "./studio-auto-adjust";
import { normalizeBlurFx, type BlurFx } from "./studio-blur";
import { normalizeChannelMixer, type ChannelMixer } from "./studio-channel-mixer";
import { normalizeClarity, type Clarity } from "./studio-clarity";
import { normalizeColorBalance, type ColorBalance } from "./studio-color-balance";
import { normalizeCurve, type CurvePoint } from "./studio-curves";
import { normalizeDetail, type Detail } from "./studio-detail";
import { normalizeDistort, type Distort } from "./studio-distort";
import { normalizeGlow, type Glow } from "./studio-glow";
import { normalizeGradientMap, type GradientMap } from "./studio-gradient-map";
import { normalizeGrain, type Grain } from "./studio-grain";
import { normalizeHalftone, type Halftone } from "./studio-halftone";
import { type LayerStylePatch } from "./studio-layer-styles";
import { normalizeLevels, type LevelsParams } from "./studio-levels";
import { normalizeLight, type Light } from "./studio-light";
import { extractFilterFields, looksResetPatch, type StudioLook } from "./studio-looks";
import { normalizeOutline, type Outline } from "./studio-outline";
import { normalizePhotoFilter, type PhotoFilter } from "./studio-photo-filter";
import { normalizeSelectiveHsl, type SelectiveHsl } from "./studio-selective-hsl";
import { normalizeSketch, type Sketch } from "./studio-sketch";
import { normalizeStylize, type Stylize } from "./studio-stylize";
import { normalizeVibrance, type Vibrance } from "./studio-vibrance";

import type { ImageFilterFields } from "./studio-konva-filter-fields";
import type { El, ImageEl } from "./StudioPage";

const StudioAutoAdjustPanel = lazy(() =>
  import("./StudioAutoAdjustPanel").then((mod) => ({ default: mod.StudioAutoAdjustPanel }))
);
const StudioBlurPanel = lazy(() =>
  import("./StudioBlurPanel").then((mod) => ({ default: mod.StudioBlurPanel }))
);
const StudioChannelMixerPanel = lazy(() =>
  import("./StudioChannelMixerPanel").then((mod) => ({ default: mod.StudioChannelMixerPanel }))
);
const StudioClarityPanel = lazy(() =>
  import("./StudioClarityPanel").then((mod) => ({ default: mod.StudioClarityPanel }))
);
const StudioColorBalancePanel = lazy(() =>
  import("./StudioColorBalancePanel").then((mod) => ({ default: mod.StudioColorBalancePanel }))
);
const StudioCurvePanel = lazy(() =>
  import("./StudioCurvePanel").then((mod) => ({ default: mod.StudioCurvePanel }))
);
const StudioDetailPanel = lazy(() =>
  import("./StudioDetailPanel").then((mod) => ({ default: mod.StudioDetailPanel }))
);
const StudioDistortPanel = lazy(() =>
  import("./StudioDistortPanel").then((mod) => ({ default: mod.StudioDistortPanel }))
);
const StudioGlowPanel = lazy(() =>
  import("./StudioGlowPanel").then((mod) => ({ default: mod.StudioGlowPanel }))
);
const StudioGradientMapPanel = lazy(() =>
  import("./StudioGradientMapPanel").then((mod) => ({ default: mod.StudioGradientMapPanel }))
);
const StudioGrainPanel = lazy(() =>
  import("./StudioGrainPanel").then((mod) => ({ default: mod.StudioGrainPanel }))
);
const StudioHalftonePanel = lazy(() =>
  import("./StudioHalftonePanel").then((mod) => ({ default: mod.StudioHalftonePanel }))
);
const StudioImageFilterPanel = lazy(() =>
  import("./StudioImageFilterPanel").then((mod) => ({ default: mod.StudioImageFilterPanel }))
);
const StudioLayerStylePanel = lazy(() =>
  import("./StudioLayerStylePanel").then((mod) => ({ default: mod.StudioLayerStylePanel }))
);
const StudioLevelsPanel = lazy(() =>
  import("./StudioLevelsPanel").then((mod) => ({ default: mod.StudioLevelsPanel }))
);
const StudioLightPanel = lazy(() =>
  import("./StudioLightPanel").then((mod) => ({ default: mod.StudioLightPanel }))
);
const StudioLooksPanel = lazy(() =>
  import("./StudioLooksPanel").then((mod) => ({ default: mod.StudioLooksPanel }))
);
const StudioOutlinePanel = lazy(() =>
  import("./StudioOutlinePanel").then((mod) => ({ default: mod.StudioOutlinePanel }))
);
const StudioPhotoFilterPanel = lazy(() =>
  import("./StudioPhotoFilterPanel").then((mod) => ({ default: mod.StudioPhotoFilterPanel }))
);
const StudioSelectiveHslPanel = lazy(() =>
  import("./StudioSelectiveHslPanel").then((mod) => ({ default: mod.StudioSelectiveHslPanel }))
);
const StudioSketchPanel = lazy(() =>
  import("./StudioSketchPanel").then((mod) => ({ default: mod.StudioSketchPanel }))
);
const StudioStylizePanel = lazy(() =>
  import("./StudioStylizePanel").then((mod) => ({ default: mod.StudioStylizePanel }))
);
const StudioVibrancePanel = lazy(() =>
  import("./StudioVibrancePanel").then((mod) => ({ default: mod.StudioVibrancePanel }))
);

interface StudioImageAdjustmentsPanelProps {
  selected: ImageEl;
  filterClipboard: Partial<ImageFilterFields> | null;
  onSetFilterClipboard: (value: Partial<ImageFilterFields> | null) => void;
  onPatch: (patch: Partial<El>) => void;
}

export function StudioImageAdjustmentsPanel({
  selected,
  filterClipboard,
  onSetFilterClipboard,
  onPatch,
}: StudioImageAdjustmentsPanelProps) {
  return (
    <Suspense
      fallback={
        <div className="mt-3 rounded-lg border border-line bg-card/70 px-3 py-2 text-xs text-fg-3">
          이미지 보정 패널을 여는 중...
        </div>
      }
    >
      <>
      <div className="mt-3 border-t border-line/50 pt-3">
        <StudioLooksPanel
          onApplyLook={(look: StudioLook) => onPatch({ ...looksResetPatch(), ...look.patch } as Partial<El>)}
          onCopy={() => onSetFilterClipboard(extractFilterFields(selected))}
          onPaste={() => {
            if (filterClipboard) onPatch({ ...looksResetPatch(), ...filterClipboard } as Partial<El>);
          }}
          onResetAll={() => onPatch(looksResetPatch() as Partial<El>)}
          canPaste={!!filterClipboard}
        />
      </div>

      <div className="mt-3 border-t border-line/50 pt-3">
        <StudioImageFilterPanel
          values={selected}
          onPatch={(patch) => onPatch(patch as Partial<El>)}
        />
      </div>

      <div className="mt-3 border-t border-line/50 pt-3">
        <StudioLevelsPanel
          value={normalizeLevels({
            blackPoint: selected.levelsBlack,
            whitePoint: selected.levelsWhite,
            gamma: selected.levelsGamma,
            outBlack: selected.levelsOutBlack,
            outWhite: selected.levelsOutWhite,
          })}
          onPatch={(patch) =>
            onPatch({
              ...(patch.blackPoint !== undefined ? { levelsBlack: patch.blackPoint } : {}),
              ...(patch.whitePoint !== undefined ? { levelsWhite: patch.whitePoint } : {}),
              ...(patch.gamma !== undefined ? { levelsGamma: patch.gamma } : {}),
              ...(patch.outBlack !== undefined ? { levelsOutBlack: patch.outBlack } : {}),
              ...(patch.outWhite !== undefined ? { levelsOutWhite: patch.outWhite } : {}),
            } as Partial<El>)
          }
          onApplyPreset={(p: LevelsParams) =>
            onPatch({
              levelsBlack: p.blackPoint,
              levelsWhite: p.whitePoint,
              levelsGamma: p.gamma,
              levelsOutBlack: p.outBlack,
              levelsOutWhite: p.outWhite,
            } as Partial<El>)
          }
          onReset={() =>
            onPatch({
              levelsBlack: undefined,
              levelsWhite: undefined,
              levelsGamma: undefined,
              levelsOutBlack: undefined,
              levelsOutWhite: undefined,
            } as Partial<El>)
          }
        />
      </div>

      <div className="mt-3 border-t border-line/50 pt-3">
        <StudioLayerStylePanel
          values={selected as LayerStylePatch}
          onPatch={(patch) => onPatch(patch as Partial<El>)}
        />
      </div>

      <div className="mt-3 border-t border-line/50 pt-3">
        <StudioCurvePanel
          points={normalizeCurve(selected.curve)}
          onChange={(pts: CurvePoint[]) => onPatch({ curve: pts } as Partial<El>)}
          onReset={() => onPatch({ curve: undefined } as Partial<El>)}
        />
      </div>

      <div className="mt-3 border-t border-line/50 pt-3">
        <StudioColorBalancePanel
          value={normalizeColorBalance(selected.colorBalance)}
          onPatch={(patch: Partial<ColorBalance>) =>
            onPatch({
              colorBalance: normalizeColorBalance({ ...normalizeColorBalance(selected.colorBalance), ...patch }),
            } as Partial<El>)
          }
          onApplyPreset={(balance: ColorBalance) => onPatch({ colorBalance: balance } as Partial<El>)}
          onReset={() => onPatch({ colorBalance: undefined } as Partial<El>)}
        />
      </div>

      <div className="mt-3 border-t border-line/50 pt-3">
        <StudioChannelMixerPanel
          value={normalizeChannelMixer(selected.channelMixer)}
          onPatch={(patch: Partial<ChannelMixer>) =>
            onPatch({
              channelMixer: normalizeChannelMixer({ ...normalizeChannelMixer(selected.channelMixer), ...patch }),
            } as Partial<El>)
          }
          onApplyPreset={(mixer: ChannelMixer) => onPatch({ channelMixer: mixer } as Partial<El>)}
          onReset={() => onPatch({ channelMixer: undefined } as Partial<El>)}
        />
      </div>

      <div className="mt-3 border-t border-line/50 pt-3">
        <StudioSelectiveHslPanel
          value={normalizeSelectiveHsl(selected.selectiveHsl)}
          onPatch={(patch: Partial<SelectiveHsl>) =>
            onPatch({
              selectiveHsl: normalizeSelectiveHsl({ ...normalizeSelectiveHsl(selected.selectiveHsl), ...patch }),
            } as Partial<El>)
          }
          onApplyPreset={(v: SelectiveHsl) => onPatch({ selectiveHsl: v } as Partial<El>)}
          onReset={() => onPatch({ selectiveHsl: undefined } as Partial<El>)}
        />
      </div>

      <div className="mt-3 border-t border-line/50 pt-3">
        <StudioVibrancePanel
          value={normalizeVibrance(selected.vibrance)}
          onPatch={(patch: Partial<Vibrance>) =>
            onPatch({
              vibrance: normalizeVibrance({ ...normalizeVibrance(selected.vibrance), ...patch }),
            } as Partial<El>)
          }
          onApplyPreset={(v: Vibrance) => onPatch({ vibrance: v } as Partial<El>)}
          onReset={() => onPatch({ vibrance: undefined } as Partial<El>)}
        />
      </div>

      <div className="mt-3 border-t border-line/50 pt-3">
        <StudioPhotoFilterPanel
          value={normalizePhotoFilter(selected.photoFilter)}
          onPatch={(patch: Partial<PhotoFilter>) =>
            onPatch({
              photoFilter: normalizePhotoFilter({ ...normalizePhotoFilter(selected.photoFilter), ...patch }),
            } as Partial<El>)
          }
          onApplyPreset={(v: PhotoFilter) => onPatch({ photoFilter: v } as Partial<El>)}
          onReset={() => onPatch({ photoFilter: undefined } as Partial<El>)}
        />
      </div>

      <div className="mt-3 border-t border-line/50 pt-3">
        <StudioGradientMapPanel
          value={normalizeGradientMap(selected.gradientMap)}
          onApplyPreset={(m: GradientMap) => onPatch({ gradientMap: m } as Partial<El>)}
          onEditStopColor={(i: number, color: string) => {
            const cur = normalizeGradientMap(selected.gradientMap);
            const stops = cur.stops.map((s, j) => (j === i ? { ...s, color } : s));
            onPatch({ gradientMap: normalizeGradientMap({ stops }) } as Partial<El>);
          }}
          onReset={() => onPatch({ gradientMap: undefined } as Partial<El>)}
        />
      </div>

      <div className="mt-3 border-t border-line/50 pt-3">
        <StudioAutoAdjustPanel
          value={normalizeAutoAdjust(selected.autoAdjust)}
          onPatch={(patch: Partial<AutoAdjust>) =>
            onPatch({
              autoAdjust: normalizeAutoAdjust({ ...normalizeAutoAdjust(selected.autoAdjust), ...patch }),
            } as Partial<El>)
          }
          onApplyPreset={(v: AutoAdjust) => onPatch({ autoAdjust: v } as Partial<El>)}
          onReset={() => onPatch({ autoAdjust: undefined } as Partial<El>)}
        />
      </div>

      <div className="mt-3 border-t border-line/50 pt-3">
        <StudioClarityPanel
          value={normalizeClarity(selected.clarity)}
          onPatch={(patch: Partial<Clarity>) =>
            onPatch({
              clarity: normalizeClarity({ ...normalizeClarity(selected.clarity), ...patch }),
            } as Partial<El>)
          }
          onApplyPreset={(v: Clarity) => onPatch({ clarity: v } as Partial<El>)}
          onReset={() => onPatch({ clarity: undefined } as Partial<El>)}
        />
      </div>

      <div className="mt-3 border-t border-line/50 pt-3">
        <StudioGlowPanel
          value={normalizeGlow(selected.glow)}
          onPatch={(patch: Partial<Glow>) =>
            onPatch({
              glow: normalizeGlow({ ...normalizeGlow(selected.glow), ...patch }),
            } as Partial<El>)
          }
          onApplyPreset={(v: Glow) => onPatch({ glow: v } as Partial<El>)}
          onReset={() => onPatch({ glow: undefined } as Partial<El>)}
        />
      </div>

      <div className="mt-3 border-t border-line/50 pt-3">
        <StudioOutlinePanel
          value={normalizeOutline(selected.outline)}
          onPatch={(patch: Partial<Outline>) =>
            onPatch({
              outline: normalizeOutline({ ...normalizeOutline(selected.outline), ...patch }),
            } as Partial<El>)
          }
          onApplyPreset={(v: Outline) => onPatch({ outline: v } as Partial<El>)}
          onReset={() => onPatch({ outline: undefined } as Partial<El>)}
        />
      </div>

      <div className="mt-3 border-t border-line/50 pt-3">
        <StudioHalftonePanel
          value={normalizeHalftone(selected.halftone)}
          onPatch={(patch: Partial<Halftone>) =>
            onPatch({
              halftone: normalizeHalftone({ ...normalizeHalftone(selected.halftone), ...patch }),
            } as Partial<El>)
          }
          onApplyPreset={(v: Halftone) => onPatch({ halftone: v } as Partial<El>)}
          onReset={() => onPatch({ halftone: undefined } as Partial<El>)}
        />
      </div>

      <div className="mt-3 border-t border-line/50 pt-3">
        <StudioGrainPanel
          value={normalizeGrain(selected.grain)}
          onPatch={(patch: Partial<Grain>) =>
            onPatch({
              grain: normalizeGrain({ ...normalizeGrain(selected.grain), ...patch }),
            } as Partial<El>)
          }
          onApplyPreset={(v: Grain) => onPatch({ grain: v } as Partial<El>)}
          onReset={() => onPatch({ grain: undefined } as Partial<El>)}
        />
      </div>

      <div className="mt-3 border-t border-line/50 pt-3">
        <StudioBlurPanel
          value={normalizeBlurFx(selected.blurFx)}
          onPatch={(patch: Partial<BlurFx>) =>
            onPatch({
              blurFx: normalizeBlurFx({ ...normalizeBlurFx(selected.blurFx), ...patch }),
            } as Partial<El>)
          }
          onApplyPreset={(v: BlurFx) => onPatch({ blurFx: v } as Partial<El>)}
          onReset={() => onPatch({ blurFx: undefined } as Partial<El>)}
        />
      </div>

      <div className="mt-3 border-t border-line/50 pt-3">
        <StudioDistortPanel
          value={normalizeDistort(selected.distort)}
          onPatch={(patch: Partial<Distort>) =>
            onPatch({
              distort: normalizeDistort({ ...normalizeDistort(selected.distort), ...patch }),
            } as Partial<El>)
          }
          onApplyPreset={(v: Distort) => onPatch({ distort: v } as Partial<El>)}
          onReset={() => onPatch({ distort: undefined } as Partial<El>)}
        />
      </div>

      <div className="mt-3 border-t border-line/50 pt-3">
        <StudioStylizePanel
          value={normalizeStylize(selected.stylize)}
          onPatch={(patch: Partial<Stylize>) =>
            onPatch({
              stylize: normalizeStylize({ ...normalizeStylize(selected.stylize), ...patch }),
            } as Partial<El>)
          }
          onApplyPreset={(v: Stylize) => onPatch({ stylize: v } as Partial<El>)}
          onReset={() => onPatch({ stylize: undefined } as Partial<El>)}
        />
      </div>

      <div className="mt-3 border-t border-line/50 pt-3">
        <StudioLightPanel
          value={normalizeLight(selected.light)}
          onPatch={(patch: Partial<Light>) =>
            onPatch({
              light: normalizeLight({ ...normalizeLight(selected.light), ...patch }),
            } as Partial<El>)
          }
          onApplyPreset={(v: Light) => onPatch({ light: v } as Partial<El>)}
          onReset={() => onPatch({ light: undefined } as Partial<El>)}
        />
      </div>

      <div className="mt-3 border-t border-line/50 pt-3">
        <StudioDetailPanel
          value={normalizeDetail(selected.detail)}
          onPatch={(patch: Partial<Detail>) =>
            onPatch({
              detail: normalizeDetail({ ...normalizeDetail(selected.detail), ...patch }),
            } as Partial<El>)
          }
          onApplyPreset={(v: Detail) => onPatch({ detail: v } as Partial<El>)}
          onReset={() => onPatch({ detail: undefined } as Partial<El>)}
        />
      </div>

      <div className="mt-3 border-t border-line/50 pt-3">
        <StudioSketchPanel
          value={normalizeSketch(selected.sketch)}
          onPatch={(patch: Partial<Sketch>) =>
            onPatch({
              sketch: normalizeSketch({ ...normalizeSketch(selected.sketch), ...patch }),
            } as Partial<El>)
          }
          onApplyPreset={(v: Sketch) => onPatch({ sketch: v } as Partial<El>)}
          onReset={() => onPatch({ sketch: undefined } as Partial<El>)}
        />
      </div>
      </>
    </Suspense>
  );
}
