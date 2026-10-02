import { Check, UserRoundPen } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  SPACE_PROXIMITY_RANGE_OPTIONS,
  SPACE_STATUS_OPTIONS,
  type SpaceProximityRangeOption,
  type SpaceStatusId,
  type SpaceStatusOption,
} from "./space-dock-model";
import type { SpaceProximityRangeMode } from "./space-proximity-media";

/**
 * 내 상태 6종(대화 가능·집중·검토·회의·휴식·자리 비움)과 캐릭터·이름 바꾸기.
 * 상태는 색 점과 글자로 함께 보여 주고, 고른 값은 이름표와 팀원 목록에 그대로 보인다.
 * 근접 음성 범위(기본·좁게·끄기)를 함께 두면 좁게·끄기일 때 내 상태 점이 빨간색으로 바뀐다(Gather Quiet 대응).
 */
export function SpaceStatusMenu({ status, onStatus, onEditCharacter, proximityRange, onProximityRange }: {
  readonly status: SpaceStatusId;
  /** close가 true면 고른 뒤 메뉴를 닫는다(클릭). 화살표 이동은 메뉴를 유지한다. */
  readonly onStatus: (option: SpaceStatusOption, close: boolean) => void;
  readonly onEditCharacter: () => void;
  /** 근접 음성 범위. onProximityRange와 함께 주어질 때만 범위 그룹을 그린다. */
  readonly proximityRange?: SpaceProximityRangeMode;
  readonly onProximityRange?: (option: SpaceProximityRangeOption, close: boolean) => void;
}) {
  const bt = useBilingual("SpaceStatusMenu");
  const group = useRef<HTMLDivElement>(null);
  const rangeGroup = useRef<HTMLDivElement>(null);
  // 라디오 그룹 관례: 화살표로 선택을 옮기고 초점도 따라간다.
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = SPACE_STATUS_OPTIONS[(index + step + SPACE_STATUS_OPTIONS.length) % SPACE_STATUS_OPTIONS.length];
    if (!next) return;
    onStatus(next, false);
    group.current?.querySelector<HTMLButtonElement>(`[data-status-option="${next.id}"]`)?.focus();
  };
  const onRangeKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!onProximityRange) return;
    const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = SPACE_PROXIMITY_RANGE_OPTIONS[(index + step + SPACE_PROXIMITY_RANGE_OPTIONS.length) % SPACE_PROXIMITY_RANGE_OPTIONS.length];
    if (!next) return;
    onProximityRange(next, false);
    rangeGroup.current?.querySelector<HTMLButtonElement>(`[data-range-option="${next.id}"]`)?.focus();
  };
  return <div className="space-status-menu">
    <div ref={group} role="radiogroup" aria-label={bt("내 상태", "My status")} className="space-status-menu__options">
      {SPACE_STATUS_OPTIONS.map((option, index) => <button key={option.id} type="button" role="radio" aria-checked={status === option.id}
        tabIndex={status === option.id ? 0 : -1} data-status-option={option.id} data-activity-option={option.activity}
        className="space-menu-row" onClick={() => onStatus(option, true)} onKeyDown={(event) => onKeyDown(event, index)}>
        <span className="space-status-dot" data-activity={option.activity} data-status={option.id} aria-hidden />
        <span className="space-menu-row__label">{bt(option.labelKo, option.labelEn)}</span>
        {status === option.id ? <Check size={16} aria-hidden /> : null}
      </button>)}
    </div>
    <p className="space-status-menu__note">{bt(
      "집중·자리 비움 중에는 새 대화 요청을 받지 않아요. 회의·휴식 중은 이름표에만 표시돼요.",
      "Focusing or away pauses new conversation requests. Meeting and break only change your name tag.",
    )}</p>
    {proximityRange && onProximityRange ? <>
      <div ref={rangeGroup} role="radiogroup" aria-label={bt("근접 음성 범위", "Proximity voice range")} className="space-status-menu__options">
        {SPACE_PROXIMITY_RANGE_OPTIONS.map((option, index) => <button key={option.id} type="button" role="radio" aria-checked={proximityRange === option.id}
          tabIndex={proximityRange === option.id ? 0 : -1} data-range-option={option.id}
          className="space-menu-row" onClick={() => onProximityRange(option, true)} onKeyDown={(event) => onRangeKeyDown(event, index)}>
          <span className="space-status-dot" data-range={option.id === "standard" ? undefined : option.id} aria-hidden />
          <span className="space-menu-row__label">{bt(option.labelKo, option.labelEn)}
            <small>{bt(option.hintKo, option.hintEn)}</small>
          </span>
          {proximityRange === option.id ? <Check size={16} aria-hidden /> : null}
        </button>)}
      </div>
      <p className="space-status-menu__note">{bt(
        "좁게·끄기를 고르면 도크의 내 상태 점이 빨간색으로 바뀌어요.",
        "Choosing Quiet or Off turns your status dot in the dock red.",
      )}</p>
    </> : null}
    <button type="button" className="space-menu-row" onClick={onEditCharacter}>
      <UserRoundPen size={16} aria-hidden />
      <span className="space-menu-row__label">{bt("캐릭터·이름 바꾸기", "Change character & name")}</span>
    </button>
  </div>;
}
