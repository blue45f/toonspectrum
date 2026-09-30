import "../studio-shell/creator-workflow-surfaces.css";
import type { EffectiveOperationPolicy } from "@toonstudio/contracts/operation-policy";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { isWorkspaceManager, type InvitableWorkspaceRole, type TeamWorkspaceCommandInput,
  type TeamWorkspaceDetail, type TeamWorkspaceSummary, type WorkspaceUsageResponse } from "@toonstudio/contracts/production-workspace";
import { useApp } from "@/shared/lib/store";
import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { getApiErrorMessage } from "@/platform/api";
import { TeamAreaNavigation } from "@/shared/components/TeamAreaNavigation";
import { normalizeCollaborationOnboardingCandidate, readCollaborationOnboardingCandidate, type CollaborationOnboardingCandidate } from "@/shared/lib/collaboration-onboarding";
import { inviteStudioTeamMember, type StudioTeamAssignableRole } from "../studio-team-client";
import { listProductionProjects, type ProductionProjectSummary } from "./production-dashboard-api";
import { getEffectiveOperationPolicy, acceptTeamInvite, commandTeamWorkspace, createTeamWorkspace, getTeamUsage, getTeamWorkspace, listTeamWorkspaces } from "./team-workspace-api";
import { PRODUCTION_ROLE_PRESETS, productionRolePreset, type ProductionRolePreset } from "./production-manuscript-competitive-model";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  createStudioSpatialInviteFragment,
  parseStudioSpatialInviteFragment,
  studioSpatialInviteDestination,
  type StudioSpatialInviteContext,
} from "../virtual-space/studio-spatial-invite-context";

interface BilingualCopy {
  readonly ko: string;
  readonly en: string;
}

const ROLE_LABELS: Record<"owner" | "admin" | "member" | "guest", BilingualCopy> = {
  owner: { ko: "소유자", en: "Owner" },
  admin: { ko: "관리자", en: "Admin" },
  member: { ko: "구성원", en: "Member" },
  guest: { ko: "게스트", en: "Guest" },
};

/** 6단계 세분 역할. 워크스페이스 서버 계약(@toonstudio/contracts/production-workspace)이 아는
 *  역할은 owner/admin/member/guest 4개뿐이므로, 편집자·검수자·뷰어는 워크스페이스 초대 시
 *  서버 역할 member 로 매핑해 전송한다(워크스페이스 차원 서버 강제 없음). 세분 구분은
 *  작품별 권한 초대(projectRole)에서 서버가 강제한다. */
export type WorkspaceRoleTierId = "admin" | "editor" | "commenter" | "viewer" | "guest-link";
interface WorkspaceRoleTier {
  readonly id: WorkspaceRoleTierId;
  readonly label: BilingualCopy;
  readonly summary: BilingualCopy;
  /** 서버가 실제로 적용하는 워크스페이스 역할. */
  readonly serverRole: InvitableWorkspaceRole;
  /** 작품별 초대 시 기본으로 제안하는 세분 역할(작품 서버에서 강제). */
  readonly projectRole: StudioTeamAssignableRole;
  readonly workspaceEnforced: boolean;
}
const WORKSPACE_ROLE_TIERS: readonly WorkspaceRoleTier[] = [
  { id: "admin", label: { ko: "관리자", en: "Admin" }, summary: { ko: "팀 설정·초대·구성원 관리를 할 수 있습니다.", en: "Can manage team settings, invites, and members." }, serverRole: "admin", projectRole: "admin", workspaceEnforced: true },
  { id: "editor", label: { ko: "편집자(원고 수정)", en: "Editor (edit manuscripts)" }, summary: { ko: "원고를 수정하고 검수에 제출할 수 있습니다.", en: "Can edit manuscripts and submit them for review." }, serverRole: "member", projectRole: "editor", workspaceEnforced: false },
  { id: "commenter", label: { ko: "검수자(코멘트만)", en: "Reviewer (comments only)" }, summary: { ko: "원고는 수정하지 않고 코멘트만 남길 수 있습니다.", en: "Can only leave comments, not edit manuscripts." }, serverRole: "member", projectRole: "commenter", workspaceEnforced: false },
  { id: "viewer", label: { ko: "뷰어(열람만)", en: "Viewer (read-only)" }, summary: { ko: "원고를 열람만 할 수 있습니다.", en: "Can only view manuscripts." }, serverRole: "member", projectRole: "viewer", workspaceEnforced: false },
  { id: "guest-link", label: { ko: "게스트(링크)", en: "Guest (link)" }, summary: { ko: "초대 링크로 참여하는 외부 인원입니다.", en: "External participant joining via an invite link." }, serverRole: "guest", projectRole: "commenter", workspaceEnforced: true },
];
const EDITOR_WORKSPACE_ROLE_TIER: WorkspaceRoleTier = WORKSPACE_ROLE_TIERS.find((tier) => tier.id === "editor")
  ?? { id: "editor", label: { ko: "편집자(원고 수정)", en: "Editor (edit manuscripts)" }, summary: { ko: "원고를 수정하고 검수에 제출할 수 있습니다.", en: "Can edit manuscripts and submit them for review." }, serverRole: "member", projectRole: "editor", workspaceEnforced: false };
function workspaceRoleTier(id: string): WorkspaceRoleTier {
  return WORKSPACE_ROLE_TIERS.find((tier) => tier.id === id) ?? EDITOR_WORKSPACE_ROLE_TIER;
}
function tierFromPreset(preset: ProductionRolePreset): WorkspaceRoleTier {
  if (preset.workspaceRole === "admin") return workspaceRoleTier("admin");
  if (preset.workspaceRole === "guest") return workspaceRoleTier("guest-link");
  if (preset.projectRole === "commenter") return workspaceRoleTier("commenter");
  if (preset.projectRole === "viewer") return workspaceRoleTier("viewer");
  return workspaceRoleTier("editor");
}
/** 프리셋별 담당 공정 범위. 공정 단위 편집 제한은 서버 강제 계약이 없어 미리보기로 표시한다. */
const PRESET_PROCESS_SCOPE: Record<ProductionRolePreset["id"], BilingualCopy> = {
  producer: { ko: "전체 공정", en: "Full pipeline" },
  writer: { ko: "대본 공정", en: "Script stage" },
  storyboard: { ko: "콘티·연출 공정", en: "Storyboard & directing" },
  "line-art": { ko: "선화 공정", en: "Line-art stage" },
  color: { ko: "채색 공정", en: "Coloring stage" },
  lettering: { ko: "식자·현지화 공정", en: "Lettering & localization" },
  "external-reviewer": { ko: "고정 검수본", en: "Fixed review copy" },
};
/** 제작 역할 프리셋 이름. 공유 계약(ko)은 수정하지 않고 페이지에서만 영문을 매핑한다. */
const PRESET_LABELS_EN: Record<ProductionRolePreset["id"], string> = {
  producer: "PD · Editor",
  writer: "Story writer",
  storyboard: "Storyboard artist",
  "line-art": "Line artist",
  color: "Colorist",
  lettering: "Lettering & localization",
  "external-reviewer": "External reviewer",
};
/** 작품별 부여 가능 역할. */
const ASSIGNABLE_ROLE_LABELS: Record<StudioTeamAssignableRole, BilingualCopy> = {
  admin: { ko: "관리자", en: "Admin" },
  editor: { ko: "편집자", en: "Editor" },
  commenter: { ko: "검토자", en: "Reviewer" },
  viewer: { ko: "열람자", en: "Viewer" },
};
function TierEnforcementNote({ tier }: { tier: WorkspaceRoleTier }) {
  const bt = useBilingual("TeamWorkspacePage");
  return <p className="mt-2 text-xs leading-6 text-fg-3">
    {tier.workspaceEnforced
      ? bt(`선택한 역할(${tier.label.ko})은 워크스페이스 서버에서 강제됩니다.`, `The selected role (${tier.label.en}) is enforced by the workspace server.`)
      : bt(`선택한 역할(${tier.label.ko})은 워크스페이스 서버에 '${ROLE_LABELS[tier.serverRole].ko}'로 등록됩니다(워크스페이스 차원 서버 강제 없음). 작품 권한을 함께 초대하면 세분 역할이 작품 단위로 서버에서 강제됩니다.`, `The selected role (${tier.label.en}) registers as “${ROLE_LABELS[tier.serverRole].en}” on the workspace server (not server-enforced at the workspace level). Inviting with project permissions enforces the granular role per project on the server.`)}
  </p>;
}
const fieldClass = "min-h-11 rounded-lg border border-line bg-canvas px-3 text-fg";
function Card({ title, children }: { title: string; children: ReactNode }) {
  return <section className="creator-workflow-panel rounded-2xl border border-line bg-card p-5"><h2 className="mb-4 text-lg font-bold">{title}</h2>{children}</section>;
}
function roleValue(value: string): InvitableWorkspaceRole { return value === "admin" || value === "guest" ? value : "member"; }
function UsageCard({ usage }: { usage: WorkspaceUsageResponse }) {
  const bt = useBilingual("TeamWorkspacePage");
  return <Card title={bt("사용량과 공통 이용 한도", "Usage and plan limits")}><dl className="grid gap-3 sm:grid-cols-3">
    <div><dt>{bt("소유 워크스페이스", "Owned workspaces")}</dt><dd>{usage.counters.ownedWorkspaces} / {usage.policy.ownedWorkspaces}</dd></div>
    <div><dt>{bt("연결한 작품", "Linked projects")}</dt><dd>{usage.counters.projects} / {usage.policy.projectsPerWorkspace}</dd></div>
    <div><dt>{bt("구성원·초대 예약", "Members & pending invites")}</dt><dd>{usage.counters.members} + {usage.counters.pendingInvites} / {usage.policy.membersPerWorkspace}</dd></div>
  </dl><p className="mt-4 text-sm text-fg-2">{usage.operationMode === "free" ? bt("현재 무료 운영입니다.", "Currently on the free plan.") : bt("유료 운영 정책이 적용되어 있습니다. 실제 결제는 아직 제공하지 않습니다.", "A paid policy is in effect. Actual billing is not available yet.")} {bt("한도 초과 시 기존 자료를 자동 삭제하지 않습니다.", "Exceeding a limit never auto-deletes your existing data.")}</p>
  <p className="mt-2 text-sm text-fg-2">{bt("원고 저장량 측정과 서버 변환량 연결은 준비 중입니다. 미측정 사용량을 0으로 표시하지 않습니다. 외부 유료 AI는 제공하지 않습니다.", "Manuscript storage metering and server conversion tracking are coming soon. Unmetered usage is not shown as zero. External paid AI is not offered.")}</p>
  <p className="mt-2 text-xs text-fg-3">{bt(`정책 ${usage.policy.version} / revision ${usage.policyRevision} · 기존 작품 권한은 유지합니다.`, `Policy ${usage.policy.version} / revision ${usage.policyRevision} · existing project permissions are kept.`)}</p></Card>;
}
export function TeamWorkspacePage() {
  const userId = useApp((state) => state.userId);
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { search } = useLocation();
  return <TeamWorkspaceConsole key={`${userId ?? "signed-out"}:${workspaceId ?? "list"}:${search}`} userId={userId} />;
}
function TeamWorkspaceConsole({ userId }: { userId: string | null }) {
  const bt = useBilingual("TeamWorkspacePage");
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const onboardingId = searchParams.get("onboard") ?? "";
  const [onboarding] = useState<CollaborationOnboardingCandidate | null>(() => {
    const state = location.state as { collaborationOnboarding?: unknown } | null;
    const fromState = normalizeCollaborationOnboardingCandidate(state?.collaborationOnboarding);
    if (fromState?.applicationId === onboardingId) return fromState;
    try { return readCollaborationOnboardingCandidate(sessionStorage, onboardingId); }
    catch { return null; }
  });
  const requestedPreset = searchParams.get("rolePreset") as ProductionRolePreset["id"] | null;
  const invitePreset = productionRolePreset(PRODUCTION_ROLE_PRESETS.some((preset) => preset.id === requestedPreset) ? requestedPreset! : "writer");
  const [operationPolicy, setOperationPolicy] = useState<EffectiveOperationPolicy | null>(null);
  const [items, setItems] = useState<readonly TeamWorkspaceSummary[]>([]);
  const [detail, setDetail] = useState<TeamWorkspaceDetail | null>(null);
  const [usage, setUsage] = useState<WorkspaceUsageResponse | null>(null);
  const [available, setAvailable] = useState<readonly ProductionProjectSummary[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [inviteTierId, setInviteTierId] = useState<WorkspaceRoleTierId>(() => tierFromPreset(invitePreset).id);
  const [inviteProjectWorkId, setInviteProjectWorkId] = useState("");
  const [inviteProjectRole, setInviteProjectRole] = useState<StudioTeamAssignableRole>("editor");
  const [inviteEntryKind, setInviteEntryKind] = useState<StudioSpatialInviteContext["kind"]>("team-lobby");
  const [inviteProjectId, setInviteProjectId] = useState("");
  const [onboardingProjectRole, setOnboardingProjectRole] = useState<StudioTeamAssignableRole>("editor");
  const [onboardingProjectInvited, setOnboardingProjectInvited] = useState(false);
  const [invitationLink, setInvitationLink] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => { const tier = tierFromPreset(invitePreset); setInviteTierId(tier.id); setInviteProjectRole(tier.projectRole); }, [invitePreset]);
  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    let active = true;
    setLoading(true); setError(""); setDetail(null); setUsage(null);
    void (async () => {
      const [list, activePolicy] = await Promise.all([listTeamWorkspaces(), getEffectiveOperationPolicy()]);
      if (!active) return;
      setItems(list.workspaces); setOperationPolicy(activePolicy);
      if (workspaceId) {
        const data = await getTeamWorkspace(workspaceId);
        if (!active) return;
        setDetail(data); setName(data.workspace.name);
        if (onboarding) {
          setEmail((current) => current || onboarding.email);
          const firstProject = data.projects[0];
          if (firstProject) {
            setInviteProjectId((current) => current || firstProject.workId);
            setInviteEntryKind("project-space");
          }
        }
        if (isWorkspaceManager(data.workspace.role)) {
          const [quota, projects] = await Promise.all([getTeamUsage(workspaceId), listProductionProjects()]);
          if (active) { setUsage(quota); setAvailable(projects.projects.filter((project) => project.access.owner)); }
        }
      }
    })().catch(async (cause: unknown) => { const message = await getApiErrorMessage(cause, bt("워크스페이스를 불러오지 못했습니다.", "Couldn't load the workspace.")); if (active) setError(message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bt, onboarding, userId, workspaceId, refresh]);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); setRefresh((value) => value + 1); }
    catch (cause) { setError(await getApiErrorMessage(cause, bt("저장하지 못했습니다. 새로고침 후 다시 확인해주세요.", "Couldn't save. Refresh and try again."))); }
    finally { setBusy(false); }
  }
  async function command(
    input: TeamWorkspaceCommandInput,
    entryOverride?: StudioSpatialInviteContext,
  ) {
    if (!detail) return;
    const result = await commandTeamWorkspace(detail.workspace.id, detail.workspace.revision, input);
    if (result.token) {
      const entryContext: StudioSpatialInviteContext = entryOverride ?? (inviteEntryKind === "project-space"
        ? { kind: "project-space", projectId: inviteProjectId }
        : inviteEntryKind === "interview-waiting"
          ? { kind: "interview-waiting" }
          : { kind: "team-lobby" });
      const fragment = createStudioSpatialInviteFragment(result.token, entryContext);
      setInvitationLink(`${window.location.origin}/team/people/join${fragment}`);
      setEmail("");
    } else if (result.invitationId) setNotice(bt("초대는 만들어졌지만 비밀 링크는 재표시하지 않습니다. 같은 이메일로 재발행해주세요.", "The invite was created but the secret link won't be shown again. Re-issue it for the same email."));
    else setNotice(bt("변경 내용이 저장되었습니다.", "Changes saved."));
    if (input.type === "remove-member" && input.userId === userId) navigate("/team/people");
  }
  const manager = detail && isWorkspaceManager(detail.workspace.role);
  const inviteTier = workspaceRoleTier(inviteTierId);
  const onboardingProject = detail?.projects.find((project) => project.workId === inviteProjectId) ?? null;
  async function inviteOnboardingProjectAccess() {
    if (!onboarding || !onboardingProject) return;
    await inviteStudioTeamMember(onboardingProject.workId, {
      identity: onboarding.userId,
      role: onboardingProjectRole,
    });
    setOnboardingProjectInvited(true);
    setNotice(bt(`${onboarding.name} 님에게 ${onboardingProject.title} 작품 권한 초대를 보냈습니다.`, `Sent a project-permission invite for ${onboardingProject.title} to ${onboarding.name}.`));
  }
  const onboardingRouteState = onboarding ? { collaborationOnboarding: onboarding } : undefined;
  return <div data-creator-workflow="team" data-route-ready="team-workspace" className="min-h-dvh bg-canvas px-4 py-6 text-fg">
    <div className="mx-auto max-w-6xl space-y-5"><TeamAreaNavigation />
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-line bg-panel p-5 sm:p-6">
      <div><p className="eyebrow text-accent">TEAM · PEOPLE & ACCESS</p><h1 className="mt-2 text-2xl font-black">{bt("사람·권한 관리", "People & access")}</h1><p className="mt-2 text-sm text-fg-2">{operationPolicy?.notice ?? bt("팀 소속과 프로젝트 접근 권한을 한 흐름에서 관리합니다.", "Manage team membership and project access in one flow.")}</p></div>
      <nav aria-label={bt("팀 관리", "Team management")} className="flex flex-wrap gap-3"><Link to="/team">{bt("협업 홈", "Collaboration home")}</Link><Link to="/team/people">{bt("전체 팀", "All teams")}</Link><Link to="/team/people/join">{bt("초대 수락", "Accept invite")}</Link></nav>
    </header>{error && <div role="alert" className="rounded-xl border border-bad p-4">{error}<button className="ml-3 underline" onClick={() => setRefresh((value) => value + 1)}>{bt("새로고침", "Refresh")}</button></div>}
    {notice && <p role="status">{notice}</p>}
    {operationPolicy && !operationPolicy.features["team-workspace"].enabled && <p role="status">{operationPolicy.features["team-workspace"].reason} {bt("기존 자료 조회와 접근 회수는 유지됩니다.", "Existing data reads and access recovery remain available.")}</p>}
    {!userId ? <Card title={bt("로그인이 필요합니다", "Sign-in required")}><p>{bt("로그인한 뒤 팀을 만들거나 초대받은 이메일로 참여해주세요.", "Sign in, then create a team or join with your invited email.")}</p><button type="button" className="underline" onClick={() => requestAuthModalOpen({ reason: "protected-action", source: "team-workspace", mode: "login" })}>{bt("로그인하기", "Sign in")}</button></Card> : <>
    {invitationLink && <Card title={bt("초대 링크가 준비되었습니다", "Invite link ready")}><p className="mb-2 text-sm">{bt("이메일은 발송되지 않았습니다. 지정한 수신자에게 직접 전달해주세요. 인증된 수신자만 수락할 수 있습니다.", "No email was sent. Share this directly with the recipient. Only a verified recipient can accept.")}</p>
      <input aria-label={bt("새 초대 링크", "New invite link")} readOnly value={invitationLink} className={`${fieldClass} w-full`} onFocus={(event) => event.currentTarget.select()} />
      <button className={`${buttonClass({ variant: "outline" })} mt-3`} onClick={() => { void navigator.clipboard.writeText(invitationLink).then(() => setNotice(bt("초대 링크를 복사했습니다.", "Invite link copied."))).catch(() => setError(bt("복사 권한이 없습니다. 링크를 선택해 직접 복사해주세요.", "No clipboard permission. Select the link and copy it manually."))); }}>{bt("초대 링크 복사", "Copy invite link")}</button>
      <button className="ml-4 underline" onClick={() => setInvitationLink("")}>{bt("링크 숨기기", "Hide link")}</button></Card>}
    {loading && <p role="status">{bt("워크스페이스를 불러오는 중입니다.", "Loading the workspace…")}</p>}
    {onboarding && !workspaceId && <Card title={bt(`${onboarding.name} 님 합류 설정`, `${onboarding.name} — join setup`)}>
      <p className="text-sm leading-7 text-fg-2">{bt("합류를 확정한 지원자입니다. 아래에서 소속시킬 팀을 선택하거나 새 워크스페이스를 만든 뒤, 팀 초대와 작품 권한을 같은 화면에서 설정하세요.", "This applicant confirmed joining. Pick a team below or create a workspace, then set team invites and project permissions on this screen.")}</p>
      <p className="mt-2 text-xs text-fg-3">{bt(`지원서 ${onboarding.applicationId} · 계정 ${onboarding.userId}`, `Application ${onboarding.applicationId} · account ${onboarding.userId}`)}</p>
    </Card>}
    {!workspaceId && <Card title={bt("내 워크스페이스", "My workspaces")}><div className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => <Link key={item.id} className="rounded-xl border border-line p-4 hover:bg-raised" to={`/team/people/${item.id}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`} state={onboardingRouteState}>
        <strong>{item.name}</strong><p className="mt-2 text-sm">{bt(ROLE_LABELS[item.role].ko, ROLE_LABELS[item.role].en)} · {bt(`접근 가능한 작품 ${item.projectCount}개 · 구성원 ${item.memberCount}명`, `${item.projectCount} accessible projects · ${item.memberCount} members`)}</p></Link>)}
      {!loading && items.length === 0 && <p>{bt("아직 참여한 팀이 없습니다. 새 팀을 만들거나 초대를 수락해주세요.", "No teams yet. Create one or accept an invite.")}</p>}</div>
      <form className="mt-5 flex flex-wrap gap-3" onSubmit={(event: FormEvent) => { event.preventDefault(); void run(async () => { const result = await createTeamWorkspace(name); navigate(`/team/people/${result.workspaceId}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`, { state: onboardingRouteState }); }); }}>
        <label className="flex flex-col gap-2">{bt("새 워크스페이스 이름", "New workspace name")}<input required maxLength={20} value={name} onChange={(event) => setName(event.target.value)} className={fieldClass} /></label>
        <button disabled={busy || !name.trim() || !operationPolicy?.features["team-workspace"].enabled} className={`${buttonClass()} self-end`} type="submit">{bt("워크스페이스 만들기", "Create workspace")}</button></form></Card>}
    {detail && <><Card title={detail.workspace.name}><p className="text-sm text-fg-2">{bt("현재 역할:", "Current role:")} {bt(ROLE_LABELS[detail.workspace.role].ko, ROLE_LABELS[detail.workspace.role].en)}</p>
      {manager && <form className="mt-4 flex flex-wrap gap-3" onSubmit={(event) => { event.preventDefault(); void run(() => command({ type: "rename", name })); }}>
        <label className="flex flex-col gap-2">{bt("팀 이름", "Team name")}<input required maxLength={20} value={name} onChange={(event) => setName(event.target.value)} className={fieldClass} /></label>
        <button type="submit" disabled={busy || !name.trim()} className={`${buttonClass({ variant: "outline" })} self-end`}>{bt("이름 저장", "Save name")}</button>
        <Link className="self-end underline" to={`/team/people/${detail.workspace.id}/usage`}>{bt("사용량 확인", "View usage")}</Link></form>}</Card>
    {manager && onboarding && <Card title={bt(`${onboarding.name} 님 프로젝트 합류`, `${onboarding.name} — project join`)}>
      <p className="text-sm leading-7 text-fg-2">{bt("채용 결과를 팀 소속, 작품 접근, 첫 작업으로 이어갑니다. 각 권한은 별도로 적용되며 이 화면에서 순서대로 완료할 수 있습니다.", "Carry hiring results into team membership, project access, and a first task. Each permission applies separately and can be completed in order on this screen.")}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-2 text-sm font-semibold">{bt("초대 이메일", "Invite email")}<input type="email" className={fieldClass} value={email} maxLength={320} placeholder={bt("지원자 이메일", "Applicant email")} onChange={(event) => setEmail(event.target.value)} /></label>
        <label className="flex flex-col gap-2 text-sm font-semibold">{bt("팀 역할", "Team role")}<select className={fieldClass} value={inviteTierId} onChange={(event) => setInviteTierId(workspaceRoleTier(event.target.value).id)}>
          {WORKSPACE_ROLE_TIERS.filter((tier) => tier.id !== "admin").map((tier) => <option key={tier.id} value={tier.id}>{bt(tier.label.ko, tier.label.en)}</option>)}
          {detail.workspace.role === "owner" && WORKSPACE_ROLE_TIERS.filter((tier) => tier.id === "admin").map((tier) => <option key={tier.id} value={tier.id}>{bt(tier.label.ko, tier.label.en)}</option>)}
        </select></label>
        <label className="flex flex-col gap-2 text-sm font-semibold">{bt("대상 작품", "Target project")}<select className={fieldClass} value={inviteProjectId} onChange={(event) => setInviteProjectId(event.target.value)}><option value="">{bt("작품 선택", "Select a project")}</option>{detail.projects.map((project) => <option key={project.id} value={project.workId}>{project.title}</option>)}</select></label>
        <label className="flex flex-col gap-2 text-sm font-semibold">{bt("작품 권한", "Project permission")}<select className={fieldClass} value={onboardingProjectRole} onChange={(event) => setOnboardingProjectRole(event.target.value as StudioTeamAssignableRole)}>{(Object.keys(ASSIGNABLE_ROLE_LABELS) as StudioTeamAssignableRole[]).map((role) => <option key={role} value={role}>{bt(ASSIGNABLE_ROLE_LABELS[role].ko, ASSIGNABLE_ROLE_LABELS[role].en)}</option>)}</select></label>
      </div>
      <TierEnforcementNote tier={inviteTier} />
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={busy || !email.trim()} className={buttonClass()} onClick={() => { void run(() => command({ type: "invite", email, role: inviteTier.serverRole }, onboardingProject ? { kind: "project-space", projectId: onboardingProject.workId } : { kind: "team-lobby" })); }}>{bt("1. 팀 초대 링크 만들기", "1. Create team invite link")}</button>
        <button type="button" disabled={busy || !onboardingProject || onboardingProjectInvited} className={buttonClass({ variant: "outline" })} onClick={() => { void run(inviteOnboardingProjectAccess); }}>{onboardingProjectInvited ? bt("2. 작품 권한 초대 완료", "2. Project-permission invite sent") : bt("2. 작품 권한 초대", "2. Send project-permission invite")}</button>
        {onboardingProject && <Link className={buttonClass({ variant: "outline" })} to={`/production/projects/${onboardingProject.id}/production`}>{bt("3. 첫 작업 배정", "3. Assign first task")}</Link>}
      </div>
      {!onboarding.email && <p className="mt-3 text-xs text-warn">{bt("지원 연락처가 이메일 형식이 아닙니다. 팀 초대 이메일을 확인해 입력해 주세요. 작품 권한 초대는 계정 ID로 보낼 수 있습니다.", "The applicant contact isn't an email address. Enter a team invite email. Project-permission invites can use the account ID.")}</p>}
      <p className="mt-3 text-xs leading-6 text-fg-3">{bt("팀 소속만으로 원고 접근 권한이 생기지 않습니다. 작품 권한 초대를 수락한 뒤 제작 보드에서 실제 담당 역할과 작업을 배정하세요.", "Team membership alone doesn't grant manuscript access. After the project-permission invite is accepted, assign real roles and tasks on the production board.")}</p>
    </Card>}
    <Card title={bt("연결한 제작 프로젝트", "Linked projects")}><p className="mb-3 text-sm text-fg-2">{bt("팀 연결은 작품 열람 권한을 자동으로 부여하지 않습니다. 작품별 기존 구성원·비공개 원고 권한을 유지합니다.", "Linking a team doesn't auto-grant project view permissions. Existing per-project members and private manuscript permissions are kept.")}</p>
      <ul className="space-y-3">{detail.projects.map((project) => <li key={project.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-3">
        <Link className="font-semibold underline" to={`/production/projects/${project.id}/overview`}>{project.title}</Link>
        {manager && <button disabled={busy} onClick={() => { if (window.confirm(bt("팀 연결만 해제합니다. 작품과 작품 권한은 유지됩니다.", "This only unlinks the team. The project and its permissions stay."))) void run(() => command({ type: "detach-project", projectId: project.id })); }} className={buttonClass({ variant: "outline", size: "sm" })}>{bt("연결 해제", "Unlink")}</button>}</li>)}</ul>
      {detail.projects.length === 0 && <p className="text-sm">{bt("접근 가능한 연결 작품이 없습니다.", "No linked projects you can access.")}</p>}
      {manager && <div className="mt-4"><label className="flex flex-col gap-2">{bt("소유한 프로젝트 연결", "Link an owned project")}<select aria-label={bt("연결할 프로젝트", "Project to link")} className={fieldClass} disabled={busy} value="" onChange={(event) => { const projectId = event.target.value; if (projectId) void run(() => command({ type: "attach-project", projectId })); }}>
        <option value="">{bt("기존 프로젝트 선택", "Choose an existing project")}</option>{available.filter((item) => !detail.projects.some((project) => project.id === item.projectId)).map((project) => <option key={project.projectId} value={project.projectId}>{project.title}</option>)}</select></label>
        <Link to="/studio" className="mt-3 inline-block underline">{bt("작품 라이브러리·작품별 권한 관리", "Project library & per-project permissions")}</Link></div>}</Card>
    {detail.workspace.role !== "guest" && <Card title={bt("구성원", "Members")}><ul className="space-y-3">{detail.members.map((member) => <li key={member.userId} className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3">
      <strong className="mr-auto">{member.displayName}</strong><span>{bt(ROLE_LABELS[member.role].ko, ROLE_LABELS[member.role].en)}</span>
      {manager && member.role !== "owner" && (detail.workspace.role === "owner" || member.role !== "admin") && <>
        <select aria-label={bt(`${member.displayName} 역할`, `${member.displayName} — role`)} disabled={busy} value={member.role} className={fieldClass} onChange={(event) => { const role = roleValue(event.target.value); void run(() => command({ type: "change-member-role", userId: member.userId, role })); }}>
          {detail.workspace.role === "owner" && <option value="admin">{bt(ROLE_LABELS.admin.ko, ROLE_LABELS.admin.en)}</option>}<option value="member">{bt(ROLE_LABELS.member.ko, ROLE_LABELS.member.en)}</option><option value="guest">{bt(ROLE_LABELS.guest.ko, ROLE_LABELS.guest.en)}</option></select>
        <button disabled={busy} className={buttonClass({ variant: "outline", size: "sm" })} onClick={() => { if (window.confirm(bt("팀에서 제외합니다. 별도로 부여한 작품 권한은 작품 설정에서 관리해주세요.", "Removes them from the team. Project permissions granted separately are managed in project settings."))) void run(() => command({ type: "remove-member", userId: member.userId })); }}>{bt("팀에서 제외", "Remove from team")}</button>
        {detail.workspace.role === "owner" && <button disabled={busy} className="underline" onClick={() => { if (window.confirm(bt(`${member.displayName}에게 팀 소유권을 이전할까요? 작품 소유권은 바뀌지 않습니다.`, `Transfer team ownership to ${member.displayName}? Project ownership stays unchanged.`))) void run(() => command({ type: "transfer-owner", userId: member.userId })); }}>{bt("소유권 이전", "Transfer ownership")}</button>}
      </>}</li>)}</ul><p className="mt-3 text-xs text-fg-3">{bt("표시된 역할은 워크스페이스 서버가 강제하는 4단계(소유자·관리자·구성원·게스트)입니다. 세분 역할(편집자·검수자·뷰어)은 워크스페이스 서버 계약에 없어 작품별 권한에서 서버가 강제합니다.", "Shown roles are the four tiers the workspace server enforces (owner, admin, member, guest). Granular roles (editor, reviewer, viewer) aren't in the workspace server contract — they're enforced per project.")}</p></Card>}
    {manager && <Card title={bt("구성원 초대", "Invite members")}><div className="mb-4 rounded-xl border border-line bg-raised p-3">
      <p className="text-xs font-bold text-fg-2">{bt("제작 역할 프리셋 · 실제 워크스페이스 역할과 가능한 행동을 초대 전에 확인합니다.", "Production role preset · check the actual workspace role and allowed actions before inviting.")}</p>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">{PRODUCTION_ROLE_PRESETS.map((preset) => <button key={preset.id} type="button" aria-pressed={invitePreset.id === preset.id} className={`min-h-11 shrink-0 rounded-lg border px-3 text-xs font-bold ${invitePreset.id === preset.id ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-2"}`} onClick={() => { const next = new URLSearchParams(searchParams); next.set("rolePreset", preset.id); setSearchParams(next, { replace: true }); const tier = tierFromPreset(preset); setInviteTierId(tier.id); setInviteProjectRole(tier.projectRole); }}>{bt(preset.label, PRESET_LABELS_EN[preset.id])}</button>)}</div>
      <p className="mt-2 text-xs text-fg-2">{bt("허용:", "Allowed:")} {invitePreset.allowedActions.join(" · ")}</p>
      <p className="mt-1 text-xs text-fg-3">{bt("차단·별도 승인:", "Blocked / needs approval:")} {invitePreset.blockedActions.join(" · ")}</p>
      <p className="mt-1 text-xs text-fg-2">{bt(`공정 범위: ${PRESET_PROCESS_SCOPE[invitePreset.id].ko}`, `Process scope: ${PRESET_PROCESS_SCOPE[invitePreset.id].en}`)} {bt("· 서버 강제 없음(프리셋 미리보기)", "· not server-enforced (preset preview)")}</p>
      <p className="mt-1 text-[0.6875rem] text-fg-3">{bt("프리셋의 프로젝트 역할·공정 범위는 미리보기이며 이 화면에서 서버가 강제하지 않습니다. 이 초대는 워크스페이스 역할만 적용하며 작품별 권한을 자동으로 넓히지 않습니다.", "Preset project roles and process scopes are previews and aren't enforced by the server on this screen. This invite only applies the workspace role — it doesn't widen per-project permissions.")}</p>
    </div><form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); void run(async () => {
        await command({ type: "invite", email, role: inviteTier.serverRole });
        if (inviteProjectWorkId) {
          try {
            await inviteStudioTeamMember(inviteProjectWorkId, { identity: email.trim(), role: inviteProjectRole });
          } catch {
            // 팀 초대는 이미 끝난 상태이므로 실패를 부분 성공으로 안내하고 run 의 공통 오류로 덮지 않는다.
            setNotice(bt("팀 초대는 만들었지만 작품 권한 초대에 실패했습니다. 작품 설정에서 권한을 다시 부여해 주세요.", "Team invite created, but the project-permission invite failed. Grant it again in project settings."));
            return;
          }
          setNotice(bt("팀 초대와 작품 권한 초대를 함께 만들었습니다. 작품 세분 역할은 작품 서버에서 강제됩니다.", "Created both the team invite and the project-permission invite. The granular project role is enforced by the project server."));
        }
      }); }}>
      <label className="flex flex-col gap-2">{bt("초대받을 이메일", "Invitee email")}<input type="email" required maxLength={320} className={fieldClass} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label className="flex flex-col gap-2">{bt("초대 역할", "Invite role")}<select className={fieldClass} value={inviteTierId} onChange={(event) => { const tier = workspaceRoleTier(event.target.value); setInviteTierId(tier.id); setInviteProjectRole(tier.projectRole); }}>
        {WORKSPACE_ROLE_TIERS.filter((tier) => detail.workspace.role === "owner" || tier.id !== "admin").map((tier) => <option key={tier.id} value={tier.id}>{bt(tier.label.ko, tier.label.en)}</option>)}
      </select></label>
      <TierEnforcementNote tier={inviteTier} />
      <label className="flex flex-col gap-2">{bt("작품 권한 함께 부여(선택)", "Grant project permission too (optional)")}<select className={fieldClass} value={inviteProjectWorkId} onChange={(event) => setInviteProjectWorkId(event.target.value)}>
        <option value="">{bt("부여하지 않음", "Don't grant")}</option>{detail.projects.map((project) => <option key={project.id} value={project.workId}>{project.title}</option>)}
      </select></label>
      {inviteProjectWorkId && <label className="flex flex-col gap-2">{bt("작품 역할(작품 서버에서 강제)", "Project role (server-enforced)")}<select className={fieldClass} value={inviteProjectRole} onChange={(event) => setInviteProjectRole(event.target.value as StudioTeamAssignableRole)}>
        {(Object.keys(ASSIGNABLE_ROLE_LABELS) as StudioTeamAssignableRole[]).map((role) => <option key={role} value={role}>{bt(ASSIGNABLE_ROLE_LABELS[role].ko, ASSIGNABLE_ROLE_LABELS[role].en)}</option>)}
      </select></label>}
      <label className="flex flex-col gap-2">{bt("수락 후 입장 안내", "Landing after accept")}<select className={fieldClass} value={inviteEntryKind}
        onChange={(event) => setInviteEntryKind(event.target.value === "project-space" || event.target.value === "interview-waiting" ? event.target.value : "team-lobby")}>
        <option value="team-lobby">{bt("팀 로비", "Team lobby")}</option><option value="project-space">{bt("프로젝트 협업 공간", "Project space")}</option><option value="interview-waiting">{bt("면접·협업 대기실", "Interview waiting room")}</option>
      </select></label>
      {inviteEntryKind === "project-space" && <label className="flex flex-col gap-2">{bt("입장할 프로젝트", "Project to join")}<select required className={fieldClass} value={inviteProjectId} onChange={(event) => setInviteProjectId(event.target.value)}>
        <option value="">{bt("프로젝트 선택", "Select a project")}</option>{detail.projects.map((project) => <option key={project.id} value={project.workId}>{project.title}</option>)}
      </select></label>}
      <button type="submit" disabled={busy || !email.trim() || (inviteEntryKind === "project-space" && !inviteProjectId)} className={buttonClass()}>{bt("초대 링크 만들기", "Create invite link")}</button></form>
      <p className="mt-3 text-sm text-fg-2">{bt("7일간 유효하며 대기 초대도 구성원 한도에 포함됩니다. 같은 이메일로 재발행하면 이전 링크는 무효가 됩니다. 이메일은 자동 발송하지 않습니다. 입장 안내는 이동 목적지만 전달하며 프로젝트 권한을 새로 부여하지 않습니다.", "Valid for 7 days; pending invites count toward the member limit. Re-issuing for the same email invalidates the old link. No email is auto-sent. The landing guide only sets the destination — it doesn't grant project permissions.")}</p>
      <ul className="mt-4 space-y-2">{detail.invites.map((invitation) => <li key={invitation.id} className="flex flex-wrap items-center gap-3"><span>{invitation.email} · {bt(ROLE_LABELS[invitation.role].ko, ROLE_LABELS[invitation.role].en)} · {bt("만료", "Expires")} {new Date(invitation.expiresAt).toLocaleDateString(bt("ko-KR", "en-US"))}</span>
        <button disabled={busy} className="underline" onClick={() => { void run(() => command({ type: "revoke-invite", invitationId: invitation.id })); }}>{bt("초대 취소", "Cancel invite")}</button></li>)}</ul></Card>}
    {usage && <UsageCard usage={usage} />}
    {detail.workspace.role !== "owner" && <button disabled={busy} className={buttonClass({ variant: "outline" })} onClick={() => { if (window.confirm(bt("이 워크스페이스에서 나갈까요? 별도의 작품 접근 권한은 유지됩니다.", "Leave this workspace? Your separate project access stays."))) void run(() => command({ type: "remove-member", userId })); }}>{bt("워크스페이스 나가기", "Leave workspace")}</button>}
    </>}</>}
    </div></div>;
}
export function TeamWorkspaceJoinPage() {
  const bt = useBilingual("TeamWorkspacePage");
  const userId = useApp((state) => state.userId);
  const navigate = useNavigate();
  const [token, setToken] = useState("");
  const [entryContext, setEntryContext] = useState<StudioSpatialInviteContext>({ kind: "team-lobby" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const parsed = parseStudioSpatialInviteFragment(window.location.hash);
    if (parsed.token) setToken(parsed.token);
    setEntryContext(parsed.context);
    if (window.location.hash) {
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    }
  }, []);
  return <div data-creator-workflow="team-join" data-route-ready="team-workspace-join" className="min-h-dvh bg-canvas px-4 py-8 text-fg"><div className="mx-auto max-w-xl space-y-4">
    <h1 className="text-2xl font-black">{bt("워크스페이스 초대 수락", "Accept workspace invite")}</h1><p>{bt("초대받은 이메일로 로그인하고 이메일 인증을 완료해주세요. 작품별 접근 권한은 별도로 적용됩니다.", "Sign in with your invited email and finish email verification. Per-project access applies separately.")}</p>
    {error && <p role="alert">{error}</p>}
    {!userId && <p>{bt("로그인 후 원래 초대 링크를 다시 열거나 초대 코드를 입력해주세요.", "After signing in, reopen the original invite link or enter the invite code.")} <button type="button" className="underline" onClick={() => requestAuthModalOpen({ reason: "protected-action", source: "team-workspace-invite", mode: "login" })}>{bt("로그인", "Sign in")}</button></p>}
    <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); setBusy(true); setError("");
      void acceptTeamInvite(token.trim()).then((result) => {
        setToken("");
        navigate(studioSpatialInviteDestination(entryContext, result.workspaceId), { replace: true });
      })
        .catch(async (cause: unknown) => setError(await getApiErrorMessage(cause, bt("초대를 수락하지 못했습니다.", "Couldn't accept the invite.")))).finally(() => setBusy(false)); }}>
      <label className="flex flex-col gap-2">{bt("초대 코드", "Invite code")}<input className={fieldClass} value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" spellCheck={false} maxLength={43} /></label>
      <button disabled={!userId || busy || !/^[A-Za-z0-9_-]{43}$/u.test(token.trim())} className={buttonClass()} type="submit">{bt("초대 수락하기", "Accept invite")}</button></form>
    <Link to="/team/people" className="inline-block underline">{bt("팀 목록으로", "Back to teams")}</Link>
  </div></div>;
}
