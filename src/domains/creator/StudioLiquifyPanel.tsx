/**
 * Studio Liquify Panel
 * Push(왜곡) 브러시 컨트롤 — 켜면 메인 캔버스에서 선택된 이미지 위 드래그가 궤적을 따라 픽셀을
 * 미는 왜곡 스트로크로 처리된다. 이 패널 자신은 드래그도 픽셀 재배치도 하지 않는 순수 컨트롤
 * (무장 토글 + 반경·강도 슬라이더)이다 — 실제 스트로크 좌표 누적·비동기 굽기(변위 필드 계산 +
 * backward mapping 렌더)는 StudioPage의 onStageDown/onStageMove/onStageUp이 담당한다
 * (smudge/heal-clone/layer-mask와 동일하게 "패널은 상태만 보여주고 캔버스 제스처는 상위가 처리").
 *
 * 실시간 픽셀 미리보기는 없다(studio-smudge.ts와 동일한 이유) — 브러시 반경 커서만 드래그 중
 * 표시되고, 실제 왜곡은 드래그(한 스트로크) 종료 시 한 번에 적용된다.
 *
 * 스코프: Push(밀기) 모드만 제공한다 — Procreate의 Twirl/Pinch/Bloat 등은 이 배치에서 의도적으로
 * 생략했다(studio-liquify.ts 모듈 docstring 및 design 문서 §5 참고).
 */
import { Loader2, Move } from "lucide-react";

import { LIQUIFY_RADIUS_RANGE, LIQUIFY_STRENGTH_RANGE } from "./studio-liquify";
import { StudioSliderRow, StudioToggleChip } from "./studio-panel-ui";

import type { ReactElement } from "react";

export type StudioLiquifyPanelProps = {
  /** Push 브러시가 무장(켜짐) 상태인지. */
  active: boolean;
  /** 브러시 반경(캔버스 표시 px, LIQUIFY_RADIUS_RANGE). */
  radius: number;
  /** 밀기 강도(%, LIQUIFY_STRENGTH_RANGE). */
  strength: number;
  /** 스트로크 커밋(변위 필드 렌더) 진행 중 — 다른 픽셀 도구와 동일 관례로 잠그지 않고 표시만. */
  busy?: boolean;
  onToggleActive: () => void;
  onRadiusChange: (value: number) => void;
  onStrengthChange: (value: number) => void;
};

export function StudioLiquifyPanel({
  active,
  radius,
  strength,
  busy = false,
  onToggleActive,
  onRadiusChange,
  onStrengthChange,
}: StudioLiquifyPanelProps): ReactElement {
  return (
    <div className="mt-2.5 space-y-2 rounded-xl border border-line bg-card/45 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">
          <Move size={12} aria-hidden />
          Liquify(밀기 브러시)
        </p>
        {busy && <Loader2 size={13} className="animate-spin text-accent" aria-hidden />}
      </div>

      <StudioToggleChip
        active={active}
        onClick={onToggleActive}
        title="켜고 이미지를 드래그하면 지나간 방향으로 픽셀이 밀리듯 국소적으로 왜곡됩니다."
      >
        <span className="inline-flex items-center gap-1">
          <Move className="size-3" aria-hidden />
          밀어서 왜곡하기
        </span>
      </StudioToggleChip>

      <StudioSliderRow
        label="브러시 크기"
        min={LIQUIFY_RADIUS_RANGE.min}
        max={LIQUIFY_RADIUS_RANGE.max}
        step={LIQUIFY_RADIUS_RANGE.step}
        value={radius}
        onChange={onRadiusChange}
        readout={`${radius}px`}
      />

      <StudioSliderRow
        label="강도"
        min={LIQUIFY_STRENGTH_RANGE.min}
        max={LIQUIFY_STRENGTH_RANGE.max}
        step={LIQUIFY_STRENGTH_RANGE.step}
        value={strength}
        onChange={onStrengthChange}
        readout={`${strength}%`}
      />

      <p className="text-[0.72rem] leading-relaxed text-fg-3" role="status">
        {busy
          ? "왜곡을 적용하는 중..."
          : active
            ? "이미지 위를 드래그하면 지나간 방향으로 픽셀이 밀립니다. 같은 자리를 여러 번 오가면 더 밀리고, 짧게 탭만 하면 변화가 없어요 — 밀려면 드래그가 필요합니다. 결과는 손을 뗀 시점에 한 번에 반영됩니다(⌘Z로 되돌리기 가능)."
            : "켜고 이미지 위를 드래그하면 손끝으로 민 것처럼 픽셀이 국소적으로 왜곡됩니다."}
      </p>
    </div>
  );
}
