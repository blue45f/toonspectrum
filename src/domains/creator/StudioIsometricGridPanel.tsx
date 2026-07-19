/**
 * Studio Isometric Grid Panel — 아이소메트릭 그리드 인스펙터: on/off 토글 + 각도 슬라이더
 * (15°/30°/45°/60° 프리셋 칩 포함) + 셀 크기 슬라이더 + 기준점 초기화 버튼. 캔버스 위
 * 기준점 핸들 드래그는 StudioIsometricGridOverlay(Konva, Stage 트리 안에 있어야 해서
 * 별도 파일)가 담당한다. 슬라이더는 로컬 draft/선택적 preview와 최종 커밋을 분리한다.
 */
import { Box, RotateCcw } from "lucide-react";

import {
  ISOMETRIC_ANGLE_MAX_DEG,
  ISOMETRIC_ANGLE_MIN_DEG,
  ISOMETRIC_ANGLE_PRESETS_DEG,
  ISOMETRIC_CELL_SIZE_MAX,
  ISOMETRIC_CELL_SIZE_MIN,
  type IsometricGridConfig,
} from "./studio-isometric-grid";
import {
  StudioCoordinateInput,
  StudioPanelChip,
  StudioSliderRow,
  StudioToggleChip,
} from "./studio-panel-ui";

import type { ReactElement } from "react";

type ChangeIsometricValue = (next: number) => void;
type ChangeIsometricOrigin = (x: number, y: number) => void;

const NOOP_PREVIEW = (): void => undefined;

type StudioIsometricGridPanelBaseProps = {
  active: boolean;
  config: IsometricGridConfig;
  onToggleActive: () => void;
  onResetOrigin: () => void;
  /** Creates three independently editable vector faces at the current origin. */
  onInsertSolid?: () => void;
  disabled?: boolean;
  disabledReason?: string;
  /** Optional transient canvas preview; must not append undo/CRDT history. */
  onPreviewAngle?: ChangeIsometricValue;
  /** Optional transient canvas preview; must not append undo/CRDT history. */
  onPreviewCellSize?: ChangeIsometricValue;
  /** Optional keyboard-accessible origin preview; must not append undo/CRDT history. */
  onPreviewOrigin?: ChangeIsometricOrigin;
  /** Final origin commit after Enter or blur. When omitted the coordinate fields stay hidden. */
  onCommitOrigin?: ChangeIsometricOrigin;
};

type StudioIsometricAngleCommitProps =
  | {
      /** One final document/history commit per completed interaction. */
      onCommitAngle: ChangeIsometricValue;
      /** @deprecated Use onCommitAngle. */
      onChangeAngle?: ChangeIsometricValue;
    }
  | {
      onCommitAngle?: undefined;
      /** Legacy final callback, now deferred until the interaction ends. */
      onChangeAngle: ChangeIsometricValue;
    };

type StudioIsometricCellCommitProps =
  | {
      /** One final document/history commit per completed interaction. */
      onCommitCellSize: ChangeIsometricValue;
      /** @deprecated Use onCommitCellSize. */
      onChangeCellSize?: ChangeIsometricValue;
    }
  | {
      onCommitCellSize?: undefined;
      /** Legacy final callback, now deferred until the interaction ends. */
      onChangeCellSize: ChangeIsometricValue;
    };

export type StudioIsometricGridPanelProps = StudioIsometricGridPanelBaseProps &
  StudioIsometricAngleCommitProps &
  StudioIsometricCellCommitProps;

export function StudioIsometricGridPanel({
  active,
  config,
  onToggleActive,
  disabled = false,
  disabledReason,
  onPreviewAngle,
  onPreviewCellSize,
  onPreviewOrigin,
  onCommitOrigin,
  onCommitAngle,
  onCommitCellSize,
  onChangeAngle,
  onChangeCellSize,
  onResetOrigin,
  onInsertSolid,
}: StudioIsometricGridPanelProps): ReactElement {
  const commitAngle = onCommitAngle ?? onChangeAngle;
  const commitCellSize = onCommitCellSize ?? onChangeCellSize;
  return (
    <div className="pt-2.5 border-t border-line/35 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-fg-3">아이소메트릭 그리드</p>
        <StudioToggleChip
          active={active}
          disabled={disabled}
          onClick={onToggleActive}
          aria-label={`아이소메트릭 그리드 ${active ? "끄기" : "켜기"}`}
          title={disabledReason ?? "펜·직선이 그리드 축(3방향) 방향으로 자동 정렬됩니다."}
        >
          {active ? "켜짐" : "꺼짐"}
        </StudioToggleChip>
      </div>

      {active && (
        <div className="space-y-2 pl-1.5 border-l border-line/50 ml-1 py-1 animate-fade-in">
          <StudioSliderRow
            label="각도"
            min={ISOMETRIC_ANGLE_MIN_DEG}
            max={ISOMETRIC_ANGLE_MAX_DEG}
            step={1}
            value={config.angleDeg}
            disabled={disabled}
            onChange={onPreviewAngle ?? NOOP_PREVIEW}
            onCommit={commitAngle}
            formatReadout={(draft) => `${Math.round(draft)}°`}
          />
          <div className="flex flex-wrap gap-1">
            {ISOMETRIC_ANGLE_PRESETS_DEG.map((preset) => (
              <StudioPanelChip
                key={preset}
                active={config.angleDeg === preset}
                disabled={disabled}
                onClick={() => commitAngle(preset)}
                title={disabledReason ?? `${preset}° 로 설정`}
              >
                {preset}°
              </StudioPanelChip>
            ))}
          </div>

          <StudioSliderRow
            label="셀 크기"
            min={ISOMETRIC_CELL_SIZE_MIN}
            max={ISOMETRIC_CELL_SIZE_MAX}
            step={1}
            value={config.cellSize}
            disabled={disabled}
            onChange={onPreviewCellSize ?? NOOP_PREVIEW}
            onCommit={commitCellSize}
            formatReadout={(draft) => `${Math.round(draft)}px`}
          />

          {onCommitOrigin ? (
            <div className="space-y-1">
              <p className="text-[0.68rem] font-semibold text-fg-3">기준점 좌표</p>
              <div className="flex gap-1.5">
                <StudioCoordinateInput
                  label="X"
                  ariaLabel="아이소메트릭 기준점 X"
                  value={config.originX}
                  disabled={disabled}
                  onPreview={onPreviewOrigin
                    ? (next) => onPreviewOrigin(next, config.originY)
                    : undefined}
                  onCommit={(next) => onCommitOrigin(next, config.originY)}
                />
                <StudioCoordinateInput
                  label="Y"
                  ariaLabel="아이소메트릭 기준점 Y"
                  value={config.originY}
                  disabled={disabled}
                  onPreview={onPreviewOrigin
                    ? (next) => onPreviewOrigin(config.originX, next)
                    : undefined}
                  onCommit={(next) => onCommitOrigin(config.originX, next)}
                />
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={onResetOrigin}
            disabled={disabled}
            title={disabledReason ?? "기준점을 캔버스 중앙으로 되돌립니다."}
            className="flex w-full items-center justify-center gap-1 rounded border border-line bg-card py-1 text-[0.68rem] font-semibold text-fg-2 transition-colors hover:bg-raised cursor-pointer disabled:cursor-not-allowed disabled:opacity-45 pointer-coarse:min-h-11"
          >
            <RotateCcw className="size-3" aria-hidden />
            기준점 초기화
          </button>

          {onInsertSolid ? (
            <button
              type="button"
              onClick={onInsertSolid}
              disabled={disabled}
              title={disabledReason ?? "현재 각도·셀 크기·색상으로 편집 가능한 상자를 만듭니다."}
              className="flex w-full items-center justify-center gap-1 rounded border border-accent/45 bg-accent/10 py-1.5 text-[0.68rem] font-semibold text-accent transition-colors hover:bg-accent/15 cursor-pointer disabled:cursor-not-allowed disabled:opacity-45 pointer-coarse:min-h-11"
            >
              <Box className="size-3" aria-hidden />
              입체 상자 생성
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
