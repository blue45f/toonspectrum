import type { EffectiveOperationPolicy } from "@toonspectrum/contracts/operation-policy";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { isWorkspaceManager, type InvitableWorkspaceRole, type TeamWorkspaceCommandInput,
  type TeamWorkspaceDetail, type TeamWorkspaceSummary, type WorkspaceUsageResponse } from "@toonspectrum/contracts/production-workspace";
import { useApp } from "@/shared/lib/store";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { getApiErrorMessage } from "@/infrastructure/api";
import { listProductionProjects, type ProductionProjectSummary } from "./production-dashboard-api";
import { getEffectiveOperationPolicy, acceptTeamInvite, commandTeamWorkspace, createTeamWorkspace, getTeamUsage, getTeamWorkspace, listTeamWorkspaces } from "./team-workspace-api";
import { PRODUCTION_ROLE_PRESETS, productionRolePreset, type ProductionRolePreset } from "./production-manuscript-competitive-model";
import {
  createStudioSpatialInviteFragment,
  parseStudioSpatialInviteFragment,
  studioSpatialInviteDestination,
  type StudioSpatialInviteContext,
} from "../virtual-space/studio-spatial-invite-context";

const roles = { owner: "소유자", admin: "관리자", member: "구성원", guest: "게스트" } as const;
const fieldClass = "min-h-11 rounded-lg border border-line bg-canvas px-3 text-fg";
function Card({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-line bg-card p-5"><h2 className="mb-4 text-lg font-bold">{title}</h2>{children}</section>;
}
function roleValue(value: string): InvitableWorkspaceRole { return value === "admin" || value === "guest" ? value : "member"; }
function UsageCard({ usage }: { usage: WorkspaceUsageResponse }) {
  return <Card title="사용량과 공통 이용 한도"><dl className="grid gap-3 sm:grid-cols-3">
    <div><dt>소유 워크스페이스</dt><dd>{usage.counters.ownedWorkspaces} / {usage.policy.ownedWorkspaces}</dd></div>
    <div><dt>연결한 작품</dt><dd>{usage.counters.projects} / {usage.policy.projectsPerWorkspace}</dd></div>
    <div><dt>구성원·초대 예약</dt><dd>{usage.counters.members} + {usage.counters.pendingInvites} / {usage.policy.membersPerWorkspace}</dd></div>
  </dl><p className="mt-4 text-sm text-fg-2">{usage.operationMode === "free" ? "현재 무료 운영입니다." : "유료 운영 정책이 적용되어 있습니다. 실제 결제는 아직 제공하지 않습니다."} 한도 초과 시 기존 자료를 자동 삭제하지 않습니다.</p>
  <p className="mt-2 text-sm text-fg-2">원고 저장량 측정과 서버 변환량 연결은 준비 중입니다. 미측정 사용량을 0으로 표시하지 않습니다. 외부 유료 AI는 제공하지 않습니다.</p>
  <p className="mt-2 text-xs text-fg-3">정책 {usage.policy.version} / revision {usage.policyRevision} · 기존 작품 권한은 유지합니다.</p></Card>;
}
export function TeamWorkspacePage() {
  const userId = useApp((state) => state.userId);
  const { workspaceId } = useParams<{ workspaceId: string }>();
  return <TeamWorkspaceConsole key={`${userId ?? "signed-out"}:${workspaceId ?? "list"}`} userId={userId} />;
}
function TeamWorkspaceConsole({ userId }: { userId: string | null }) {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedPreset = searchParams.get("rolePreset") as ProductionRolePreset["id"] | null;
  const invitePreset = productionRolePreset(PRODUCTION_ROLE_PRESETS.some((preset) => preset.id === requestedPreset) ? requestedPreset! : "writer");
  const [operationPolicy, setOperationPolicy] = useState<EffectiveOperationPolicy | null>(null);
  const [items, setItems] = useState<readonly TeamWorkspaceSummary[]>([]);
  const [detail, setDetail] = useState<TeamWorkspaceDetail | null>(null);
  const [usage, setUsage] = useState<WorkspaceUsageResponse | null>(null);
  const [available, setAvailable] = useState<readonly ProductionProjectSummary[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InvitableWorkspaceRole>(invitePreset.workspaceRole);
  const [inviteEntryKind, setInviteEntryKind] = useState<StudioSpatialInviteContext["kind"]>("team-lobby");
  const [inviteProjectId, setInviteProjectId] = useState("");
  const [invitationLink, setInvitationLink] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => { setInviteRole(invitePreset.workspaceRole); }, [invitePreset.workspaceRole]);
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
        if (isWorkspaceManager(data.workspace.role)) {
          const [quota, projects] = await Promise.all([getTeamUsage(workspaceId), listProductionProjects()]);
          if (active) { setUsage(quota); setAvailable(projects.projects.filter((project) => project.access.owner)); }
        }
      }
    })().catch(async (cause: unknown) => { const message = await getApiErrorMessage(cause, "워크스페이스를 불러오지 못했습니다."); if (active) setError(message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId, workspaceId, refresh]);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); setRefresh((value) => value + 1); }
    catch (cause) { setError(await getApiErrorMessage(cause, "저장하지 못했습니다. 새로고침 후 다시 확인해주세요.")); }
    finally { setBusy(false); }
  }
  async function command(input: TeamWorkspaceCommandInput) {
    if (!detail) return;
    const result = await commandTeamWorkspace(detail.workspace.id, detail.workspace.revision, input);
    if (result.token) {
      const entryContext: StudioSpatialInviteContext = inviteEntryKind === "project-space"
        ? { kind: "project-space", projectId: inviteProjectId }
        : inviteEntryKind === "interview-waiting"
          ? { kind: "interview-waiting" }
          : { kind: "team-lobby" };
      const fragment = createStudioSpatialInviteFragment(result.token, entryContext);
      setInvitationLink(`${window.location.origin}/production/workspaces/join${fragment}`);
      setEmail("");
    } else if (result.invitationId) setNotice("초대는 만들어졌지만 비밀 링크는 재표시하지 않습니다. 같은 이메일로 재발행해주세요.");
    else setNotice("변경 내용이 저장되었습니다.");
    if (input.type === "remove-member" && input.userId === userId) navigate("/production/workspaces");
  }
  const manager = detail && isWorkspaceManager(detail.workspace.role);
  return <div data-route-ready="team-workspace" className="min-h-dvh bg-canvas px-4 py-6 text-fg">
    <div className="mx-auto max-w-6xl space-y-5"><header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-black">팀 워크스페이스</h1><p className="mt-2 text-sm text-fg-2">{operationPolicy?.notice ?? "팀을 구성하고 기존 제작 프로젝트를 연결합니다."}</p></div>
      <nav aria-label="제작 탐색" className="flex gap-3"><Link to="/production">제작 홈</Link><Link to="/production/workspaces">전체 팀</Link><Link to="/production/workspaces/join">초대 수락</Link></nav>
    </header>{error && <div role="alert" className="rounded-xl border border-bad p-4">{error}<button className="ml-3 underline" onClick={() => setRefresh((value) => value + 1)}>새로고침</button></div>}
    {notice && <p role="status">{notice}</p>}
    {operationPolicy && !operationPolicy.features["team-workspace"].enabled && <p role="status">{operationPolicy.features["team-workspace"].reason} 기존 자료 조회와 접근 회수는 유지됩니다.</p>}
    {!userId ? <Card title="로그인이 필요합니다"><p>로그인한 뒤 팀을 만들거나 초대받은 이메일로 참여해주세요.</p><Link to="/login" className="underline">로그인하기</Link></Card> : <>
    {invitationLink && <Card title="초대 링크가 준비되었습니다"><p className="mb-2 text-sm">이메일은 발송되지 않았습니다. 지정한 수신자에게 직접 전달해주세요. 인증된 수신자만 수락할 수 있습니다.</p>
      <input aria-label="새 초대 링크" readOnly value={invitationLink} className={`${fieldClass} w-full`} onFocus={(event) => event.currentTarget.select()} />
      <button className={`${buttonClass({ variant: "outline" })} mt-3`} onClick={() => { void navigator.clipboard.writeText(invitationLink).then(() => setNotice("초대 링크를 복사했습니다.")).catch(() => setError("복사 권한이 없습니다. 링크를 선택해 직접 복사해주세요.")); }}>초대 링크 복사</button>
      <button className="ml-4 underline" onClick={() => setInvitationLink("")}>링크 숨기기</button></Card>}
    {loading && <p role="status">워크스페이스를 불러오는 중입니다.</p>}
    {!workspaceId && <Card title="내 워크스페이스"><div className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => <Link key={item.id} className="rounded-xl border border-line p-4 hover:bg-raised" to={`/production/workspaces/${item.id}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`}>
        <strong>{item.name}</strong><p className="mt-2 text-sm">{roles[item.role]} · 접근 가능한 작품 {item.projectCount}개 · 구성원 {item.memberCount}명</p></Link>)}
      {!loading && items.length === 0 && <p>아직 참여한 팀이 없습니다. 새 팀을 만들거나 초대를 수락해주세요.</p>}</div>
      <form className="mt-5 flex flex-wrap gap-3" onSubmit={(event: FormEvent) => { event.preventDefault(); void run(async () => { const result = await createTeamWorkspace(name); navigate(`/production/workspaces/${result.workspaceId}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`); }); }}>
        <label className="flex flex-col gap-2">새 워크스페이스 이름<input required maxLength={20} value={name} onChange={(event) => setName(event.target.value)} className={fieldClass} /></label>
        <button disabled={busy || !name.trim() || !operationPolicy?.features["team-workspace"].enabled} className={`${buttonClass()} self-end`} type="submit">워크스페이스 만들기</button></form></Card>}
    {detail && <><Card title={detail.workspace.name}><p className="text-sm text-fg-2">현재 역할: {roles[detail.workspace.role]}</p>
      {manager && <form className="mt-4 flex flex-wrap gap-3" onSubmit={(event) => { event.preventDefault(); void run(() => command({ type: "rename", name })); }}>
        <label className="flex flex-col gap-2">팀 이름<input required maxLength={20} value={name} onChange={(event) => setName(event.target.value)} className={fieldClass} /></label>
        <button type="submit" disabled={busy || !name.trim()} className={`${buttonClass({ variant: "outline" })} self-end`}>이름 저장</button>
        <Link className="self-end underline" to={`/production/workspaces/${detail.workspace.id}/usage`}>사용량 확인</Link></form>}</Card>
    <Card title="연결한 제작 프로젝트"><p className="mb-3 text-sm text-fg-2">팀 연결은 작품 열람 권한을 자동으로 부여하지 않습니다. 작품별 기존 구성원·비공개 원고 권한을 유지합니다.</p>
      <ul className="space-y-3">{detail.projects.map((project) => <li key={project.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-3">
        <Link className="font-semibold underline" to={`/production/projects/${project.id}/overview`}>{project.title}</Link>
        {manager && <button disabled={busy} onClick={() => { if (window.confirm("팀 연결만 해제합니다. 작품과 작품 권한은 유지됩니다.")) void run(() => command({ type: "detach-project", projectId: project.id })); }} className={buttonClass({ variant: "outline", size: "sm" })}>연결 해제</button>}</li>)}</ul>
      {detail.projects.length === 0 && <p className="text-sm">접근 가능한 연결 작품이 없습니다.</p>}
      {manager && <div className="mt-4"><label className="flex flex-col gap-2">소유한 프로젝트 연결<select aria-label="연결할 프로젝트" className={fieldClass} disabled={busy} value="" onChange={(event) => { const projectId = event.target.value; if (projectId) void run(() => command({ type: "attach-project", projectId })); }}>
        <option value="">기존 프로젝트 선택</option>{available.filter((item) => !detail.projects.some((project) => project.id === item.projectId)).map((project) => <option key={project.projectId} value={project.projectId}>{project.title}</option>)}</select></label>
        <Link to="/studio/projects" className="mt-3 inline-block underline">작품 만들기·작품별 권한 관리</Link></div>}</Card>
    {detail.workspace.role !== "guest" && <Card title="구성원"><ul className="space-y-3">{detail.members.map((member) => <li key={member.userId} className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3">
      <strong className="mr-auto">{member.displayName}</strong><span>{roles[member.role]}</span>
      {manager && member.role !== "owner" && (detail.workspace.role === "owner" || member.role !== "admin") && <>
        <select aria-label={`${member.displayName} 역할`} disabled={busy} value={member.role} className={fieldClass} onChange={(event) => { const role = roleValue(event.target.value); void run(() => command({ type: "change-member-role", userId: member.userId, role })); }}>
          {detail.workspace.role === "owner" && <option value="admin">관리자</option>}<option value="member">구성원</option><option value="guest">게스트</option></select>
        <button disabled={busy} className={buttonClass({ variant: "outline", size: "sm" })} onClick={() => { if (window.confirm("팀에서 제외합니다. 별도로 부여한 작품 권한은 작품 설정에서 관리해주세요.")) void run(() => command({ type: "remove-member", userId: member.userId })); }}>팀에서 제외</button>
        {detail.workspace.role === "owner" && <button disabled={busy} className="underline" onClick={() => { if (window.confirm(`${member.displayName}에게 팀 소유권을 이전할까요? 작품 소유권은 바뀌지 않습니다.`)) void run(() => command({ type: "transfer-owner", userId: member.userId })); }}>소유권 이전</button>}
      </>}</li>)}</ul></Card>}
    {manager && <Card title="구성원 초대"><div className="mb-4 rounded-xl border border-line bg-raised p-3">
      <p className="text-xs font-bold text-fg-2">제작 역할 프리셋 · 실제 워크스페이스 역할과 가능한 행동을 초대 전에 확인합니다.</p>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">{PRODUCTION_ROLE_PRESETS.map((preset) => <button key={preset.id} type="button" aria-pressed={invitePreset.id === preset.id} className={`min-h-11 shrink-0 rounded-lg border px-3 text-xs font-bold ${invitePreset.id === preset.id ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-2"}`} onClick={() => { const next = new URLSearchParams(searchParams); next.set("rolePreset", preset.id); setSearchParams(next, { replace: true }); setInviteRole(preset.workspaceRole); }}>{preset.label}</button>)}</div>
      <p className="mt-2 text-xs text-fg-2">허용: {invitePreset.allowedActions.join(" · ")}</p>
      <p className="mt-1 text-xs text-fg-3">차단·별도 승인: {invitePreset.blockedActions.join(" · ")}</p>
      <p className="mt-1 text-[0.6875rem] text-fg-3">프로젝트 역할 {invitePreset.projectRole}은 미리보기입니다. 이 초대는 워크스페이스 역할만 적용하며 작품별 권한을 자동으로 넓히지 않습니다.</p>
    </div><form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); void run(() => command({ type: "invite", email, role: inviteRole })); }}>
      <label className="flex flex-col gap-2">초대받을 이메일<input type="email" required maxLength={320} className={fieldClass} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label className="flex flex-col gap-2">초대 역할<select className={fieldClass} value={inviteRole} onChange={(event) => setInviteRole(roleValue(event.target.value))}>
        {detail.workspace.role === "owner" && <option value="admin">관리자</option>}<option value="member">구성원</option><option value="guest">게스트</option></select></label>
      <label className="flex flex-col gap-2">수락 후 입장 안내<select className={fieldClass} value={inviteEntryKind}
        onChange={(event) => setInviteEntryKind(event.target.value === "project-space" || event.target.value === "interview-waiting" ? event.target.value : "team-lobby")}>
        <option value="team-lobby">팀 로비</option><option value="project-space">프로젝트 가상 스튜디오</option><option value="interview-waiting">면접·협업 대기실</option>
      </select></label>
      {inviteEntryKind === "project-space" && <label className="flex flex-col gap-2">입장할 프로젝트<select required className={fieldClass} value={inviteProjectId} onChange={(event) => setInviteProjectId(event.target.value)}>
        <option value="">프로젝트 선택</option>{detail.projects.map((project) => <option key={project.id} value={project.workId}>{project.title}</option>)}
      </select></label>}
      <button type="submit" disabled={busy || !email.trim() || (inviteEntryKind === "project-space" && !inviteProjectId)} className={buttonClass()}>초대 링크 만들기</button></form>
      <p className="mt-3 text-sm text-fg-2">7일간 유효하며 대기 초대도 구성원 한도에 포함됩니다. 같은 이메일로 재발행하면 이전 링크는 무효가 됩니다. 이메일은 자동 발송하지 않습니다. 입장 안내는 이동 목적지만 전달하며 프로젝트 권한을 새로 부여하지 않습니다.</p>
      <ul className="mt-4 space-y-2">{detail.invites.map((invitation) => <li key={invitation.id} className="flex flex-wrap items-center gap-3"><span>{invitation.email} · {roles[invitation.role]} · 만료 {new Date(invitation.expiresAt).toLocaleDateString("ko-KR")}</span>
        <button disabled={busy} className="underline" onClick={() => { void run(() => command({ type: "revoke-invite", invitationId: invitation.id })); }}>초대 취소</button></li>)}</ul></Card>}
    {usage && <UsageCard usage={usage} />}
    {detail.workspace.role !== "owner" && <button disabled={busy} className={buttonClass({ variant: "outline" })} onClick={() => { if (window.confirm("이 워크스페이스에서 나갈까요? 별도의 작품 접근 권한은 유지됩니다.")) void run(() => command({ type: "remove-member", userId })); }}>워크스페이스 나가기</button>}
    </>}</>}
    </div></div>;
}
export function TeamWorkspaceJoinPage() {
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
  return <div data-route-ready="team-workspace-join" className="min-h-dvh bg-canvas px-4 py-8 text-fg"><div className="mx-auto max-w-xl space-y-4">
    <h1 className="text-2xl font-black">워크스페이스 초대 수락</h1><p>초대받은 이메일로 로그인하고 이메일 인증을 완료해주세요. 작품별 접근 권한은 별도로 적용됩니다.</p>
    {error && <p role="alert">{error}</p>}
    {!userId && <p>로그인 후 원래 초대 링크를 다시 열거나 초대 코드를 입력해주세요. <Link to="/login" className="underline">로그인</Link></p>}
    <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); setBusy(true); setError("");
      void acceptTeamInvite(token.trim()).then((result) => {
        setToken("");
        navigate(studioSpatialInviteDestination(entryContext, result.workspaceId), { replace: true });
      })
        .catch(async (cause: unknown) => setError(await getApiErrorMessage(cause, "초대를 수락하지 못했습니다."))).finally(() => setBusy(false)); }}>
      <label className="flex flex-col gap-2">초대 코드<input className={fieldClass} value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" spellCheck={false} maxLength={43} /></label>
      <button disabled={!userId || busy || !/^[A-Za-z0-9_-]{43}$/u.test(token.trim())} className={buttonClass()} type="submit">초대 수락하기</button></form>
    <Link to="/production/workspaces" className="inline-block underline">팀 목록으로</Link>
  </div></div>;
}
