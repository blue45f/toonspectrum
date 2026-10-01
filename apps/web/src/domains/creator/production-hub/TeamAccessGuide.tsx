import { FREE_USAGE_POLICY, type TeamWorkspaceRole } from "@toonstudio/contracts/production-workspace";
import { Check, Crown, Link2, LogIn, ShieldCheck, UserCheck, UserPlus, Users, X, type LucideIcon } from "lucide-react";

import type { BilingualLabel } from "./production-labels";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

interface RoleGuide {
  readonly role: TeamWorkspaceRole;
  readonly icon: LucideIcon;
  readonly label: BilingualLabel;
  readonly summary: BilingualLabel;
  readonly can: readonly BilingualLabel[];
  readonly cannot: readonly BilingualLabel[];
}

/** 팀(워크스페이스) 역할. 서버가 강제하는 네 단계만 설명하고, 작품 권한은 따로 받는다는 점을 함께 알린다. */
const TEAM_ROLE_GUIDES: readonly RoleGuide[] = Object.freeze([
  {
    role: "owner",
    icon: Crown,
    label: { ko: "소유자", en: "Owner" },
    summary: { ko: "팀을 만든 사람입니다. 팀마다 한 명이에요.", en: "The person who created the team. One per team." },
    can: [
      { ko: "팀 이름·구성원·초대·작품 연결 관리", en: "Manage name, members, invites and linked projects" },
      { ko: "관리자 초대, 소유권 이전", en: "Invite admins and transfer ownership" },
    ],
    cannot: [{ ko: "팀 연결만으로 작품 소유권을 바꾸지 않아요", en: "Linking a team never changes project ownership" }],
  },
  {
    role: "admin",
    icon: ShieldCheck,
    label: { ko: "관리자", en: "Admin" },
    summary: { ko: "소유자와 함께 팀을 운영합니다.", en: "Runs the team together with the owner." },
    can: [
      { ko: "구성원 초대·제외, 역할 변경", en: "Invite or remove members and change roles" },
      { ko: "작품 연결·해제, 사용량 확인", en: "Link projects and check usage" },
    ],
    cannot: [{ ko: "다른 관리자 초대·소유권 이전은 소유자만", en: "Only the owner invites admins or transfers ownership" }],
  },
  {
    role: "member",
    icon: Users,
    label: { ko: "멤버", en: "Member" },
    summary: { ko: "팀에 소속되어 함께 일하는 사람입니다.", en: "Works with the team as a member." },
    can: [
      { ko: "팀 구성원과 연결된 작품 목록 보기", en: "See members and linked projects" },
      { ko: "작품 권한을 받으면 원고 편집·검토", en: "Edit or review pages once given project access" },
    ],
    cannot: [{ ko: "팀 소속만으로는 원고를 열 수 없어요", en: "Team membership alone doesn't open manuscripts" }],
  },
  {
    role: "guest",
    icon: UserCheck,
    label: { ko: "게스트", en: "Guest" },
    summary: { ko: "초대 링크로 잠깐 참여하는 외부 사람입니다.", en: "An outside person joining through an invite link." },
    can: [{ ko: "허락받은 작품·검수본만 보기", en: "See only the projects and reviews shared with them" }],
    cannot: [
      { ko: "구성원 목록 보기", en: "See the member list" },
      { ko: "다른 사람 초대", en: "Invite others" },
    ],
  },
]);

const INVITE_STEPS: readonly { readonly icon: LucideIcon; readonly title: BilingualLabel; readonly detail: BilingualLabel }[] = [
  {
    icon: Users,
    title: { ko: "팀 만들기", en: "Create a team" },
    detail: { ko: "팀(워크스페이스)을 만들고 함께 운영할 작품을 연결합니다.", en: "Create a workspace and link the projects you run together." },
  },
  {
    icon: Link2,
    title: { ko: "역할 고르고 초대 링크 만들기", en: "Pick a role, create a link" },
    detail: { ko: "이메일은 자동으로 보내지 않아요. 만든 링크를 복사해 직접 전달하세요. 7일 동안 유효합니다.", en: "No email is sent. Copy the link and share it yourself. Valid for 7 days." },
  },
  {
    icon: LogIn,
    title: { ko: "같은 이메일로 로그인해 수락", en: "Accept with the same email" },
    detail: { ko: "초대받은 이메일 계정만 수락할 수 있어요. 원고 권한은 작품별로 따로 받습니다.", en: "Only the invited email can accept. Manuscript access is granted per project." },
  },
];

/**
 * 팀·권한 안내. 역할을 "무엇을 할 수 있는지"로 설명하고, 초대 순서와 무료 이용 기준을 보여 준다.
 * 이용 기준 숫자는 공유 계약의 무료 운영 정책(FREE_USAGE_POLICY)에서 그대로 가져온다.
 */
export function TeamAccessGuide({ className }: { readonly className?: string }) {
  const bt = useBilingual("TeamAccessGuide");
  const limits = [
    { label: bt("내가 만들 수 있는 팀", "Teams you can own"), value: bt(`${FREE_USAGE_POLICY.ownedWorkspaces}개`, `${FREE_USAGE_POLICY.ownedWorkspaces}`) },
    { label: bt("팀당 연결 작품", "Projects per team"), value: bt(`${FREE_USAGE_POLICY.projectsPerWorkspace}개`, `${FREE_USAGE_POLICY.projectsPerWorkspace}`) },
    { label: bt("팀당 구성원(대기 초대 포함)", "Members per team (incl. pending)"), value: bt(`${FREE_USAGE_POLICY.membersPerWorkspace}명`, `${FREE_USAGE_POLICY.membersPerWorkspace}`) },
    { label: bt("동시에 열어 둘 공유 링크", "Active share links"), value: bt(`${FREE_USAGE_POLICY.activeShares}개`, `${FREE_USAGE_POLICY.activeShares}`) },
  ];
  return (
    <div className={cn("space-y-5", className)} data-team-access-guide="true">
      <section aria-labelledby="team-role-guide-title">
        <h2 id="team-role-guide-title" className="text-base font-black text-fg">{bt("역할별로 할 수 있는 일", "What each role can do")}</h2>
        <p className="mt-1 text-xs leading-5 text-fg-2">
          {bt("팀 역할은 네 가지입니다. 원고를 보고 고치는 권한은 작품마다 따로 정해요.", "There are four team roles. Viewing and editing pages is set per project.")}
        </p>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {TEAM_ROLE_GUIDES.map((guide) => {
            const Icon = guide.icon;
            return (
              <li key={guide.role} className="flex flex-col rounded-2xl border border-line bg-card p-4">
                <span className="flex items-center gap-2">
                  <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent"><Icon className="size-4" aria-hidden="true" /></span>
                  <strong className="text-sm text-fg">{bt(guide.label.ko, guide.label.en)}</strong>
                </span>
                <p className="mt-2 text-xs leading-5 text-fg-2">{bt(guide.summary.ko, guide.summary.en)}</p>
                <ul className="mt-3 space-y-1.5 text-xs leading-5">
                  {guide.can.map((item) => (
                    <li key={item.ko} className="flex gap-1.5 text-fg">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-good" aria-hidden="true" />
                      <span><span className="sr-only">{bt("가능:", "Can:")} </span>{bt(item.ko, item.en)}</span>
                    </li>
                  ))}
                  {guide.cannot.map((item) => (
                    <li key={item.ko} className="flex gap-1.5 text-fg-3">
                      <X className="mt-0.5 size-3.5 shrink-0 text-bad" aria-hidden="true" />
                      <span><span className="sr-only">{bt("불가:", "Cannot:")} </span>{bt(item.ko, item.en)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section aria-labelledby="team-invite-steps-title" className="rounded-2xl border border-line bg-card p-4">
          <h2 id="team-invite-steps-title" className="flex items-center gap-2 text-sm font-black text-fg">
            <UserPlus className="size-4 text-accent" aria-hidden="true" />
            {bt("초대는 이렇게 진행돼요", "How inviting works")}
          </h2>
          <ol className="mt-3 grid gap-2 md:grid-cols-3">
            {INVITE_STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <li key={step.title.ko} className="rounded-xl border border-line bg-panel p-3">
                  <span className="flex items-center gap-2 text-xs font-black text-accent">
                    <span className="grid size-6 place-items-center rounded-full bg-accent text-on-accent">{index + 1}</span>
                    <Icon className="size-3.5" aria-hidden="true" />
                  </span>
                  <p className="mt-2 text-xs font-bold text-fg">{bt(step.title.ko, step.title.en)}</p>
                  <p className="mt-1 text-[0.6875rem] leading-5 text-fg-2">{bt(step.detail.ko, step.detail.en)}</p>
                </li>
              );
            })}
          </ol>
        </section>
        <section aria-labelledby="team-limits-title" className="rounded-2xl border border-line bg-card p-4">
          <h2 id="team-limits-title" className="text-sm font-black text-fg">{bt("무료 이용 기준", "Free plan limits")}</h2>
          <dl className="mt-3 grid grid-cols-2 gap-2">
            {limits.map((limit) => (
              <div key={limit.label} className="rounded-xl border border-line bg-panel p-3">
                <dt className="text-[0.6875rem] leading-4 text-fg-3">{limit.label}</dt>
                <dd className="mt-1 text-lg font-black text-fg">{limit.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[0.6875rem] leading-5 text-fg-3">
            {bt("한도를 넘어도 기존 자료를 자동으로 지우지 않습니다. 원고 저장 용량은 아직 측정하지 않습니다.", "Going over never deletes existing data. Manuscript storage isn't metered yet.")}
          </p>
        </section>
      </div>
    </div>
  );
}
