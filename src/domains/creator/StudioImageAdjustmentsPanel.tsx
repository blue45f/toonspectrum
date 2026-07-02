import { ChevronDown } from "lucide-react";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";

import { isIdentityCurveChannels, normalizeCurve, type CurvePoint, type CurveRgbChannels } from "./studio-curves";
import { type LayerStylePatch } from "./studio-layer-styles";
import {
  isIdentityLevelsChannels,
  normalizeLevels,
  type LevelsParams,
  type LevelsRgbChannels,
} from "./studio-levels";
import { extractFilterFields, looksResetPatch, type StudioLook } from "./studio-looks";

import type { ImageFilterFields } from "./studio-konva-filter-fields";
import type { El, ImageEl } from "./StudioPage";

const StudioCurvePanel = lazy(() =>
  import("./StudioCurvePanel").then((mod) => ({ default: mod.StudioCurvePanel }))
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
const StudioLooksPanel = lazy(() =>
  import("./StudioLooksPanel").then((mod) => ({ default: mod.StudioLooksPanel }))
);

interface StudioImageAdjustmentsPanelProps {
  selected: ImageEl;
  filterClipboard: Partial<ImageFilterFields> | null;
  onSetFilterClipboard: (value: Partial<ImageFilterFields> | null) => void;
  onPatch: (patch: Partial<El>) => void;
}

type DeferredAdjustmentSectionProps = Pick<StudioImageAdjustmentsPanelProps, "selected" | "onPatch">;

const StudioColorBalanceSection = lazy(async () => {
  const [panelMod, colorBalance] = await Promise.all([
    import("./StudioColorBalancePanel"),
    import("./studio-color-balance"),
  ]);
  const Panel = panelMod.StudioColorBalancePanel;
  function StudioColorBalanceSection({ selected, onPatch }: DeferredAdjustmentSectionProps) {
    const value = colorBalance.normalizeColorBalance(selected.colorBalance);
    return (
      <Panel
        value={value}
        onPatch={(patch) =>
          onPatch({
            colorBalance: colorBalance.normalizeColorBalance({ ...value, ...patch }),
          } as Partial<El>)
        }
        onApplyPreset={(balance) => onPatch({ colorBalance: balance } as Partial<El>)}
        onReset={() => onPatch({ colorBalance: undefined } as Partial<El>)}
      />
    );
  }
  return { default: StudioColorBalanceSection };
});

const StudioChannelMixerSection = lazy(async () => {
  const [panelMod, channelMixer] = await Promise.all([
    import("./StudioChannelMixerPanel"),
    import("./studio-channel-mixer"),
  ]);
  const Panel = panelMod.StudioChannelMixerPanel;
  function StudioChannelMixerSection({ selected, onPatch }: DeferredAdjustmentSectionProps) {
    const value = channelMixer.normalizeChannelMixer(selected.channelMixer);
    return (
      <Panel
        value={value}
        onPatch={(patch) =>
          onPatch({
            channelMixer: channelMixer.normalizeChannelMixer({ ...value, ...patch }),
          } as Partial<El>)
        }
        onApplyPreset={(mixer) => onPatch({ channelMixer: mixer } as Partial<El>)}
        onReset={() => onPatch({ channelMixer: undefined } as Partial<El>)}
      />
    );
  }
  return { default: StudioChannelMixerSection };
});

const StudioSelectiveHslSection = lazy(async () => {
  const [panelMod, selectiveHsl] = await Promise.all([
    import("./StudioSelectiveHslPanel"),
    import("./studio-selective-hsl"),
  ]);
  const Panel = panelMod.StudioSelectiveHslPanel;
  function StudioSelectiveHslSection({ selected, onPatch }: DeferredAdjustmentSectionProps) {
    const value = selectiveHsl.normalizeSelectiveHsl(selected.selectiveHsl);
    return (
      <Panel
        value={value}
        onPatch={(patch) =>
          onPatch({
            selectiveHsl: selectiveHsl.normalizeSelectiveHsl({ ...value, ...patch }),
          } as Partial<El>)
        }
        onApplyPreset={(v) => onPatch({ selectiveHsl: v } as Partial<El>)}
        onReset={() => onPatch({ selectiveHsl: undefined } as Partial<El>)}
      />
    );
  }
  return { default: StudioSelectiveHslSection };
});

const StudioVibranceSection = lazy(async () => {
  const [panelMod, vibrance] = await Promise.all([
    import("./StudioVibrancePanel"),
    import("./studio-vibrance"),
  ]);
  const Panel = panelMod.StudioVibrancePanel;
  function StudioVibranceSection({ selected, onPatch }: DeferredAdjustmentSectionProps) {
    const value = vibrance.normalizeVibrance(selected.vibrance);
    return (
      <Panel
        value={value}
        onPatch={(patch) =>
          onPatch({
            vibrance: vibrance.normalizeVibrance({ ...value, ...patch }),
          } as Partial<El>)
        }
        onApplyPreset={(v) => onPatch({ vibrance: v } as Partial<El>)}
        onReset={() => onPatch({ vibrance: undefined } as Partial<El>)}
      />
    );
  }
  return { default: StudioVibranceSection };
});

const StudioPhotoFilterSection = lazy(async () => {
  const [panelMod, photoFilter] = await Promise.all([
    import("./StudioPhotoFilterPanel"),
    import("./studio-photo-filter"),
  ]);
  const Panel = panelMod.StudioPhotoFilterPanel;
  function StudioPhotoFilterSection({ selected, onPatch }: DeferredAdjustmentSectionProps) {
    const value = photoFilter.normalizePhotoFilter(selected.photoFilter);
    return (
      <Panel
        value={value}
        onPatch={(patch) =>
          onPatch({
            photoFilter: photoFilter.normalizePhotoFilter({ ...value, ...patch }),
          } as Partial<El>)
        }
        onApplyPreset={(v) => onPatch({ photoFilter: v } as Partial<El>)}
        onReset={() => onPatch({ photoFilter: undefined } as Partial<El>)}
      />
    );
  }
  return { default: StudioPhotoFilterSection };
});

const StudioGradientMapSection = lazy(async () => {
  const [panelMod, gradientMap] = await Promise.all([
    import("./StudioGradientMapPanel"),
    import("./studio-gradient-map"),
  ]);
  const Panel = panelMod.StudioGradientMapPanel;
  function StudioGradientMapSection({ selected, onPatch }: DeferredAdjustmentSectionProps) {
    const value = gradientMap.normalizeGradientMap(selected.gradientMap);
    return (
      <Panel
        value={value}
        onApplyPreset={(m) => onPatch({ gradientMap: m } as Partial<El>)}
        onEditStopColor={(i, color) => {
          const stops = value.stops.map((stop, index) => (index === i ? { ...stop, color } : stop));
          onPatch({ gradientMap: gradientMap.normalizeGradientMap({ stops }) } as Partial<El>);
        }}
        onReset={() => onPatch({ gradientMap: undefined } as Partial<El>)}
      />
    );
  }
  return { default: StudioGradientMapSection };
});

const StudioAutoAdjustSection = lazy(async () => {
  const [panelMod, autoAdjust] = await Promise.all([
    import("./StudioAutoAdjustPanel"),
    import("./studio-auto-adjust"),
  ]);
  const Panel = panelMod.StudioAutoAdjustPanel;
  function StudioAutoAdjustSection({ selected, onPatch }: DeferredAdjustmentSectionProps) {
    const value = autoAdjust.normalizeAutoAdjust(selected.autoAdjust);
    return (
      <Panel
        value={value}
        onPatch={(patch) =>
          onPatch({
            autoAdjust: autoAdjust.normalizeAutoAdjust({ ...value, ...patch }),
          } as Partial<El>)
        }
        onApplyPreset={(v) => onPatch({ autoAdjust: v } as Partial<El>)}
        onReset={() => onPatch({ autoAdjust: undefined } as Partial<El>)}
      />
    );
  }
  return { default: StudioAutoAdjustSection };
});

const StudioClaritySection = lazy(async () => {
  const [panelMod, clarity] = await Promise.all([
    import("./StudioClarityPanel"),
    import("./studio-clarity"),
  ]);
  const Panel = panelMod.StudioClarityPanel;
  function StudioClaritySection({ selected, onPatch }: DeferredAdjustmentSectionProps) {
    const value = clarity.normalizeClarity(selected.clarity);
    return (
      <Panel
        value={value}
        onPatch={(patch) =>
          onPatch({
            clarity: clarity.normalizeClarity({ ...value, ...patch }),
          } as Partial<El>)
        }
        onApplyPreset={(v) => onPatch({ clarity: v } as Partial<El>)}
        onReset={() => onPatch({ clarity: undefined } as Partial<El>)}
      />
    );
  }
  return { default: StudioClaritySection };
});

const StudioGlowSection = lazy(async () => {
  const [panelMod, glow] = await Promise.all([
    import("./StudioGlowPanel"),
    import("./studio-glow"),
  ]);
  const Panel = panelMod.StudioGlowPanel;
  function StudioGlowSection({ selected, onPatch }: DeferredAdjustmentSectionProps) {
    const value = glow.normalizeGlow(selected.glow);
    return (
      <Panel
        value={value}
        onPatch={(patch) =>
          onPatch({
            glow: glow.normalizeGlow({ ...value, ...patch }),
          } as Partial<El>)
        }
        onApplyPreset={(v) => onPatch({ glow: v } as Partial<El>)}
        onReset={() => onPatch({ glow: undefined } as Partial<El>)}
      />
    );
  }
  return { default: StudioGlowSection };
});

const StudioOutlineSection = lazy(async () => {
  const [panelMod, outline] = await Promise.all([
    import("./StudioOutlinePanel"),
    import("./studio-outline"),
  ]);
  const Panel = panelMod.StudioOutlinePanel;
  function StudioOutlineSection({ selected, onPatch }: DeferredAdjustmentSectionProps) {
    const value = outline.normalizeOutline(selected.outline);
    return (
      <Panel
        value={value}
        onPatch={(patch) =>
          onPatch({
            outline: outline.normalizeOutline({ ...value, ...patch }),
          } as Partial<El>)
        }
        onApplyPreset={(v) => onPatch({ outline: v } as Partial<El>)}
        onReset={() => onPatch({ outline: undefined } as Partial<El>)}
      />
    );
  }
  return { default: StudioOutlineSection };
});

const StudioHalftoneSection = lazy(async () => {
  const [panelMod, halftone] = await Promise.all([
    import("./StudioHalftonePanel"),
    import("./studio-halftone"),
  ]);
  const Panel = panelMod.StudioHalftonePanel;
  function StudioHalftoneSection({ selected, onPatch }: DeferredAdjustmentSectionProps) {
    const value = halftone.normalizeHalftone(selected.halftone);
    return (
      <Panel
        value={value}
        onPatch={(patch) =>
          onPatch({
            halftone: halftone.normalizeHalftone({ ...value, ...patch }),
          } as Partial<El>)
        }
        onApplyPreset={(v) => onPatch({ halftone: v } as Partial<El>)}
        onReset={() => onPatch({ halftone: undefined } as Partial<El>)}
      />
    );
  }
  return { default: StudioHalftoneSection };
});

const StudioGrainSection = lazy(async () => {
  const [panelMod, grain] = await Promise.all([
    import("./StudioGrainPanel"),
    import("./studio-grain"),
  ]);
  const Panel = panelMod.StudioGrainPanel;
  function StudioGrainSection({ selected, onPatch }: DeferredAdjustmentSectionProps) {
    const value = grain.normalizeGrain(selected.grain);
    return (
      <Panel
        value={value}
        onPatch={(patch) =>
          onPatch({
            grain: grain.normalizeGrain({ ...value, ...patch }),
          } as Partial<El>)
        }
        onApplyPreset={(v) => onPatch({ grain: v } as Partial<El>)}
        onReset={() => onPatch({ grain: undefined } as Partial<El>)}
      />
    );
  }
  return { default: StudioGrainSection };
});

const StudioBlurSection = lazy(async () => {
  const [panelMod, blur] = await Promise.all([
    import("./StudioBlurPanel"),
    import("./studio-blur"),
  ]);
  const Panel = panelMod.StudioBlurPanel;
  function StudioBlurSection({ selected, onPatch }: DeferredAdjustmentSectionProps) {
    const value = blur.normalizeBlurFx(selected.blurFx);
    return (
      <Panel
        value={value}
        onPatch={(patch) =>
          onPatch({
            blurFx: blur.normalizeBlurFx({ ...value, ...patch }),
          } as Partial<El>)
        }
        onApplyPreset={(v) => onPatch({ blurFx: v } as Partial<El>)}
        onReset={() => onPatch({ blurFx: undefined } as Partial<El>)}
      />
    );
  }
  return { default: StudioBlurSection };
});

const StudioDistortSection = lazy(async () => {
  const [panelMod, distort] = await Promise.all([
    import("./StudioDistortPanel"),
    import("./studio-distort"),
  ]);
  const Panel = panelMod.StudioDistortPanel;
  function StudioDistortSection({ selected, onPatch }: DeferredAdjustmentSectionProps) {
    const value = distort.normalizeDistort(selected.distort);
    return (
      <Panel
        value={value}
        onPatch={(patch) =>
          onPatch({
            distort: distort.normalizeDistort({ ...value, ...patch }),
          } as Partial<El>)
        }
        onApplyPreset={(v) => onPatch({ distort: v } as Partial<El>)}
        onReset={() => onPatch({ distort: undefined } as Partial<El>)}
      />
    );
  }
  return { default: StudioDistortSection };
});

const StudioStylizeSection = lazy(async () => {
  const [panelMod, stylize] = await Promise.all([
    import("./StudioStylizePanel"),
    import("./studio-stylize"),
  ]);
  const Panel = panelMod.StudioStylizePanel;
  function StudioStylizeSection({ selected, onPatch }: DeferredAdjustmentSectionProps) {
    const value = stylize.normalizeStylize(selected.stylize);
    return (
      <Panel
        value={value}
        onPatch={(patch) =>
          onPatch({
            stylize: stylize.normalizeStylize({ ...value, ...patch }),
          } as Partial<El>)
        }
        onApplyPreset={(v) => onPatch({ stylize: v } as Partial<El>)}
        onReset={() => onPatch({ stylize: undefined } as Partial<El>)}
      />
    );
  }
  return { default: StudioStylizeSection };
});

const StudioLightSection = lazy(async () => {
  const [panelMod, light] = await Promise.all([
    import("./StudioLightPanel"),
    import("./studio-light"),
  ]);
  const Panel = panelMod.StudioLightPanel;
  function StudioLightSection({ selected, onPatch }: DeferredAdjustmentSectionProps) {
    const value = light.normalizeLight(selected.light);
    return (
      <Panel
        value={value}
        onPatch={(patch) =>
          onPatch({
            light: light.normalizeLight({ ...value, ...patch }),
          } as Partial<El>)
        }
        onApplyPreset={(v) => onPatch({ light: v } as Partial<El>)}
        onReset={() => onPatch({ light: undefined } as Partial<El>)}
      />
    );
  }
  return { default: StudioLightSection };
});

const StudioDetailSection = lazy(async () => {
  const [panelMod, detail] = await Promise.all([
    import("./StudioDetailPanel"),
    import("./studio-detail"),
  ]);
  const Panel = panelMod.StudioDetailPanel;
  function StudioDetailSection({ selected, onPatch }: DeferredAdjustmentSectionProps) {
    const value = detail.normalizeDetail(selected.detail);
    return (
      <Panel
        value={value}
        onPatch={(patch) =>
          onPatch({
            detail: detail.normalizeDetail({ ...value, ...patch }),
          } as Partial<El>)
        }
        onApplyPreset={(v) => onPatch({ detail: v } as Partial<El>)}
        onReset={() => onPatch({ detail: undefined } as Partial<El>)}
      />
    );
  }
  return { default: StudioDetailSection };
});

const StudioSketchSection = lazy(async () => {
  const [panelMod, sketch] = await Promise.all([
    import("./StudioSketchPanel"),
    import("./studio-sketch"),
  ]);
  const Panel = panelMod.StudioSketchPanel;
  function StudioSketchSection({ selected, onPatch }: DeferredAdjustmentSectionProps) {
    const value = sketch.normalizeSketch(selected.sketch);
    return (
      <Panel
        value={value}
        onPatch={(patch) =>
          onPatch({
            sketch: sketch.normalizeSketch({ ...value, ...patch }),
          } as Partial<El>)
        }
        onApplyPreset={(v) => onPatch({ sketch: v } as Partial<El>)}
        onReset={() => onPatch({ sketch: undefined } as Partial<El>)}
      />
    );
  }
  return { default: StudioSketchSection };
});

function hasAdjustmentValue(value: unknown) {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function AdjustmentSection({
  title,
  defaultOpen = false,
  forceOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen || forceOpen);

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  return (
    <section className="mt-3 border-t border-line/50 pt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 rounded-lg px-1.5 py-1 text-left text-xs font-semibold text-fg transition-colors hover:bg-raised/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span>{title}</span>
        <ChevronDown
          size={14}
          aria-hidden
          className={open ? "shrink-0 rotate-180 transition-transform" : "shrink-0 transition-transform"}
        />
      </button>
      {open ? (
        <Suspense
          fallback={
            <div className="mt-2 rounded-lg border border-line bg-card/70 px-3 py-2 text-xs text-fg-3">
              {title} 패널을 여는 중...
            </div>
          }
        >
          <div className="mt-2">{children}</div>
        </Suspense>
      ) : null}
    </section>
  );
}

export function StudioImageAdjustmentsPanel({
  selected,
  filterClipboard,
  onSetFilterClipboard,
  onPatch,
}: StudioImageAdjustmentsPanelProps) {
  // 채널(r/g/b) 곡선·레벨 필드(curveCh/levelsCh) — ImageEl 타입 선언에는 아직 없어
  // ImageFilterFields로 읽는다(런타임은 같은 요소 객체라 patchEl 스프레드로 그대로 왕복된다).
  const filterFields: ImageFilterFields = selected;
  return (
    <>
      <AdjustmentSection title="룩 프리셋" defaultOpen>
        <StudioLooksPanel
          onApplyLook={(look: StudioLook) => onPatch({ ...looksResetPatch(), ...look.patch } as Partial<El>)}
          onCopy={() => onSetFilterClipboard(extractFilterFields(selected))}
          onPaste={() => {
            if (filterClipboard) onPatch({ ...looksResetPatch(), ...filterClipboard } as Partial<El>);
          }}
          onResetAll={() => onPatch(looksResetPatch() as Partial<El>)}
          canPaste={!!filterClipboard}
        />
      </AdjustmentSection>

      <AdjustmentSection title="기본 필터" defaultOpen>
        <StudioImageFilterPanel
          values={selected}
          onPatch={(patch) => onPatch(patch as Partial<El>)}
        />
      </AdjustmentSection>

      <AdjustmentSection title="레벨" defaultOpen>
        <StudioLevelsPanel
          value={normalizeLevels({
            blackPoint: selected.levelsBlack,
            whitePoint: selected.levelsWhite,
            gamma: selected.levelsGamma,
            outBlack: selected.levelsOutBlack,
            outWhite: selected.levelsOutWhite,
          })}
          channels={filterFields.levelsCh}
          onPatch={(patch) =>
            onPatch({
              ...(patch.blackPoint !== undefined ? { levelsBlack: patch.blackPoint } : {}),
              ...(patch.whitePoint !== undefined ? { levelsWhite: patch.whitePoint } : {}),
              ...(patch.gamma !== undefined ? { levelsGamma: patch.gamma } : {}),
              ...(patch.outBlack !== undefined ? { levelsOutBlack: patch.outBlack } : {}),
              ...(patch.outWhite !== undefined ? { levelsOutWhite: patch.outWhite } : {}),
            } as Partial<El>)
          }
          onChannelsChange={(ch: LevelsRgbChannels) => {
            // 전 채널이 항등이면 필드 자체를 비워 저장본을 깨끗하게 유지한다(없음=항등 하위호환).
            const patch: Partial<ImageFilterFields> = {
              levelsCh: isIdentityLevelsChannels(ch) ? undefined : ch,
            };
            onPatch(patch as Partial<El>);
          }}
          onApplyPreset={(p: LevelsParams) =>
            onPatch({
              levelsBlack: p.blackPoint,
              levelsWhite: p.whitePoint,
              levelsGamma: p.gamma,
              levelsOutBlack: p.outBlack,
              levelsOutWhite: p.outWhite,
            } as Partial<El>)
          }
          onReset={() => {
            const patch: Partial<ImageFilterFields> = {
              levelsBlack: undefined,
              levelsWhite: undefined,
              levelsGamma: undefined,
              levelsOutBlack: undefined,
              levelsOutWhite: undefined,
              levelsCh: undefined,
            };
            onPatch(patch as Partial<El>);
          }}
        />
      </AdjustmentSection>

      <AdjustmentSection title="레이어 스타일" defaultOpen>
        <StudioLayerStylePanel
          values={selected as LayerStylePatch}
          onPatch={(patch) => onPatch(patch as Partial<El>)}
        />
      </AdjustmentSection>

      <AdjustmentSection
        title="톤 커브"
        defaultOpen={hasAdjustmentValue(selected.curve) || hasAdjustmentValue(filterFields.curveCh)}
      >
        <StudioCurvePanel
          points={normalizeCurve(selected.curve)}
          channels={filterFields.curveCh}
          onChange={(pts: CurvePoint[]) => onPatch({ curve: pts } as Partial<El>)}
          onChannelsChange={(ch: CurveRgbChannels) => {
            // 전 채널이 항등이면 필드 자체를 비워 저장본을 깨끗하게 유지한다(없음=항등 하위호환).
            const patch: Partial<ImageFilterFields> = {
              curveCh: isIdentityCurveChannels(ch) ? undefined : ch,
            };
            onPatch(patch as Partial<El>);
          }}
          onReset={() => {
            const patch: Partial<ImageFilterFields> = { curve: undefined, curveCh: undefined };
            onPatch(patch as Partial<El>);
          }}
        />
      </AdjustmentSection>

      <AdjustmentSection title="컬러 밸런스" forceOpen={hasAdjustmentValue(selected.colorBalance)}>
        <StudioColorBalanceSection selected={selected} onPatch={onPatch} />
      </AdjustmentSection>

      <AdjustmentSection title="채널 믹서" forceOpen={hasAdjustmentValue(selected.channelMixer)}>
        <StudioChannelMixerSection selected={selected} onPatch={onPatch} />
      </AdjustmentSection>

      <AdjustmentSection title="선택 색상" forceOpen={hasAdjustmentValue(selected.selectiveHsl)}>
        <StudioSelectiveHslSection selected={selected} onPatch={onPatch} />
      </AdjustmentSection>

      <AdjustmentSection title="생동감" forceOpen={hasAdjustmentValue(selected.vibrance)}>
        <StudioVibranceSection selected={selected} onPatch={onPatch} />
      </AdjustmentSection>

      <AdjustmentSection title="포토 필터" forceOpen={hasAdjustmentValue(selected.photoFilter)}>
        <StudioPhotoFilterSection selected={selected} onPatch={onPatch} />
      </AdjustmentSection>

      <AdjustmentSection title="그라디언트 맵" forceOpen={hasAdjustmentValue(selected.gradientMap)}>
        <StudioGradientMapSection selected={selected} onPatch={onPatch} />
      </AdjustmentSection>

      <AdjustmentSection title="자동 보정" forceOpen={hasAdjustmentValue(selected.autoAdjust)}>
        <StudioAutoAdjustSection selected={selected} onPatch={onPatch} />
      </AdjustmentSection>

      <AdjustmentSection title="명료도" forceOpen={hasAdjustmentValue(selected.clarity)}>
        <StudioClaritySection selected={selected} onPatch={onPatch} />
      </AdjustmentSection>

      <AdjustmentSection title="글로우" forceOpen={hasAdjustmentValue(selected.glow)}>
        <StudioGlowSection selected={selected} onPatch={onPatch} />
      </AdjustmentSection>

      <AdjustmentSection title="외곽선" forceOpen={hasAdjustmentValue(selected.outline)}>
        <StudioOutlineSection selected={selected} onPatch={onPatch} />
      </AdjustmentSection>

      <AdjustmentSection title="하프톤" forceOpen={hasAdjustmentValue(selected.halftone)}>
        <StudioHalftoneSection selected={selected} onPatch={onPatch} />
      </AdjustmentSection>

      <AdjustmentSection title="그레인" forceOpen={hasAdjustmentValue(selected.grain)}>
        <StudioGrainSection selected={selected} onPatch={onPatch} />
      </AdjustmentSection>

      <AdjustmentSection title="블러 FX" forceOpen={hasAdjustmentValue(selected.blurFx)}>
        <StudioBlurSection selected={selected} onPatch={onPatch} />
      </AdjustmentSection>

      <AdjustmentSection title="왜곡" forceOpen={hasAdjustmentValue(selected.distort)}>
        <StudioDistortSection selected={selected} onPatch={onPatch} />
      </AdjustmentSection>

      <AdjustmentSection title="스타일라이즈" forceOpen={hasAdjustmentValue(selected.stylize)}>
        <StudioStylizeSection selected={selected} onPatch={onPatch} />
      </AdjustmentSection>

      <AdjustmentSection title="조명" forceOpen={hasAdjustmentValue(selected.light)}>
        <StudioLightSection selected={selected} onPatch={onPatch} />
      </AdjustmentSection>

      <AdjustmentSection title="디테일" forceOpen={hasAdjustmentValue(selected.detail)}>
        <StudioDetailSection selected={selected} onPatch={onPatch} />
      </AdjustmentSection>

      <AdjustmentSection title="스케치" forceOpen={hasAdjustmentValue(selected.sketch)}>
        <StudioSketchSection selected={selected} onPatch={onPatch} />
      </AdjustmentSection>
    </>
  );
}
