import { useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioVirtualSpaceActivity } from "./studio-virtual-space-model";
import {
  teammateListNextIndex,
  teammateStatusBadge,
  type TeammateListNavKey,
} from "./studio-virtual-space-teammates";
import type { StudioUserStatus } from "./studio-virtual-space-user-status";

export interface StudioSpaceUserSnapshot {
  readonly id: string;
  readonly name: string;
  /** 현재 구역 id. 구역 밖에 있으면 null. */
  readonly zoneId: string | null;
  readonly activity: StudioVirtualSpaceActivity;
  /** 명시적 사용자 상태. 있으면 활동 배지를 덮어쓴다. */
  readonly userStatus?: StudioUserStatus | null;
}

export interface StudioUserListZoneLabel {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
}

export interface StudioUserListEntry {
  readonly id: string;
  readonly name: string;
  readonly zoneId: string | null;
  readonly zoneLabelKo: string;
  readonly zoneLabelEn: string;
  readonly activity: StudioVirtualSpaceActivity;
  readonly userStatus: StudioUserStatus | null;
  readonly isSelf: boolean;
}

/**
 * "누가 어디서 작업 중인지" 목록을 위한 순수 파생 함수.
 * 정렬: 나 → 구역 이름(한글) → 이름. 구역 정보가 없으면 뒤로.
 */
// eslint-disable-next-line react-refresh/only-export-components -- 정렬·라벨 파생은 이 리스트의 공개 계약이라 컴포넌트와 같은 파일에 둔다
export function buildUserListEntries(
  users: readonly StudioSpaceUserSnapshot[],
  zones: readonly StudioUserListZoneLabel[],
  selfId?: string,
): readonly StudioUserListEntry[] {
  const labelById = new Map(zones.map((zone) => [zone.id, zone] as const));
  const entries = users.map((user) => {
    const label = user.zoneId ? labelById.get(user.zoneId) : undefined;
    return Object.freeze({
      id: user.id,
      name: user.name,
      zoneId: user.zoneId,
      zoneLabelKo: label?.labelKo ?? "",
      zoneLabelEn: label?.labelEn ?? "",
      activity: user.activity,
      userStatus: user.userStatus ?? null,
      isSelf: user.id === selfId,
    } satisfies StudioUserListEntry);
  });
  return Object.freeze(
    [...entries].sort((a, b) => {
      if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
      const zoneA = a.zoneLabelKo || "\uffff";
      const zoneB = b.zoneLabelKo || "\uffff";
      if (zoneA !== zoneB) return zoneA < zoneB ? -1 : 1;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    }),
  );
}

export interface StudioVirtualSpaceUserListProps {
  readonly users: readonly StudioSpaceUserSnapshot[];
  readonly zones: readonly StudioUserListZoneLabel[];
  readonly selfId?: string;
  /** 주면 Enter·Space나 '선택' 버튼으로 그 팀원을 고른다(나는 제외). */
  readonly onActivate?: (id: string) => void;
}

/** 실시간 유저 리스트: 아바타 id/이름/현재 구역/상태를 보여준다. */
export function StudioVirtualSpaceUserList({ users, zones, selfId, onActivate }: StudioVirtualSpaceUserListProps) {
  const bt = useBilingual("StudioVirtualSpaceUserList");
  const entries = buildUserListEntries(users, zones, selfId);
  const [activeIndex, setActiveIndex] = useState(0);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  // 목록이 줄어들어도 roving tabindex가 유효한 항목을 가리키도록 보정한다.
  const clampedActiveIndex = entries.length === 0 ? 0 : Math.min(activeIndex, entries.length - 1);

  const focusEntry = (index: number) => {
    setActiveIndex(index);
    itemRefs.current[index]?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const key = event.key;
    if ((key === "Enter" || key === " ") && onActivate) {
      const entry = entries[clampedActiveIndex];
      if (entry && !entry.isSelf) {
        event.preventDefault();
        onActivate(entry.id);
      }
      return;
    }
    if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "Home" && key !== "End") return;
    event.preventDefault();
    focusEntry(teammateListNextIndex(activeIndex, entries.length, key as TeammateListNavKey));
  };

  const activityLabel = (activity: StudioVirtualSpaceActivity): string =>
    activity === "available" ? bt("작업 가능", "Available")
    : activity === "focused" ? bt("집중 중", "Focused")
    : activity === "reviewing" ? bt("검토 중", "Reviewing")
    : bt("자리 비움", "Away");

  const itemAriaLabel = (entry: StudioUserListEntry): string => {
    const badge = teammateStatusBadge(entry.activity, entry.userStatus);
    const zoneKo = entry.zoneLabelKo || bt("구역 밖", "Outside zones");
    const zoneEn = entry.zoneLabelEn || "Outside zones";
    const selfSuffixKo = entry.isSelf ? bt(", 나", ", you") : "";
    const selfSuffixEn = entry.isSelf ? ", you" : "";
    return bt(
      `${entry.name}, ${badge.labelKo}, ${zoneKo}${selfSuffixKo}`,
      `${entry.name}, ${badge.labelEn}, ${zoneEn}${selfSuffixEn}`,
    );
  };

  return (
    <section aria-label={bt("작업 중인 사용자", "Users working now")} className="vs2-panel">
      <h2 className="font-bold">{bt("작업 중인 사용자", "Users working now")}</h2>
      {entries.length === 0 ? (
        <p className="mt-2 text-xs text-fg-2" role="status">
          {bt("현재 공간에 표시할 사용자가 없어요.", "No users to show in the space right now.")}
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-fg-2" role="status">
            {bt(`총 ${entries.length}명 작업 중`, `${entries.length} people working`)}
          </p>
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- WAI-ARIA roving tabindex 패턴: 방향키 핸들러는 목록 컨테이너에 두고 각 항목은 li 시맨틱을 유지한다 */}
          <ul
            onKeyDown={handleKeyDown}
            aria-label={onActivate
              ? bt("사용자 목록. 방향키로 이동하고 Enter로 선택해요.", "User list. Use arrow keys to move and Enter to select.")
              : bt("사용자 목록. 방향키로 이동할 수 있어요.", "User list. Use arrow keys to move.")}
            className="studio-vspace-user-list mt-2 space-y-1.5"
          >
            {entries.map((entry, index) => {
              const badge = teammateStatusBadge(entry.activity, entry.userStatus);
              return (
                <li
                  key={entry.id}
                  ref={(element) => {
                    itemRefs.current[index] = element;
                  }}
                  tabIndex={index === clampedActiveIndex ? 0 : -1}
                  onFocus={() => setActiveIndex(index)}
                  aria-label={itemAriaLabel(entry)}
                  className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-xs"
                  data-user-id={entry.id}
                >
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: badge.dotColor }}
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {entry.name}
                    {entry.isSelf ? <span className="ml-1 text-fg-2">({bt("나", "You")})</span> : null}
                  </span>
                  <span className="shrink-0 text-fg-2">
                    {entry.zoneLabelKo || bt("구역 밖", "Outside zones")}
                  </span>
                  <span className="shrink-0 rounded-full border border-line px-1.5 py-0.5 text-[11px]">
                    {entry.userStatus ? bt(badge.labelKo, badge.labelEn) : activityLabel(entry.activity)}
                  </span>
                  {onActivate && !entry.isSelf ? <button type="button" tabIndex={-1}
                    className="studio-vspace-user-list__select shrink-0 rounded-lg border border-line px-2 text-[11px] font-bold"
                    aria-label={bt(`${entry.name} 선택`, `Select ${entry.name}`)}
                    onClick={() => { setActiveIndex(index); onActivate(entry.id); }}>
                    {bt("선택", "Select")}
                  </button> : null}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
