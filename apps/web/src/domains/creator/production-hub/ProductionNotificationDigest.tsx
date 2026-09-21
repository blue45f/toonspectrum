import { useEffect, useState } from "react";
import { groupProductionNotifications, safeProductionNotificationHref, type ProductionNotification, type ProductionProjectAggregate } from "@toonspectrum/core/production";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export function ProductionNotificationDigest({ aggregate, assignmentId, disabled, onRead }: {
  readonly aggregate: ProductionProjectAggregate; readonly assignmentId: string; readonly disabled: boolean;
  readonly onRead: (notification: ProductionNotification) => Promise<void>;
}) {
  const bt = useBilingual("ProductionNotificationDigest");
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(timer); }, []);
  const digest = groupProductionNotifications(aggregate, assignmentId, now);
  const quiet = { off: bt("알림 선호 미사용", "Notification preferences off"), quiet: bt("현재 조용한 시간", "Currently in quiet hours"),
    active: bt("조용한 시간 외", "Outside quiet hours"), unknown: bt("담당자·시간대 확인 필요", "Check assignee and timezone") }[digest.quiet];
  return <div className="space-y-3" aria-label={bt("담당자별 알림 묶음", "Assignee notification digest")}>
    <p className="text-xs text-fg-2">{quiet} · {digest.timezone ?? bt("시간대 미정", "Timezone unknown")}</p>
    <p className="text-xs text-fg-2">{bt("선택한 담당자의 미확인 알림을 같은 원인별로 모았습니다. 조용한 시간에도 직접 열람할 수 있으며 외부 예약 발송 결과가 아닙니다.", "Unread notifications for the selected assignee are grouped by source. Manual reading remains available during quiet hours; this is not an external scheduled-delivery receipt.")}</p>
    <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
      {digest.groups.slice(0, 20).map((group) => {
        const first = group.entries[0]!;
        return <details key={group.key} className="rounded-xl border border-line bg-panel p-3">
          <summary className="min-h-11 cursor-pointer break-words text-sm font-semibold">{first.title} · {bt(`${group.entries.length}건`, `${group.entries.length} items`)}</summary>
          <div className="mt-2 space-y-3">{group.entries.slice(0, 50).map((notification) => {
            const href = safeProductionNotificationHref(aggregate.projectId, notification.href);
            return <article key={notification.id} className="space-y-2 rounded-lg border border-line p-3">
              <p className="break-words text-sm font-semibold">{notification.title} · {notification.urgency === "critical" ? bt("중요", "Critical") : notification.urgency === "warning" ? bt("확인 필요", "Needs attention") : bt("일반", "Information")}</p>
              <p className="whitespace-pre-wrap break-words text-xs">{notification.body}</p>
              {href ? <a className="flex min-h-11 items-center text-xs underline" href={href}>{bt("관련 작업 열기", "Open related work")}</a> : <p className="text-xs">{bt("현재 작품의 안전한 작업 경로가 아닙니다. 작업함에서 대상을 다시 확인해 주세요.", "This is not a valid path in the current project. Find the target through the work inbox.")}</p>}
              <button type="button" className="min-h-11 rounded-lg border border-line px-3 text-xs disabled:opacity-50" disabled={disabled} onClick={() => void onRead(notification)}>{bt("이 알림 읽음 처리", "Mark this notification read")}</button>
            </article>;
          })}</div>
          {group.entries.length > 50 ? <p className="mt-2 text-xs">{bt("최근 50건만 표시합니다. 개별 항목을 읽음 처리하면 남은 항목을 볼 수 있습니다.", "Showing the latest 50. Mark individual entries read to see the remaining entries.")}</p> : null}
        </details>;
      })}
      {!digest.groups.length ? <p className="p-4 text-xs">{bt("이 담당자에게 표시할 미확인 알림이 없습니다.", "No unread notifications are available for this assignee.")}</p> : null}
      {digest.groups.length > 20 ? <p className="text-xs">{bt("최근 20개 원인 묶음만 표시합니다.", "Showing the latest 20 source groups.")}</p> : null}
    </div>
  </div>;
}
