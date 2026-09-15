import { ArrowRight, ClipboardCheck, Handshake, Scale, Users } from "lucide-react";
import { Link } from "react-router-dom";

import { buttonClass } from "@/shared/components/ui/button-utils";

export function StudioProductionCocreatorBridgePanel({
  projectId,
  locale,
}: {
  readonly projectId: string;
  readonly locale: "ko" | "en";
}) {
  const korean = locale === "ko";
  const href = `/production/projects/${encodeURIComponent(projectId)}/overview`;
  return (
    <section className="rounded-2xl border border-accent/30 bg-accent-soft p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-accent">
            {korean ? "공동 창작 프로덕션" : "Co-creation production"}
          </p>
          <h2 className="mt-2 text-lg font-black tracking-tight text-fg">
            {korean ? "스토리·작화·검수·권리 정본을 한 흐름으로 관리" : "Manage story, art, review and rights in one lineage"}
          </h2>
          <p className="mt-2 text-xs leading-6 text-fg-2">
            {korean
              ? "StoryLock과 작화 인수인계, 역할별 승인, 발주 범위, 크레딧·보상까지 현재 프로젝트 ID를 유지한 채 이어집니다."
              : "Continue with StoryLock, art handoff, role-based approvals, procurement scope, credits and compensation while preserving the current project identity."}
          </p>
        </div>
        <Link className={buttonClass()} to={href}>
          {korean ? "프로덕션 허브 열기" : "Open production hub"}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[
          [Handshake, korean ? "Story → Art 인수인계" : "Story → Art handoff"],
          [ClipboardCheck, korean ? "lane별 공동 승인" : "Lane-based approval"],
          [Users, korean ? "역할·결정권 분리" : "Role and authority separation"],
          [Scale, korean ? "크레딧·권리·보상" : "Credits, rights and pay"],
        ].map(([Icon, label]) => {
          const ItemIcon = Icon as typeof Handshake;
          return (
            <div key={label as string} className="flex items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2.5 text-xs font-semibold text-fg">
              <ItemIcon className="size-4 text-accent" aria-hidden="true" />
              {label as string}
            </div>
          );
        })}
      </div>
    </section>
  );
}
