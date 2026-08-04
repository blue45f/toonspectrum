import { Droplets, Eraser, LockKeyhole, Paintbrush, Waves } from "lucide-react";

import { DEFAULT_STUDIO_LIVING_INK_MATERIAL_CONTROLS } from "./studio-living-ink-gpu-protocol";
import { STUDIO_EASE, STUDIO_FOCUS_RING } from "./studio-panel-ui";
import { studioToolHintFromLabel } from "./studio-tool-hints";
import { StudioToolHintTarget } from "./StudioToolHint";

import type { StudioLivingInkMaterialControls } from "./studio-living-ink-gpu-protocol";
import type {
  StudioLivingInkStrokeMode,
  StudioLivingInkStudioState,
} from "./studio-living-ink-studio-coordinator";

import { cn } from "@/lib/utils";

export interface StudioLivingInkControlsProps {
  readonly supported: boolean;
  readonly state: StudioLivingInkStudioState;
  readonly mode: StudioLivingInkStrokeMode;
  readonly onModeChange: (mode: StudioLivingInkStrokeMode) => void;
  readonly scope: "all" | "selection";
  readonly onScopeChange: (scope: "all" | "selection") => void;
  readonly selectionAvailable: boolean;
  readonly busy: boolean;
  readonly fixAvailable: boolean;
  readonly fixUnavailableReason?: string;
  readonly onFix: () => void;
  readonly onClear: () => void;
  readonly material: StudioLivingInkMaterialControls;
  readonly materialLocked: boolean;
  readonly materialLockedReason?: string;
  readonly onMaterialChange: (patch: Partial<StudioLivingInkMaterialControls>) => void;
}

const buttonClass = cn(
  "grid size-8 shrink-0 place-items-center rounded-lg border pointer-coarse:size-11",
  STUDIO_EASE,
  STUDIO_FOCUS_RING,
);

function stateLabel(state: StudioLivingInkStudioState): string {
  if (state === "ready") return "물리 필드 준비됨";
  if (state === "loading") return "물리 필드 복원 중";
  if (state === "failed") return "물리 필드 복원 실패 · 일반 수채로 안전 전환";
  return "이 기기에서는 일반 수채로 안전 전환";
}

export function StudioLivingInkControls({
  supported,
  state,
  mode,
  onModeChange,
  scope,
  onScopeChange,
  selectionAvailable,
  busy,
  fixAvailable,
  fixUnavailableReason = "정착층 저장·재열기 패리티 검증이 끝날 때까지 안전하게 비활성화됩니다.",
  onFix,
  onClear,
  material,
  materialLocked,
  materialLockedReason = "기존 물리 레이어의 재질을 바꾸면 과거 획의 결과도 달라집니다. 현재 레이어를 지운 뒤 새 재질로 시작해 주세요.",
  onMaterialChange,
}: StudioLivingInkControlsProps) {
  if (!supported) return null;
  const ready = state === "ready" && !busy;
  const selectionScopeDisabled = !selectionAvailable;
  return (
    <div
      data-studio-living-ink-controls="true"
      data-studio-living-ink-state={state}
      className="flex shrink-0 items-center gap-1 rounded-xl border border-cyan-400/25 bg-cyan-500/5 px-1 py-0.5"
    >
      <div
        role="group"
        aria-label="Living Ink 도구"
        className="flex items-center rounded-lg bg-canvas/70 p-0.5"
      >
        {([
          ["ink", "잉크", Paintbrush],
          ["water", "물", Waves],
        ] as const).map(([id, label, Icon]) => (
          <StudioToolHintTarget
            key={id}
            hint={studioToolHintFromLabel(
              `Living Ink · ${label}`,
              id === "ink"
                ? "선택한 수채·수묵 브러시로 이동 가능한 안료와 물을 함께 놓습니다. 필압과 속도가 농도·번짐에 반영돼요."
                : "마른 픽셀을 흐리게 지우지 않고, 아직 정착되지 않은 안료에 물과 흐름을 주입해 다시 번지게 합니다.",
              undefined,
              "ink",
            )}
          >
            <button
              type="button"
              disabled={!ready}
              aria-pressed={mode === id}
              aria-label={`Living Ink ${label}`}
              onClick={() => onModeChange(id)}
              className={cn(
                buttonClass,
                mode === id
                  ? "border-cyan-400/65 bg-cyan-400/16 text-cyan-200"
                  : "border-transparent text-fg-3 hover:bg-raised hover:text-fg",
                !ready && "cursor-not-allowed opacity-45",
              )}
            >
              <Icon size={15} aria-hidden />
            </button>
          </StudioToolHintTarget>
        ))}
      </div>

      <StudioToolHintTarget
        hint={studioToolHintFromLabel(
          "Living Ink 처리 범위",
          selectionAvailable
            ? "전체 물리 레이어 또는 현재 픽셀 선택만 정착·지우기 대상으로 고정합니다. 실행을 누르는 순간 선택 마스크가 복사돼요."
            : "현재 Living Ink 레이어에 픽셀 선택이 없어 전체 범위만 사용할 수 있습니다.",
        )}
      >
        <label className="sr-only" htmlFor="studio-living-ink-scope">Living Ink 처리 범위</label>
        <select
          id="studio-living-ink-scope"
          aria-label="Living Ink 처리 범위"
          value={selectionScopeDisabled ? "all" : scope}
          disabled={!ready}
          onChange={(event) => onScopeChange(event.target.value === "selection" ? "selection" : "all")}
          className={cn(
            "h-8 rounded-lg border border-line bg-card px-1.5 text-[0.62rem] font-bold text-fg pointer-coarse:h-11",
            STUDIO_FOCUS_RING,
          )}
        >
          <option value="all">전체</option>
          <option value="selection" disabled={selectionScopeDisabled}>선택</option>
        </select>
      </StudioToolHintTarget>

      <StudioToolHintTarget
        disabled={!ready || !fixAvailable}
        unavailableReason={!fixAvailable ? fixUnavailableReason : undefined}
        hint={studioToolHintFromLabel(
          "Living Ink 정착",
          "현재 이동 가능한 안료를 종이에 정착해 이후 물 브러시로 다시 움직이지 않게 합니다.",
          undefined,
          "layer-lock",
          "lock",
        )}
      >
        <button
          type="button"
          data-studio-living-ink-fix="true"
          disabled={!ready || !fixAvailable}
          aria-label="Living Ink 정착"
          onClick={onFix}
          className={cn(
            buttonClass,
            "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-40",
          )}
        >
          <LockKeyhole size={14} aria-hidden />
        </button>
      </StudioToolHintTarget>

      <StudioToolHintTarget
        disabled={!ready}
        hint={studioToolHintFromLabel(
          "Living Ink 지우기",
          scope === "selection"
            ? "실행 시점에 복사한 선택 마스크의 알파만큼 물·이동 안료·정착 안료를 지웁니다. 실행 취소는 한 단계입니다."
            : "현재 Living Ink 물리 레이어 전체를 지웁니다. 확인 뒤 실행되며 실행 취소는 한 단계입니다.",
          undefined,
          "erase",
        )}
      >
        <button
          type="button"
          data-studio-living-ink-clear="true"
          disabled={!ready}
          aria-label="Living Ink 지우기"
          onClick={onClear}
          className={cn(
            buttonClass,
            "border-line bg-card text-fg-3 hover:border-danger/55 hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-40",
          )}
        >
          <Eraser size={14} aria-hidden />
        </button>
      </StudioToolHintTarget>

      <details className="group relative">
        <summary
          aria-label="Living Ink 재질 설정"
          className={cn(
            "grid size-8 cursor-pointer list-none place-items-center rounded-lg border border-line bg-card text-fg-3 hover:bg-raised hover:text-fg pointer-coarse:size-11",
            STUDIO_FOCUS_RING,
          )}
        >
          <Droplets size={14} aria-hidden />
        </summary>
        <div className="absolute bottom-[calc(100%+0.55rem)] right-0 z-[80] w-64 rounded-xl border border-line bg-panel/98 p-3 shadow-2xl backdrop-blur-xl">
          <div className="mb-2 flex items-center justify-between gap-2">
            <strong className="text-xs text-fg">물·종이 재질</strong>
            <span role="status" className="text-[0.58rem] text-fg-3">{stateLabel(state)}</span>
          </div>
          {materialLocked ? (
            <p className="mb-2 rounded-lg border border-amber-400/25 bg-amber-400/8 px-2 py-1.5 text-[0.58rem] leading-relaxed text-amber-100">
              {materialLockedReason}
            </p>
          ) : null}

          <div className="mb-2.5">
            <span className="mb-1 block text-[0.62rem] font-bold text-fg-2">종이 질감 선택 (Paper Texture Presets)</span>
            <div className="grid grid-cols-4 gap-1">
              {[
                { name: "전통 한지", fiber: 0.55, tooth: 0.40, gran: 0.35 },
                { name: "수채화지", fiber: 0.75, tooth: 0.82, gran: 0.65 },
                { name: "켄트지", fiber: 0.15, tooth: 0.18, gran: 0.10 },
                { name: "거친 코튼", fiber: 0.90, tooth: 0.95, gran: 0.85 },
                { name: "크라프트", fiber: 0.65, tooth: 0.60, gran: 0.50 },
                { name: "아마포", fiber: 0.45, tooth: 0.70, gran: 0.40 },
                { name: "파스텔 펠트", fiber: 0.30, tooth: 0.50, gran: 0.25 },
                { name: "매끄러움", fiber: 0.00, tooth: 0.00, gran: 0.00 },
              ].map((preset) => {
                const isActive =
                  Math.abs(material.paperFiber - preset.fiber) < 0.05 &&
                  Math.abs(material.paperTooth - preset.tooth) < 0.05;
                return (
                  <button
                    key={preset.name}
                    type="button"
                    disabled={busy || materialLocked}
                    onClick={() =>
                      onMaterialChange({
                        paperFiber: preset.fiber,
                        paperTooth: preset.tooth,
                        granulation: preset.gran,
                      })
                    }
                    className={cn(
                      "h-6 rounded border px-1 text-[0.55rem] font-medium transition-colors",
                      isActive
                        ? "border-accent bg-accent/15 text-accent font-bold"
                        : "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg",
                    )}
                  >
                    {preset.name}
                  </button>
                );
              })}
            </div>
          </div>

          {([
            ["flow", "안료 흐름"],
            ["bleed", "번짐"],
            ["dryRate", "건조 속도"],
            ["chromaticSeparation", "색상 분리"],
            ["dryingEdgeDeposition", "테두리 응집"],
            ["paperFiber", "종이 섬유"],
            ["paperTooth", "종이 요철"],
            ["granulation", "과립"],
          ] as const).map(([key, label]) => (
            <label key={key} className="mb-2 grid grid-cols-[4.7rem_1fr_2rem] items-center gap-2 text-[0.62rem] text-fg-2">
              <span>{label}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={material[key]}
                disabled={busy || materialLocked}
                onChange={(event) => onMaterialChange({ [key]: Number(event.target.value) })}
                className="studio-range min-w-0"
                aria-label={`Living Ink ${label}`}
              />
              <span className="tabular-nums text-right text-fg-3">{Math.round(material[key] * 100)}</span>
            </label>
          ))}
          <button
            type="button"
            className={cn(
              "mt-1 h-8 w-full rounded-lg border border-line bg-card text-[0.62rem] font-bold text-fg-2 hover:bg-raised hover:text-fg",
              STUDIO_FOCUS_RING,
            )}
            onClick={() => onMaterialChange(DEFAULT_STUDIO_LIVING_INK_MATERIAL_CONTROLS)}
            disabled={busy || materialLocked}
          >
            재질 기본값 복원
          </button>
        </div>
      </details>
    </div>
  );
}
