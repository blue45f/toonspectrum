/**
 * Studio Layer Mask Panel — 레이어 마스크(비파괴) 컨트롤. 마스크가 없으면 추가 액션(흰/검정)만
 * 보여주고, 있으면 켬/끔·삭제·반전(즉시 굽기 액션 4종) + 브러시로 직접 그리기(무장 토글 + 모드
 * + 크기/경도/강도 슬라이더)를 보여준다.
 *
 * 이 패널 자신은 캔버스를 전혀 만지지 않는 순수 컨트롤(StudioSmudgePanel/StudioHealClonePanel과
 * 동일 관례 — "패널은 상태만 보여주고 캔버스 제스처는 상위(StudioPage)가 처리"). 브러시가
 * 무장(paintActive)되면 실제 포인터 처리·스트로크 누적·비동기 굽기(studio-layer-mask.ts의
 * bakeLayerMaskStroke)는 StudioPage의 onStageDown/Move/Up이 담당한다.
 *
 * 완전히 controlled — 내부 비즈니스 상태 없음. onAddMask/onInvert/onDeleteMask는 즉시 실행되는
 * 굽기 액션(studio-layer-mask.ts docstring 참고 — "반전"이 플래그가 아니라 즉시 굽기인 이유).
 *
 * 마스크 썸네일(maskThumbnailSrc)은 검은 배경 위에 maskSrc PNG를 그대로 얹기만 하면 된다 —
 * studio-layer-mask.ts의 인코딩 선택(마스크 값=RGB가 아니라 알파 채널) 덕분에 별도 변환 없이
 * 표준 포토샵 마스크 썸네일과 동일하게 읽힌다(알파 낮은 픽셀=검은 배경이 비쳐 어둡게,
 * 알파 높은 픽셀=흰색 그대로).
 */
import { Contrast, Eye, EyeOff, Loader2, Plus, SquareDashedMousePointer, Trash2 } from "lucide-react";

import {
  LAYER_MASK_BRUSH_HARDNESS_RANGE,
  LAYER_MASK_BRUSH_RADIUS_RANGE,
  LAYER_MASK_BRUSH_STRENGTH_RANGE,
  type LayerMaskPaintMode,
} from "./studio-layer-mask";
import { PANEL_CHIP_CLASS, StudioSliderRow, StudioToggleChip } from "./studio-panel-ui";

import type { ReactElement } from "react";

import { cn } from "@/lib/utils";

const PAINT_MODES: { id: LayerMaskPaintMode; label: string; tip: string }[] = [
  { id: "reveal", label: "보이기", tip: "흰색으로 칠해 이 영역을 드러냅니다." },
  { id: "conceal", label: "숨기기", tip: "검정으로 칠해 이 영역을 감춥니다." },
];

const MODE_ICONS: Record<LayerMaskPaintMode, typeof Eye> = {
  reveal: Eye,
  conceal: EyeOff,
};

export type StudioLayerMaskPanelProps = {
  /** el.maskSrc 존재 여부(켜짐/꺼짐과 무관) — false면 "추가" 액션만 보여준다. */
  hasMask: boolean;
  /** 마스크가 있을 때 el.maskEnabled 유효값(true=적용 중, false=일시 비활성화 — 데이터는 보존). */
  enabled: boolean;
  /** 마스크 브러시가 무장(켜짐) 상태인지. */
  paintActive: boolean;
  paintMode: LayerMaskPaintMode;
  radiusPx: number;
  hardness: number;
  strength: number;
  /** 마스크 썸네일 미리보기용 — el.maskSrc 그대로(없으면 null). */
  maskThumbnailSrc: string | null;
  /** 굽기(bake) 진행 중 — 다른 픽셀 도구와 동일 관례로 잠그지 않고 표시만. */
  busy?: boolean;
  onAddMask: (fill: LayerMaskPaintMode) => void;
  onDeleteMask: () => void;
  onToggleEnabled: () => void;
  onInvert: () => void;
  onTogglePaintActive: () => void;
  onPaintModeChange: (mode: LayerMaskPaintMode) => void;
  onRadiusChange: (v: number) => void;
  onHardnessChange: (v: number) => void;
  onStrengthChange: (v: number) => void;
};

export function StudioLayerMaskPanel({
  hasMask,
  enabled,
  paintActive,
  paintMode,
  radiusPx,
  hardness,
  strength,
  maskThumbnailSrc,
  busy = false,
  onAddMask,
  onDeleteMask,
  onToggleEnabled,
  onInvert,
  onTogglePaintActive,
  onPaintModeChange,
  onRadiusChange,
  onHardnessChange,
  onStrengthChange,
}: StudioLayerMaskPanelProps): ReactElement {
  const statusText = busy
    ? "마스크를 적용하는 중..."
    : !hasMask
      ? "마스크를 추가하면 브러시로 이 레이어의 일부를 비파괴로 가리거나 드러낼 수 있습니다(원본 이미지는 바뀌지 않아요)."
      : !enabled
        ? "마스크가 꺼져 있어요(데이터는 남아있음) — 다시 켜면 이전 상태 그대로 적용됩니다."
        : !paintActive
          ? "켜고 이미지를 드래그하면 마스크에 직접 그릴 수 있습니다."
          : "이미지를 드래그해 칠하세요. 흰색(보이기)은 드러내고 검정(숨기기)은 감춥니다 — 손을 뗀 시점에 한 번에 반영됩니다(⌘Z로 되돌리기 가능).";

  return (
    <div className="mt-2.5 space-y-2 rounded-xl border border-line bg-card/45 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">
          <SquareDashedMousePointer size={12} aria-hidden />
          레이어 마스크
        </p>
        {busy && <Loader2 size={13} className="animate-spin text-accent" aria-hidden />}
      </div>

      {!hasMask ? (
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => onAddMask("reveal")}
            title="전체가 보이는 흰 마스크를 추가합니다(기본 — 이후 검정으로 칠한 부분만 가려집니다)."
            className={cn(PANEL_CHIP_CLASS, "flex flex-1 items-center justify-center gap-1")}
          >
            <Plus className="size-3" aria-hidden />
            마스크 추가
          </button>
          <button
            type="button"
            onClick={() => onAddMask("conceal")}
            title="전체가 가려지는 검정 마스크를 추가합니다(이후 흰색으로 칠한 부분만 드러납니다)."
            className={cn(PANEL_CHIP_CLASS, "flex flex-1 items-center justify-center gap-1")}
          >
            <EyeOff className="size-3" aria-hidden />
            숨김으로 추가
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            {maskThumbnailSrc && (
              <span className="grid size-8 shrink-0 place-items-center rounded border border-line bg-black">
                <img src={maskThumbnailSrc} alt="" className="size-full rounded object-cover" />
              </span>
            )}
            <StudioToggleChip
              active={enabled}
              onClick={onToggleEnabled}
              title={enabled ? "마스크를 끕니다(데이터는 보존 — 잠깐 원본을 보고 싶을 때)." : "마스크를 다시 켭니다."}
            >
              {enabled ? "사용 중" : "꺼짐"}
            </StudioToggleChip>
            <button
              type="button"
              onClick={onInvert}
              title="마스크의 보이는/가려진 영역을 뒤집습니다(즉시 적용, ⌘Z로 되돌리기 가능)."
              className={cn(PANEL_CHIP_CLASS, "flex items-center gap-1")}
            >
              <Contrast className="size-3" aria-hidden />
              반전
            </button>
            <button
              type="button"
              onClick={onDeleteMask}
              title="마스크를 삭제합니다(원본 이미지는 영향 없음)."
              className={cn(PANEL_CHIP_CLASS, "ml-auto flex items-center gap-1 text-fg-3 hover:text-fg")}
            >
              <Trash2 className="size-3" aria-hidden />
              삭제
            </button>
          </div>

          <StudioToggleChip active={paintActive} onClick={onTogglePaintActive} title="켜고 이미지를 드래그하면 마스크에 직접 그릴 수 있습니다.">
            <span className="inline-flex items-center gap-1">
              <SquareDashedMousePointer className="size-3" aria-hidden />
              마스크에 그리기
            </span>
          </StudioToggleChip>

          <div className="flex gap-1.5">
            {PAINT_MODES.map((m) => {
              const Icon = MODE_ICONS[m.id];
              return (
                <StudioToggleChip key={m.id} active={paintMode === m.id} onClick={() => onPaintModeChange(m.id)} title={m.tip}>
                  <span className="inline-flex items-center gap-1">
                    <Icon className="size-3" aria-hidden />
                    {m.label}
                  </span>
                </StudioToggleChip>
              );
            })}
          </div>

          <StudioSliderRow
            label="브러시 크기"
            min={LAYER_MASK_BRUSH_RADIUS_RANGE.min}
            max={LAYER_MASK_BRUSH_RADIUS_RANGE.max}
            step={LAYER_MASK_BRUSH_RADIUS_RANGE.step}
            value={radiusPx}
            onChange={onRadiusChange}
            readout={`${radiusPx}px`}
          />
          <StudioSliderRow
            label="경도"
            min={LAYER_MASK_BRUSH_HARDNESS_RANGE.min}
            max={LAYER_MASK_BRUSH_HARDNESS_RANGE.max}
            step={LAYER_MASK_BRUSH_HARDNESS_RANGE.step}
            value={hardness}
            onChange={onHardnessChange}
            readout={`${Math.round(hardness * 100)}%`}
          />
          <StudioSliderRow
            label="강도"
            min={LAYER_MASK_BRUSH_STRENGTH_RANGE.min}
            max={LAYER_MASK_BRUSH_STRENGTH_RANGE.max}
            step={LAYER_MASK_BRUSH_STRENGTH_RANGE.step}
            value={strength}
            onChange={onStrengthChange}
            readout={`${Math.round(strength * 100)}%`}
          />
        </>
      )}

      <p className="text-[0.72rem] leading-relaxed text-fg-3" role="status">
        {statusText}
      </p>
    </div>
  );
}
