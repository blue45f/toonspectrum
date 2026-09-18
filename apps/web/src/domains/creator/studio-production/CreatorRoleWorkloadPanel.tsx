import { AlertTriangle, Gauge, UserRound, UsersRound } from "lucide-react";
import { useMemo } from "react";

import { creatorRoleWorkload } from "./creator-role-workload";
import type { ProductionWorkspace } from "./studio-production-workspace-runtime";

import type { CreatorWorkCapacity } from "@/shared/lib/creator-role-contract";
import { cn } from "@/shared/lib/utils";

export function CreatorRoleWorkloadPanel({
  workspace,
  currentUserId,
  capacity,
}: {
  readonly workspace: ProductionWorkspace;
  readonly currentUserId: string;
  readonly capacity: CreatorWorkCapacity;
}) {
  const summary = useMemo(
    () => creatorRoleWorkload(workspace, currentUserId, capacity),
    [capacity, currentUserId, workspace],
  );
  const limitLabel = capacity.maxConcurrentTasks === null
    ? "한도 미설정"
    : `${summary.currentUserOpenTasks}/${capacity.maxConcurrentTasks}건`;

  return (
    <section className="rounded-2xl border border-line bg-card p-4" aria-labelledby="role-workload-title">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-accent">
            <Gauge size={16} aria-hidden="true" />
            <p className="text-[0.68rem] font-black uppercase tracking-[0.14em]">WORKLOAD</p>
          </div>
          <h2 id="role-workload-title" className="mt-1 text-sm font-black text-fg">
            작업량과 병목
          </h2>
          <p className="mt-1 text-xs leading-5 text-fg-2">
            역할 배정과 미완료 작업을 기준으로 과부하와 담당자 공백을 확인합니다.
          </p>
        </div>
        <span className={cn(
          "rounded-full border px-2.5 py-1 text-[0.68rem] font-bold",
          summary.overloaded
            ? "border-bad/30 bg-bad/10 text-bad"
            : "border-line bg-panel text-fg-2",
        )}>
          내 작업 {limitLabel}
        </span>
      </header>
      {summary.overloaded || summary.unassignedTasks > 0 ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {summary.overloaded ? (
            <div className="rounded-xl border border-bad/30 bg-bad/10 p-3">
              <AlertTriangle size={15} className="text-bad" aria-hidden="true" />
              <p className="mt-2 text-xs font-black text-fg">내 동시 작업 한도를 넘었습니다</p>
              <p className="mt-1 text-[0.7rem] leading-5 text-fg-2">
                새 작업을 받기 전에 진행 중인 항목의 우선순위를 조정하세요.
              </p>
            </div>
          ) : null}
          {summary.unassignedTasks > 0 ? (
            <div className="rounded-xl border border-warn/30 bg-warn/10 p-3">
              <UsersRound size={15} className="text-warn" aria-hidden="true" />
              <p className="mt-2 text-xs font-black text-fg">담당자 없는 작업 {summary.unassignedTasks}건</p>
              <p className="mt-1 text-[0.7rem] leading-5 text-fg-2">
                마감 전에 실제 담당 역할과 참여자를 지정하세요.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-separate border-spacing-y-1 text-left text-xs">
          <thead>
            <tr className="text-fg-3">
              <th className="px-2 py-1 font-bold">참여자</th>
              <th className="px-2 py-1 font-bold">진행</th>
              <th className="px-2 py-1 font-bold">차단</th>
              <th className="px-2 py-1 font-bold">기한 초과</th>
              <th className="px-2 py-1 font-bold">48시간 내</th>
            </tr>
          </thead>
          <tbody>            {summary.members.length === 0 ? (
              <tr>
                <td colSpan={5} className="rounded-xl border border-dashed border-line px-3 py-5 text-center text-fg-3">
                  역할이 배정되면 참여자별 작업량을 표시합니다.
                </td>
              </tr>
            ) : summary.members.slice(0, 8).map((member) => (
              <tr key={member.key} className="bg-panel text-fg-2">
                <td className="rounded-l-xl px-2 py-2.5">
                  <span className="flex items-center gap-2 font-bold text-fg">
                    <UserRound size={13} aria-hidden="true" />
                    {member.displayName}
                    {member.memberId === currentUserId ? (
                      <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[0.62rem] text-accent">나</span>
                    ) : null}
                  </span>
                </td>
                <td className="px-2 py-2.5 font-bold">{member.openTasks}</td>
                <td className={cn("px-2 py-2.5 font-bold", member.blockedTasks > 0 && "text-bad")}>
                  {member.blockedTasks}
                </td>
                <td className={cn("px-2 py-2.5 font-bold", member.overdueTasks > 0 && "text-bad")}>
                  {member.overdueTasks}
                </td>
                <td className={cn("rounded-r-xl px-2 py-2.5 font-bold", member.dueSoonTasks > 0 && "text-warn")}>
                  {member.dueSoonTasks}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {capacity.weeklyHours || capacity.availabilityNote ? (
        <p className="mt-3 text-[0.68rem] leading-5 text-fg-3">
          내 작업 가능량: {capacity.weeklyHours ? `주 ${capacity.weeklyHours}시간` : "시간 미설정"}
          {capacity.availabilityNote ? ` · ${capacity.availabilityNote}` : ""}
        </p>
      ) : null}
    </section>
  );
}
