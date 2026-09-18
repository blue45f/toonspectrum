import {
  ArrowLeft,
  Ban,
  Check,
  Clipboard,
  Crown,
  Link2,
  Save,
  Settings,
  ShieldCheck,
  Trash2,
  UserCog,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  COMMUNITY_CAFE_JOIN_POLICY_LABELS,
  COMMUNITY_CAFE_KIND_LABELS,
  COMMUNITY_CAFE_KINDS,
  COMMUNITY_CAFE_POSTING_POLICY_LABELS,
  COMMUNITY_CAFE_ROLE_LABELS,
  COMMUNITY_CAFE_VISIBILITY_LABELS,
  communityCafeRoleRank,
} from "@/shared/lib/types";
import type {
  CommunityCafe,
  CommunityCafeBan,
  CommunityCafeInvite,
  CommunityCafeJoinPolicy,
  CommunityCafeJoinRequest,
  CommunityCafeKind,
  CommunityCafeMember,
  CommunityCafeModerationLog,
  CommunityCafePostingPolicy,
  CommunityCafeRole,
  CommunityCafeRule,
  CommunityCafeVisibility,
  CreatedCommunityCafeInvite,
} from "@/shared/lib/types";

import { Container } from "@/shared/components/section";
import { useApp } from "@/shared/lib/store";
import { GENRES } from "@/shared/lib/taxonomy";
import Link from "@/compat/router-link";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { api, getApiErrorMessage } from "@/infrastructure/api";

function rulesToText(rules: CommunityCafeRule[]): string {
  return rules.map((rule) => `${rule.title}${rule.description ? `|${rule.description}` : ""}`).join("\n");
}

function textToRules(value: string): CommunityCafeRule[] {
  return value
    .split("\n")
    .map((line, index) => {
      const [rawTitle, ...rest] = line.split("|");
      const title = rawTitle?.trim() ?? "";
      return title
        ? { id: `rule-${index + 1}`, title, description: rest.join("|").trim() }
        : null;
    })
    .filter((rule): rule is CommunityCafeRule => Boolean(rule))
    .slice(0, 12);
}

function formatDate(value: string | null): string {
  if (!value) return "없음";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function CafeManagePage() {
  const { slug: rawSlug } = useParams();
  const slug = rawSlug ?? "";
  const navigate = useNavigate();
  const userId = useApp((state) => state.userId);
  const sessionToken = useApp((state) => state.sessionToken);
  const authHeaders = useMemo(
    () => (sessionToken ? { "x-user-id": sessionToken } : undefined),
    [sessionToken],
  );

  const [cafe, setCafe] = useState<CommunityCafe | null>(null);
  const [members, setMembers] = useState<CommunityCafeMember[]>([]);
  const [requests, setRequests] = useState<CommunityCafeJoinRequest[]>([]);
  const [invites, setInvites] = useState<CommunityCafeInvite[]>([]);
  const [bans, setBans] = useState<CommunityCafeBan[]>([]);
  const [logs, setLogs] = useState<CommunityCafeModerationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createdInvite, setCreatedInvite] = useState<CreatedCommunityCafeInvite | null>(null);
  const [inviteUses, setInviteUses] = useState(10);
  const [inviteDays, setInviteDays] = useState(7);
  const [banReason, setBanReason] = useState("커뮤니티 규칙 위반");
  const [refreshTick, setRefreshTick] = useState(0);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState("");
  const [kind, setKind] = useState<CommunityCafeKind>("genre");
  const [visibility, setVisibility] = useState<CommunityCafeVisibility>("public");
  const [joinPolicy, setJoinPolicy] = useState<CommunityCafeJoinPolicy>("open");
  const [postingPolicy, setPostingPolicy] = useState<CommunityCafePostingPolicy>("members");
  const [tags, setTags] = useState("");
  const [rules, setRules] = useState("");

  useDocumentTitle(cafe ? `${cafe.name} 운영 관리` : "커뮤니티 운영 관리");

  useEffect(() => {
    if (!slug || !userId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<CommunityCafe>(`/community/cafes/${encodeURIComponent(slug)}`, { headers: authHeaders })
      .then(async (nextCafe) => {
        if (!nextCafe.viewerCanModerate) throw new Error("운영 권한이 없습니다.");
        if (cancelled) return;
        setCafe(nextCafe);
        setName(nextCafe.name);
        setDescription(nextCafe.description);
        setGenre(nextCafe.genre);
        setKind(nextCafe.kind);
        setVisibility(nextCafe.visibility);
        setJoinPolicy(nextCafe.joinPolicy);
        setPostingPolicy(nextCafe.postingPolicy);
        setTags(nextCafe.tags.join(", "));
        setRules(rulesToText(nextCafe.rules));

        const moderatorCalls = [
          api.get<CommunityCafeMember[]>(`/community/cafes/${encodeURIComponent(slug)}/members`, { headers: authHeaders }),
          api.get<CommunityCafeBan[]>(`/community/cafes/${encodeURIComponent(slug)}/bans`, { headers: authHeaders }),
          api.get<CommunityCafeModerationLog[]>(`/community/cafes/${encodeURIComponent(slug)}/moderation-logs`, { headers: authHeaders }),
        ] as const;
        const managementCalls = nextCafe.viewerCanManage
          ? [
              api.get<CommunityCafeJoinRequest[]>(`/community/cafes/${encodeURIComponent(slug)}/join-requests`, { headers: authHeaders }),
              api.get<CommunityCafeInvite[]>(`/community/cafes/${encodeURIComponent(slug)}/invites`, { headers: authHeaders }),
            ] as const
          : null;
        const [[nextMembers, nextBans, nextLogs], managerData] = await Promise.all([
          Promise.all(moderatorCalls),
          managementCalls ? Promise.all(managementCalls) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setMembers(nextMembers);
        setBans(nextBans);
        setLogs(nextLogs);
        if (managerData) {
          setRequests(managerData[0]);
          setInvites(managerData[1]);
        }
      })
      .catch(async (caught) => {
        if (!cancelled) setError(await getApiErrorMessage(caught, "운영 정보를 불러오지 못했습니다."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authHeaders, refreshTick, slug, userId]);

  const isOwner = cafe?.viewerRole === "owner";
  const canManage = Boolean(cafe?.viewerCanManage);
  const listedInvites = useMemo(
    () => invites.filter((invite) => !invite.revokedAt),
    [invites],
  );

  async function runAction(key: string, action: () => Promise<void>, success: string) {
    if (busyKey) return;
    setBusyKey(key);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(success);
    } catch (caught) {
      setError(await getApiErrorMessage(caught, "요청을 처리하지 못했습니다."));
    } finally {
      setBusyKey(null);
    }
  }

  async function saveSettings() {
    await runAction(
      "settings",
      async () => {
        const updated = await api.patch<CommunityCafe>(
          `/community/cafes/${encodeURIComponent(slug)}`,
          {
            name,
            description,
            genre,
            kind,
            visibility,
            joinPolicy,
            postingPolicy,
            tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
            rules: textToRules(rules),
          },
          { headers: authHeaders },
        );
        setCafe(updated);
      },
      "커뮤니티 설정을 저장했습니다.",
    );
  }

  async function reviewRequest(requestId: string, decision: "approve" | "reject") {
    await runAction(
      `request:${requestId}`,
      async () => {
        await api.patch(
          `/community/cafes/${encodeURIComponent(slug)}/join-requests/${encodeURIComponent(requestId)}`,
          { decision },
          { headers: authHeaders },
        );
        setRequests((current) => current.filter((request) => request.id !== requestId));
        if (decision === "approve") setRefreshTick((tick) => tick + 1);
      },
      decision === "approve" ? "가입 요청을 승인했습니다." : "가입 요청을 거절했습니다.",
    );
  }

  async function updateRole(member: CommunityCafeMember, role: CommunityCafeRole) {
    await runAction(
      `role:${member.userId}`,
      async () => {
        const updated = await api.patch<CommunityCafeMember>(
          `/community/cafes/${encodeURIComponent(slug)}/members/${encodeURIComponent(member.userId)}`,
          { role },
          { headers: authHeaders },
        );
        setMembers((current) => current.map((item) => (item.userId === updated.userId ? updated : item)));
      },
      `${member.name}님의 역할을 변경했습니다.`,
    );
  }

  async function transferOwnership(member: CommunityCafeMember) {
    if (!globalThis.confirm(`${member.name}님에게 소유권을 이전할까요? 현재 소유자는 관리자가 됩니다.`)) return;
    await runAction(
      `owner:${member.userId}`,
      async () => {
        const updated = await api.post<CommunityCafe>(
          `/community/cafes/${encodeURIComponent(slug)}/ownership`,
          { userId: member.userId },
          { headers: authHeaders },
        );
        setCafe(updated);
        setRefreshTick((tick) => tick + 1);
      },
      "소유권을 이전했습니다.",
    );
  }

  async function banMember(member: CommunityCafeMember) {
    if (!globalThis.confirm(`${member.name}님을 커뮤니티에서 차단할까요?`)) return;
    await runAction(
      `ban:${member.userId}`,
      async () => {
        const ban = await api.post<CommunityCafeBan>(
          `/community/cafes/${encodeURIComponent(slug)}/bans`,
          { userId: member.userId, reason: banReason },
          { headers: authHeaders },
        );
        setBans((current) => [ban, ...current.filter((item) => item.userId !== ban.userId)]);
        setMembers((current) => current.filter((item) => item.userId !== member.userId));
      },
      `${member.name}님을 차단했습니다.`,
    );
  }

  async function createInvite() {
    await runAction(
      "invite:create",
      async () => {
        const invite = await api.post<CreatedCommunityCafeInvite>(
          `/community/cafes/${encodeURIComponent(slug)}/invites`,
          { maxUses: inviteUses, expiresInDays: inviteDays },
          { headers: authHeaders },
        );
        setCreatedInvite(invite);
        setInvites((current) => [invite, ...current]);
      },
      "초대 링크를 만들었습니다. 코드는 지금 한 번만 표시됩니다.",
    );
  }

  async function copyInvite() {
    if (!createdInvite) return;
    const url = new URL(createdInvite.sharePath, globalThis.location.origin).toString();
    await navigator.clipboard.writeText(url);
    setNotice("초대 링크를 복사했습니다.");
  }

  async function revokeInvite(inviteId: string) {
    await runAction(
      `invite:${inviteId}`,
      async () => {
        await api.delete(`/community/cafes/${encodeURIComponent(slug)}/invites/${encodeURIComponent(inviteId)}`, { headers: authHeaders });
        setInvites((current) => current.map((invite) => invite.id === inviteId ? { ...invite, revokedAt: new Date().toISOString() } : invite));
      },
      "초대 링크를 폐기했습니다.",
    );
  }

  async function unban(userIdToUnban: string) {
    await runAction(
      `unban:${userIdToUnban}`,
      async () => {
        await api.delete(`/community/cafes/${encodeURIComponent(slug)}/bans/${encodeURIComponent(userIdToUnban)}`, { headers: authHeaders });
        setBans((current) => current.filter((ban) => ban.userId !== userIdToUnban));
      },
      "차단을 해제했습니다.",
    );
  }

  async function archiveCommunity() {
    if (!globalThis.confirm("커뮤니티를 보관할까요? 게시글은 유지되지만 새 글과 가입이 중단됩니다.")) return;
    await runAction(
      "archive",
      async () => {
        await api.delete(`/community/cafes/${encodeURIComponent(slug)}`, { headers: authHeaders });
        navigate(`/community/cafes/${encodeURIComponent(slug)}`);
      },
      "커뮤니티를 보관했습니다.",
    );
  }

  if (!userId) {
    return <Container size="wide" className="py-16"><p className="rounded-2xl border border-line bg-card p-8 text-center text-sm text-fg-3">로그인이 필요해요.</p></Container>;
  }
  if (loading) {
    return <Container size="wide" className="py-10"><div className="skeleton h-28 rounded-3xl" /><div className="skeleton mt-5 h-96 rounded-3xl" /></Container>;
  }
  if (error && !cafe) {
    return <Container size="wide" className="py-16"><div className="rounded-2xl border border-bad/30 bg-bad/10 p-8 text-center text-sm text-bad">{error}<div><Link href={`/community/cafes/${encodeURIComponent(slug)}`} className="mt-4 inline-flex rounded-lg border border-line px-3 py-2 text-xs text-fg">돌아가기</Link></div></div></Container>;
  }
  if (!cafe) return null;

  return (
    <Container size="wide" className="py-8 lg:py-10">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/community/cafes/${encodeURIComponent(slug)}`} className="inline-flex items-center gap-1 text-xs text-fg-3 hover:text-fg"><ArrowLeft size={13} />커뮤니티로 돌아가기</Link>
          <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold"><Settings size={21} className="text-accent" />{cafe.name} 운영 관리</h1>
          <p className="mt-1 text-xs text-fg-3">내 역할: {cafe.viewerRole ? COMMUNITY_CAFE_ROLE_LABELS[cafe.viewerRole] : "없음"}</p>
        </div>
        <span className="rounded-full border border-line px-3 py-1 text-xs text-fg-3">{cafe.status === "archived" ? "보관됨" : "운영 중"}</span>
      </div>

      {(notice || error) && <div className={`mb-5 rounded-xl border px-4 py-3 text-sm ${error ? "border-bad/30 bg-bad/10 text-bad" : "border-good/30 bg-good/10 text-good"}`}>{error ?? notice}</div>}

      <div className="space-y-6">
        {canManage && (
          <section className="rounded-2xl border border-line bg-card/60 p-4 sm:p-5">
            <h2 className="flex items-center gap-2 text-base font-semibold"><Save size={16} className="text-accent" />기본 설정</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-fg-3">이름<input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-fg" /></label>
              <label className="text-xs text-fg-3">유형<select value={kind} onChange={(event) => setKind(event.target.value as CommunityCafeKind)} className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-fg">{COMMUNITY_CAFE_KINDS.map((value) => <option key={value} value={value}>{COMMUNITY_CAFE_KIND_LABELS[value]}</option>)}</select></label>
              <label className="text-xs text-fg-3 sm:col-span-2">소개<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className="mt-1 w-full resize-none rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-fg" /></label>
              <label className="text-xs text-fg-3">장르<select value={genre} onChange={(event) => setGenre(event.target.value)} className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-fg"><option value="">자유</option>{GENRES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <label className="text-xs text-fg-3">태그<input value={tags} onChange={(event) => setTags(event.target.value)} className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-fg" /></label>
              <label className="text-xs text-fg-3">공개 범위<select value={visibility} onChange={(event) => setVisibility(event.target.value as CommunityCafeVisibility)} className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-fg">{Object.entries(COMMUNITY_CAFE_VISIBILITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="text-xs text-fg-3">가입 정책<select value={joinPolicy} onChange={(event) => setJoinPolicy(event.target.value as CommunityCafeJoinPolicy)} className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-fg">{Object.entries(COMMUNITY_CAFE_JOIN_POLICY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="text-xs text-fg-3 sm:col-span-2">작성 권한<select value={postingPolicy} onChange={(event) => setPostingPolicy(event.target.value as CommunityCafePostingPolicy)} className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-fg">{Object.entries(COMMUNITY_CAFE_POSTING_POLICY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="text-xs text-fg-3 sm:col-span-2">규칙 <span className="text-fg-3/70">(제목|설명)</span><textarea value={rules} onChange={(event) => setRules(event.target.value)} rows={4} className="mt-1 w-full resize-none rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-fg" /></label>
            </div>
            <button type="button" onClick={() => void saveSettings()} disabled={Boolean(busyKey)} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-on-accent disabled:opacity-45"><Save size={14} />설정 저장</button>
          </section>
        )}

        {canManage && (
          <section className="rounded-2xl border border-line bg-card/60 p-4 sm:p-5">
            <h2 className="flex items-center gap-2 text-base font-semibold"><Check size={16} className="text-accent" />가입 요청 <span className="text-xs font-normal text-fg-3">{requests.length}</span></h2>
            <div className="mt-3 space-y-2">
              {requests.length === 0 ? <p className="text-xs text-fg-3">대기 중인 요청이 없어요.</p> : requests.map((request) => (
                <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-canvas/50 p-3">
                  <div><p className="text-sm font-medium">{request.userName}</p><p className="mt-1 text-xs text-fg-3">{request.message || "가입 메시지 없음"}</p></div>
                  <div className="flex gap-2"><button type="button" onClick={() => void reviewRequest(request.id, "reject")} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs text-fg-3"><X size={13} />거절</button><button type="button" onClick={() => void reviewRequest(request.id, "approve")} className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-on-accent"><Check size={13} />승인</button></div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-line bg-card/60 p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold"><UserCog size={16} className="text-accent" />{canManage ? "회원과 역할" : "회원 관리"}</h2>
          <label className="mt-3 block max-w-md text-xs text-fg-3">차단 사유<input value={banReason} onChange={(event) => setBanReason(event.target.value)} className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-fg" /></label>
          <div className="mt-3 divide-y divide-line/70">
            {members.map((member) => {
              const outranksMember = communityCafeRoleRank(cafe.viewerRole) > communityCafeRoleRank(member.role);
              const canChangeRole = canManage && outranksMember && member.role !== "owner" && member.userId !== userId;
              const canBan = outranksMember && member.role !== "owner" && member.userId !== userId;
              return (
                <div key={member.userId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div><p className="text-sm font-medium">{member.name}</p><p className="text-xs text-fg-3">{COMMUNITY_CAFE_ROLE_LABELS[member.role]} · {formatDate(member.joinedAt)} 가입</p></div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canChangeRole && <select value={member.role} onChange={(event) => void updateRole(member, event.target.value as CommunityCafeRole)} className="rounded-lg border border-line bg-canvas px-2 py-1.5 text-xs text-fg"><option value="member">회원</option><option value="moderator">운영자</option>{isOwner && <option value="admin">관리자</option>}</select>}
                    {isOwner && member.role !== "owner" && <button type="button" onClick={() => void transferOwnership(member)} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs text-fg-2"><Crown size={12} />소유권</button>}
                    {canBan && <button type="button" onClick={() => void banMember(member)} className="inline-flex items-center gap-1 rounded-lg border border-bad/30 px-2.5 py-1.5 text-xs text-bad"><Ban size={12} />차단</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {canManage && (
          <section className="rounded-2xl border border-line bg-card/60 p-4 sm:p-5">
            <h2 className="flex items-center gap-2 text-base font-semibold"><Link2 size={16} className="text-accent" />초대 링크</h2>
            <div className="mt-3 flex flex-wrap items-end gap-2"><label className="text-xs text-fg-3">사용 횟수<input type="number" min={1} max={100} value={inviteUses} onChange={(event) => setInviteUses(Number(event.target.value))} className="mt-1 block w-24 rounded-lg border border-line bg-canvas px-2 py-2 text-sm text-fg" /></label><label className="text-xs text-fg-3">유효 일수<input type="number" min={1} max={30} value={inviteDays} onChange={(event) => setInviteDays(Number(event.target.value))} className="mt-1 block w-24 rounded-lg border border-line bg-canvas px-2 py-2 text-sm text-fg" /></label><button type="button" onClick={() => void createInvite()} className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-on-accent">초대 만들기</button></div>
            {createdInvite && <div className="mt-3 rounded-xl border border-accent/35 bg-accent-soft p-3"><p className="text-xs font-semibold text-accent">새 초대 코드 — 다시 표시되지 않습니다.</p><code className="mt-1 block break-all text-xs text-fg">{createdInvite.code}</code><button type="button" onClick={() => void copyInvite()} className="mt-2 inline-flex items-center gap-1 rounded-lg border border-accent/30 px-2 py-1 text-xs text-accent"><Clipboard size={12} />링크 복사</button></div>}
            <div className="mt-3 space-y-2">{listedInvites.length === 0 ? <p className="text-xs text-fg-3">초대 내역이 없어요.</p> : listedInvites.map((invite) => <div key={invite.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3 text-xs"><span>{invite.useCount}/{invite.maxUses}회 · {formatDate(invite.expiresAt)} 만료</span><button type="button" onClick={() => void revokeInvite(invite.id)} className="inline-flex items-center gap-1 text-bad"><Trash2 size={12} />폐기</button></div>)}</div>
          </section>
        )}

        <section className="rounded-2xl border border-line bg-card/60 p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold"><Ban size={16} className="text-accent" />차단 목록</h2>
          <div className="mt-3 space-y-2">{bans.length === 0 ? <p className="text-xs text-fg-3">차단된 사용자가 없어요.</p> : bans.map((ban) => <div key={ban.userId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3"><div><p className="text-sm font-medium">{ban.userName}</p><p className="text-xs text-fg-3">{ban.reason} · 만료 {formatDate(ban.expiresAt)}</p></div><button type="button" onClick={() => void unban(ban.userId)} className="rounded-lg border border-line px-2.5 py-1.5 text-xs text-fg-2">차단 해제</button></div>)}</div>
        </section>

        <section className="rounded-2xl border border-line bg-card/60 p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold"><ShieldCheck size={16} className="text-accent" />운영 기록</h2>
          <div className="mt-3 space-y-2">{logs.length === 0 ? <p className="text-xs text-fg-3">기록이 없어요.</p> : logs.map((log) => <div key={log.id} className="rounded-xl border border-line p-3"><div className="flex flex-wrap justify-between gap-2"><p className="text-xs font-semibold text-fg">{log.action}</p><time className="text-[0.68rem] text-fg-3">{formatDate(log.createdAt)}</time></div><p className="mt-1 text-xs text-fg-3">{log.actorName}{log.targetUserId ? ` → ${log.targetUserId}` : ""}</p></div>)}</div>
        </section>

        {isOwner && cafe.status === "active" && (
          <section className="rounded-2xl border border-bad/25 bg-bad/5 p-4 sm:p-5">
            <h2 className="text-base font-semibold text-bad">위험 영역</h2><p className="mt-1 text-xs text-fg-3">보관하면 기존 콘텐츠는 유지되지만 가입과 작성이 중단됩니다.</p><button type="button" onClick={() => void archiveCommunity()} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-bad/35 px-3 py-2 text-xs font-semibold text-bad"><Trash2 size={13} />커뮤니티 보관</button>
          </section>
        )}
      </div>
    </Container>
  );
}
