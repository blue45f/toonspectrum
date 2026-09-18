import { BellRing, CircleAlert, Clock3, Info } from "lucide-react";
import { useMemo } from "react";

import { creatorRoleNotifications } from "./creator-role-notifications";
import type {
  ProductionRole,
  ProductionWorkspace,
} from "./studio-production-workspace-runtime";

import type { CreatorRoleNotificationLevel } from "@/shared/lib/creator-role-contract";
import { cn } from "@/shared/lib/utils";

export function CreatorRoleNotificationCenter({
  workspace,
  currentUserId,
  activeRoles,
  level,
}: {
  readonly workspace: ProductionWorkspace;
  readonly currentUserId: string;
  readonly activeRoles: readonly ProductionRole[];
  readonly level: CreatorRoleNotificationLevel;
}) {
  const notifications = useMemo(
    () => creatorRoleNotifications(workspace, currentUserId, activeRoles, level),
    [activeRoles, currentUserId, level, workspace],
  );

  return (
    <section className="rounded-2xl border border-line bg-card p-4" aria-labelledby="role-notification-title">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-accent">
            <BellRing size={16} aria-hidden="true" />
            <p className="text-[0.68rem] font-black uppercase tracking-[0.14em]">ROLE ALERTS</p>
          </div>
          <h2 id="role-notification-title" className="mt-1 text-sm font-black text-fg">
            내 직무 알림
          </h2>
          <p className="mt-1 text-xs leading-5 text-fg-2">
            담당 작업, 마감, 차단과 인계 상태를 현재 프로젝트 알림 강도에 맞춰 모았습니다.
          </p>
        </div>
        <span className="rounded-full border border-line bg-panel px-2.5 py-1 text-[0.68rem] font-bold text-fg-2">
          {notifications.length}건
        </span>
      </header>
      {notifications.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-line bg-panel/45 px-4 py-5 text-center">
          <Info className="mx-auto size-5 text-good" aria-hidden="true" />
          <p className="mt-2 text-xs font-bold text-fg">지금 바로 확인할 직무 알림이 없습니다</p>
          <p className="mt-1 text-[0.7rem] leading-5 text-fg-3">
            새 담당 작업이나 인계 요청이 생기면 여기에 표시됩니다.
          </p>
        </div>
      ) : (
        <ol className="mt-4 space-y-2">
          {notifications.map((notification) => {
            const Icon = notification.tone === "danger"
              ? CircleAlert
              : notification.tone === "warning"
                ? Clock3
                : Info;
            return (
              <li
                key={notification.id}
                className={cn(
                  "rounded-xl border px-3 py-2.5",
                  notification.tone === "danger"
                    ? "border-bad/30 bg-bad/10"
                    : notification.tone === "warning"
                      ? "border-warn/30 bg-warn/10"
                      : "border-line bg-panel",
                )}
              >
                <div className="flex items-start gap-2.5">
                  <Icon
                    size={15}
                    className={cn(
                      "mt-0.5 shrink-0",
                      notification.tone === "danger"
                        ? "text-bad"
                        : notification.tone === "warning"
                          ? "text-warn"
                          : "text-accent",
                    )}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="break-words text-xs font-black text-fg">{notification.title}</p>
                    <p className="mt-1 break-words text-[0.7rem] leading-5 text-fg-2">
                      {notification.detail}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
