import { Check, Clipboard, Link2, LoaderCircle, Plus, RefreshCw, Send, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { InvitableWorkspaceRole, TeamWorkspaceDetail, TeamWorkspaceSummary } from "@toonspectrum/contracts/production-workspace";
import { isWorkspaceManager } from "@toonspectrum/contracts/production-workspace";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  commandTeamWorkspace,
  createTeamWorkspace,
  getTeamWorkspace,
  listTeamWorkspaces,
} from "../production-hub/team-workspace-api";

const roleOptions: readonly { readonly id: InvitableWorkspaceRole; readonly ko: string; readonly en: string }[] = [
  { id: "admin", ko: "관리자", en: "Admin" },
  { id: "member", ko: "제작 팀원", en: "Production member" },
  { id: "guest", ko: "게스트·외부 검수자", en: "Guest / external reviewer" },
];

export function StudioVirtualSpaceTeamHub({ productionProjectId, workId }: {
  readonly productionProjectId?: string | null;
  readonly workId: string;
}) {
  const bt = useBilingual("StudioVirtualSpaceTeamHub");
  const [workspaces, setWorkspaces] = useState<readonly TeamWorkspaceSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const [detail, setDetail] = useState<TeamWorkspaceDetail | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitableWorkspaceRole>("member");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState("");

  const loadList = useCallback(async (preferred?: string) => {
    setPhase("loading"); setNotice("");
    try {
      const result = await listTeamWorkspaces();
      setWorkspaces(result.workspaces);
      const next = preferred ?? selectedIdRef.current ?? result.workspaces[0]?.id ?? null;
      selectedIdRef.current = next;
      setSelectedId(next);
      setDetail(next ? await getTeamWorkspace(next) : null);
      setPhase("ready");
    } catch (error) {
      setPhase("error"); setNotice(error instanceof Error ? error.message : bt("팀 공간을 불러오지 못했어요.", "Could not load team spaces."));
    }
  }, [bt]);

  useEffect(() => { void loadList(); }, [loadList]);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => {
    if (!selectedId || detail?.workspace.id === selectedId) return;
    let active = true; setBusy(true);
    void getTeamWorkspace(selectedId).then((value) => { if (active) setDetail(value); })
      .catch((error: unknown) => { if (active) setNotice(error instanceof Error ? error.message : bt("그룹 정보를 불러오지 못했어요.", "Could not load group details.")); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [bt, detail?.workspace.id, selectedId]);

  const manager = detail ? isWorkspaceManager(detail.workspace.role) : false;
  const attached = useMemo(() => detail?.projects.some((project) => project.id === productionProjectId || project.workId === workId) ?? false, [detail, productionProjectId, workId]);
  const mutate = async (command: Parameters<typeof commandTeamWorkspace>[2]) => {
    if (!detail || busy) return;
    setBusy(true); setNotice("");
    try {
      const result = await commandTeamWorkspace(detail.workspace.id, detail.workspace.revision, command);
      if (result.token) {
        const url = `${globalThis.location.origin}/production/workspaces/join?token=${encodeURIComponent(result.token)}`;
        setInviteUrl(url); setCopied(false);
      }
      await loadList(detail.workspace.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : bt("요청을 처리하지 못했어요.", "Could not complete the request."));
    } finally { setBusy(false); }
  };

  return <section className="vs2-panel studio-vspace-team-hub" aria-label={bt("팀·그룹·초대", "Teams, groups and invites")} data-space-interactive="true">
    <header><div><p><UsersRound size={15} aria-hidden /> TEAM HUB</p><h2>{bt("제작 그룹과 팀원", "Production groups & teammates")}</h2></div>
      <button type="button" disabled={busy} onClick={() => void loadList()} aria-label={bt("새로고침", "Refresh")}><RefreshCw size={16} aria-hidden /></button></header>
    <p>{bt("영구 제작 그룹과 프로젝트 배정을 관리합니다. 회의 대화 그룹은 별도 동의가 필요한 일시적인 세션입니다.", "Manage persistent production groups and project assignments. Meeting rosters remain temporary sessions that require separate consent.")}</p>
    {phase === "loading" ? <p role="status"><LoaderCircle className="animate-spin" size={16} aria-hidden /> {bt("팀 공간 불러오는 중…", "Loading team spaces…")}</p> : null}
    {phase === "error" ? <p role="alert">{notice}</p> : null}
    {phase === "ready" ? <>
      <label>{bt("제작 그룹", "Production group")}
        <select value={selectedId ?? ""} disabled={busy || !workspaces.length} onChange={(event) => setSelectedId(event.target.value || null)}>
          {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name} · {workspace.memberCount}{bt("명", " members")}</option>)}
        </select>
      </label>
      <form onSubmit={(event) => { event.preventDefault(); const name = newName.trim(); if (!name || busy) return; setBusy(true);
        void createTeamWorkspace(name).then((result) => { setNewName(""); return loadList(result.workspaceId); })
          .catch((error: unknown) => setNotice(error instanceof Error ? error.message : bt("그룹을 만들지 못했어요.", "Could not create the group.")))
          .finally(() => setBusy(false)); }}>
        <input value={newName} maxLength={80} onChange={(event) => setNewName(event.target.value)} placeholder={bt("새 그룹 이름", "New group name")} />
        <button type="submit" disabled={!newName.trim() || busy}><Plus size={15} aria-hidden />{bt("그룹 만들기", "Create group")}</button>
      </form>
      {detail ? <>
        <div className="studio-vspace-team-summary"><span>{detail.workspace.name}</span><b>{detail.members.length}{bt("명", " members")}</b><b>{detail.projects.length}{bt("개 프로젝트", " projects")}</b><small>{detail.workspace.role}</small></div>
        <div className="studio-vspace-team-members">{detail.members.map((member) => <article key={member.userId}><span aria-hidden>{member.displayName.slice(0, 1).toUpperCase()}</span><div><strong>{member.displayName}</strong><small>{member.role}</small></div></article>)}</div>
        {manager ? <>
          <form onSubmit={(event) => { event.preventDefault(); if (!email.trim() || busy) return; void mutate({ type: "invite", email: email.trim(), role }).then(() => setEmail("")); }}>
            <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder={bt("이메일로 팀원 초대", "Invite teammate by email")} />
            <select value={role} onChange={(event) => setRole(event.target.value as InvitableWorkspaceRole)}>{roleOptions.map((item) => <option key={item.id} value={item.id}>{bt(item.ko, item.en)}</option>)}</select>
            <button type="submit" disabled={!email.trim() || busy}><Send size={15} aria-hidden />{bt("초대 링크 만들기", "Create invite link")}</button>
          </form>
          {productionProjectId ? <button type="button" disabled={busy || attached} onClick={() => void mutate({ type: "attach-project", projectId: productionProjectId })}>
            {attached ? <Check size={15} aria-hidden /> : <Link2 size={15} aria-hidden />}{attached ? bt("현재 프로젝트가 배정됨", "Current project assigned") : bt("현재 프로젝트를 이 그룹에 배정", "Assign current project to this group")}
          </button> : <p>{bt("현재 작품에 프로덕션 프로젝트를 연결하면 그룹에 배정할 수 있어요.", "Link this work to a production project before assigning it to a group.")}</p>}
        </> : <p>{bt("그룹 관리자만 팀원 초대와 프로젝트 배정을 변경할 수 있어요.", "Only group managers can invite teammates and assign projects.")}</p>}
        {detail.invites.length ? <details><summary>{bt(`대기 중 초대 ${detail.invites.length}건`, `${detail.invites.length} pending invitations`)}</summary>{detail.invites.map((invite) => <p key={invite.id}>{invite.email} · {invite.role}</p>)}</details> : null}
      </> : <p>{bt("첫 제작 그룹을 만들고 팀원을 초대해 보세요.", "Create your first production group and invite teammates.")}</p>}
      {inviteUrl ? <div className="studio-vspace-invite-result"><strong>{bt("이 링크는 지금 한 번만 표시됩니다.", "This link is shown only once.")}</strong><code>{inviteUrl}</code><button type="button" onClick={() => { void navigator.clipboard?.writeText(inviteUrl).then(() => setCopied(true)); }}><Clipboard size={15} aria-hidden />{copied ? bt("복사됨", "Copied") : bt("초대 링크 복사", "Copy invite link")}</button></div> : null}
      {notice ? <p role="status">{notice}</p> : null}
    </> : null}
  </section>;
}
