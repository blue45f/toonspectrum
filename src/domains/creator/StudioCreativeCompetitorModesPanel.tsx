/**
 * Competitive creative modes panel — pixel art, sticky notes, silk flow,
 * ephemeral whiteboard. Presentation only; hosts apply pure admission helpers.
 */

import { useState } from "react";

import {
  enableStudioPixelArtMode,
  studioPixelArtModeHudLabel,
  studioPixelArtModeTutorialSteps,
  type StudioPixelArtModeState,
} from "./studio-pixel-art-mode";
import {
  STUDIO_LOSPEC_STYLE_PRESETS,
  type StudioRestrictedPalette,
} from "./studio-restricted-palette";
import {
  DEFAULT_STUDIO_SILK_GENERATIVE_SPEC,
  studioSilkVariationCount,
  type StudioSilkGenerativeSpec,
} from "./studio-silk-generative";
import {
  createStudioStickyNoteElement,
  STUDIO_STICKY_NOTE_PRESETS,
  type StudioStickyNotePresetId,
} from "./studio-sticky-note";
import {
  createStudioWhiteboardEphemeralSession,
  studioWhiteboardEphemeralHudLabel,
  studioWhiteboardEphemeralSharePath,
  type StudioWhiteboardEphemeralSession,
} from "./studio-whiteboard-ephemeral";

export interface StudioCreativeCompetitorModesPanelProps {
  readonly pixelArtMode: StudioPixelArtModeState;
  readonly onPixelArtModeChange: (mode: StudioPixelArtModeState) => void;
  readonly silkSpec: StudioSilkGenerativeSpec;
  readonly onSilkSpecChange: (spec: StudioSilkGenerativeSpec) => void;
  readonly onAddStickyNote: (presetId: StudioStickyNotePresetId) => void;
  readonly onOpenSculpt?: () => void;
  readonly onStartEphemeralBoard?: (session: StudioWhiteboardEphemeralSession) => void;
}

export function StudioCreativeCompetitorModesPanel({
  pixelArtMode,
  onPixelArtModeChange,
  silkSpec,
  onSilkSpecChange,
  onAddStickyNote,
  onOpenSculpt,
  onStartEphemeralBoard,
}: StudioCreativeCompetitorModesPanelProps) {
  const [board, setBoard] = useState<StudioWhiteboardEphemeralSession | null>(null);

  return (
    <section
      className="space-y-4 rounded-xl border border-line bg-panel p-3"
      aria-label="크리에이티브 모드"
    >
      <header className="space-y-1">
        <h3 className="text-sm font-bold text-fg">크리에이티브 모드</h3>
        <p className="text-[0.68rem] leading-relaxed text-fg-3">
          픽셀 아트·스티키 보드·실크 생성형·휘발 화이트보드·3D 스컬프를 한곳에서 켭니다.
        </p>
      </header>

      <div className="space-y-2 rounded-lg border border-line/80 bg-card/60 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[0.72rem] font-bold text-fg">픽셀 아트</p>
            <p className="text-[0.62rem] text-fg-3">{studioPixelArtModeHudLabel(pixelArtMode)}</p>
          </div>
          <button
            type="button"
            className="min-h-9 rounded-lg border border-line bg-raised px-2.5 text-[0.68rem] font-bold text-fg hover:bg-accent-soft hover:text-accent"
            onClick={() =>
              onPixelArtModeChange(
                pixelArtMode.enabled
                  ? { ...pixelArtMode, enabled: false }
                  : enableStudioPixelArtMode(pixelArtMode.palette?.id ?? "lospec-pico8"),
              )
            }
          >
            {pixelArtMode.enabled ? "끄기" : "켜기"}
          </button>
        </div>
        <label className="block text-[0.62rem] font-semibold text-fg-2">
          제한 팔레트
          <select
            className="mt-1 min-h-9 w-full rounded-md border border-line bg-panel px-2 text-[0.68rem]"
            value={pixelArtMode.palette?.id ?? ""}
            onChange={(event) => {
              const preset = STUDIO_LOSPEC_STYLE_PRESETS.find(
                (entry) => entry.id === event.target.value,
              ) as StudioRestrictedPalette | undefined;
              onPixelArtModeChange({
                ...pixelArtMode,
                enabled: true,
                palette: preset ?? pixelArtMode.palette,
                paletteLockEnabled: true,
              });
            }}
          >
            {STUDIO_LOSPEC_STYLE_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name} ({preset.colors.length}색)
              </option>
            ))}
          </select>
        </label>
        <ul className="list-disc space-y-0.5 pl-4 text-[0.6rem] text-fg-3">
          {studioPixelArtModeTutorialSteps().slice(0, 2).map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      </div>

      <div className="space-y-2 rounded-lg border border-line/80 bg-card/60 p-2.5">
        <p className="text-[0.72rem] font-bold text-fg">스티키 노트</p>
        <div className="flex flex-wrap gap-1.5">
          {STUDIO_STICKY_NOTE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="min-h-9 min-w-9 rounded-md border border-line px-2 text-[0.62rem] font-bold shadow-sm"
              style={{ background: preset.fill, color: preset.ink }}
              onClick={() => onAddStickyNote(preset.id)}
              title={`${preset.label} 스티키 추가`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-line/80 bg-card/60 p-2.5">
        <p className="text-[0.72rem] font-bold text-fg">실크 플로우</p>
        <p className="text-[0.6rem] text-fg-3">
          팔 {silkSpec.arms} · 미러 {silkSpec.mirror ? "ON" : "OFF"} · 변형{" "}
          {studioSilkVariationCount(silkSpec)}개
        </p>
        <label className="flex items-center justify-between gap-2 text-[0.62rem] font-semibold text-fg-2">
          팔 수
          <input
            type="range"
            min={2}
            max={16}
            value={silkSpec.arms}
            onChange={(event) =>
              onSilkSpecChange({
                ...silkSpec,
                arms: Number(event.target.value),
              })
            }
            className="studio-range w-28"
            aria-valuetext={`${silkSpec.arms} arms`}
          />
        </label>
        <button
          type="button"
          className="min-h-9 w-full rounded-lg border border-line bg-raised text-[0.68rem] font-bold hover:bg-accent-soft"
          onClick={() =>
            onSilkSpecChange({
              ...DEFAULT_STUDIO_SILK_GENERATIVE_SPEC,
              arms: silkSpec.arms,
              mirror: !silkSpec.mirror,
            })
          }
        >
          미러 {silkSpec.mirror ? "끄기" : "켜기"}
        </button>
      </div>

      <div className="space-y-2 rounded-lg border border-line/80 bg-card/60 p-2.5">
        <p className="text-[0.72rem] font-bold text-fg">빠른 휘발 보드</p>
        <button
          type="button"
          className="min-h-9 w-full rounded-lg border border-accent/40 bg-accent text-[0.68rem] font-bold text-on-accent"
          onClick={() => {
            const session = createStudioWhiteboardEphemeralSession({
              title: "빠른 화이트보드",
            });
            setBoard(session);
            onStartEphemeralBoard?.(session);
          }}
        >
          보드 만들기
        </button>
        {board ? (
          <p className="break-all text-[0.6rem] text-fg-3">
            {studioWhiteboardEphemeralHudLabel(board)}
            <br />
            {studioWhiteboardEphemeralSharePath(board)}
          </p>
        ) : null}
      </div>

      {onOpenSculpt ? (
        <button
          type="button"
          className="min-h-10 w-full rounded-lg border border-line bg-raised text-[0.7rem] font-bold hover:bg-accent-soft"
          onClick={onOpenSculpt}
        >
          3D 스컬프 열기 (Hybrid DCC)
        </button>
      ) : null}

      {/* Keep factory referenced for tree-shaking clarity in tests */}
      <span className="sr-only">
        {createStudioStickyNoteElement({ x: 0, y: 0 }).type}
      </span>
    </section>
  );
}
