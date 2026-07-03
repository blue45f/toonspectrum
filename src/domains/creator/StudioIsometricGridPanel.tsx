/**
 * Studio Isometric Grid Panel — 아이소메트릭 그리드 인스펙터: on/off 토글 + 각도 슬라이더
 * (15°/30°/45°/60° 프리셋 칩 포함) + 셀 크기 슬라이더 + 기준점 초기화 버튼. 캔버스 위
 * 기준점 핸들 드래그는 StudioIsometricGridOverlay(Konva, Stage 트리 안에 있어야 해서
 * 별도 파일)가 담당한다 — 좌표는 항상 StudioPage 가 소유하는 fully-controlled 컴포넌트
 * (로컬 상태 없음).
 */
import { RotateCcw } from "lucide-react";

import {
  ISOMETRIC_ANGLE_MAX_DEG,
  ISOMETRIC_ANGLE_MIN_DEG,
  ISOMETRIC_ANGLE_PRESETS_DEG,
  ISOMETRIC_CELL_SIZE_MAX,
  ISOMETRIC_CELL_SIZE_MIN,
  type IsometricGridConfig,
} from "./studio-isometric-grid";
import {
  StudioPanelChip,
  StudioSliderRow,
  StudioToggleChip,
} from "./studio-panel-ui";

import type { ReactElement } from "react";

export type StudioIsometricGridPanelProps = {
  active: boolean;
  config: IsometricGridConfig;
  onToggleActive: () => void;
  onChangeAngle: (next: number) => void;
  onChangeCellSize: (next: number) => void;
  onResetOrigin: () => void;
};

export function StudioIsometricGridPanel({
  active,
  config,
  onToggleActive,
  onChangeAngle,
  onChangeCellSize,
  onResetOrigin,
}: StudioIsometricGridPanelProps): ReactElement {
  return (
    <div className="pt-2.5 border-t border-line/35 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-fg-3">아이소메트릭 그리드</p>
        <StudioToggleChip
          active={active}
          onClick={onToggleActive}
          title="펜·직선이 그리드 축(3방향) 방향으로 자동 정렬됩니다."
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
            onChange={onChangeAngle}
            readout={`${Math.round(config.angleDeg)}°`}
          />
          <div className="flex flex-wrap gap-1">
            {ISOMETRIC_ANGLE_PRESETS_DEG.map((preset) => (
              <StudioPanelChip
                key={preset}
                active={config.angleDeg === preset}
                onClick={() => onChangeAngle(preset)}
                title={`${preset}° 로 설정`}
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
            onChange={onChangeCellSize}
            readout={`${Math.round(config.cellSize)}px`}
          />

          <button
            type="button"
            onClick={onResetOrigin}
            title="기준점을 캔버스 중앙으로 되돌립니다."
            className="flex w-full items-center justify-center gap-1 rounded border border-line bg-card py-1 text-[0.68rem] font-semibold text-fg-2 transition-colors hover:bg-raised cursor-pointer"
          >
            <RotateCcw className="size-3" aria-hidden />
            기준점 초기화
          </button>
        </div>
      )}
    </div>
  );
}
