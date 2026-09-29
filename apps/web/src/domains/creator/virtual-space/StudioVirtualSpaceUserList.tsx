import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioVirtualSpaceActivity } from "./studio-virtual-space-model";

export interface StudioSpaceUserSnapshot {
  readonly id: string;
  readonly name: string;
  /** 현재 구역 id. 구역 밖에 있으면 null. */
  readonly zoneId: string | null;
  readonly activity: StudioVirtualSpaceActivity;
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

const ACTIVITY_DOT: Record<StudioVirtualSpaceActivity, string> = {
  available: "#34d399",
  focused: "#60a5fa",
  reviewing: "#fbbf24",
  away: "#94a3b8",
};

export interface StudioVirtualSpaceUserListProps {
  readonly users: readonly StudioSpaceUserSnapshot[];
  readonly zones: readonly StudioUserListZoneLabel[];
  readonly selfId?: string;
}

/** 실시간 유저 리스트: 아바타 id/이름/현재 구역/상태를 보여준다. */
export function StudioVirtualSpaceUserList({ users, zones, selfId }: StudioVirtualSpaceUserListProps) {
  const bt = useBilingual("StudioVirtualSpaceUserList");
  const entries = buildUserListEntries(users, zones, selfId);

  const activityLabel = (activity: StudioVirtualSpaceActivity): string =>
    activity === "available" ? bt("작업 가능", "Available")
    : activity === "focused" ? bt("집중 중", "Focused")
    : activity === "reviewing" ? bt("검토 중", "Reviewing")
    : bt("자리 비움", "Away");

  return (
    <section aria-label={bt("작업 중인 사용자", "Users working now")} className="vs2-panel">
      <h2 className="font-bold">{bt("작업 중인 사용자", "Users working now")}</h2>
      {entries.length === 0 ? (
        <p className="mt-2 text-xs text-fg-2" role="status">
          {bt("현재 공간에 표시할 사용자가 없어요.", "No users to show in the space right now.")}
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-xs"
              data-user-id={entry.id}
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: ACTIVITY_DOT[entry.activity] }}
              />
              <span className="min-w-0 flex-1 truncate font-medium">
                {entry.name}
                {entry.isSelf ? <span className="ml-1 text-fg-2">({bt("나", "You")})</span> : null}
              </span>
              <span className="shrink-0 text-fg-2">
                {entry.zoneLabelKo || bt("구역 밖", "Outside zones")}
              </span>
              <span className="shrink-0 rounded-full border border-line px-1.5 py-0.5 text-[11px]">
                {activityLabel(entry.activity)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
