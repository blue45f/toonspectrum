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
  COMMUNITY_CAFE_KINDS,
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
import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { api, getApiErrorMessage } from "@/platform/api";
import { normalizeLocaleCode, useI18n, useT } from "@/shared/lib/i18n";
import {
  defineBilingualText,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

/**
 * 카페 운영 콘솔의 한영 카피. packages/core의 정책 라벨은 한국어 전용이라
 * 이 페이지에서만 쓰는 바이링구얼 라벨을 로컬로 정의한다.
 */
const COPY = {
  signInRequired: defineBilingualText("cafeManage", "signInRequired", "로그인이 필요해요.", "Sign in required."),
  manageTitle: defineBilingualText("cafeManage", "manageTitle", "{name} 운영 관리", "Managing {name}"),
  manageDocDefault: defineBilingualText("cafeManage", "manageDocDefault", "커뮤니티 운영 관리", "Community management"),
  noPermission: defineBilingualText("cafeManage", "noPermission", "운영 권한이 없습니다.", "You don't have moderation permission."),
  loadError: defineBilingualText("cafeManage", "loadError", "운영 정보를 불러오지 못했습니다.", "Couldn't load the management info."),
  actionError: defineBilingualText("cafeManage", "actionError", "요청을 처리하지 못했습니다.", "Couldn't process the request."),
  backToCafe: defineBilingualText("cafeManage", "backToCafe", "커뮤니티로 돌아가기", "Back to community"),
  goBack: defineBilingualText("cafeManage", "goBack", "돌아가기", "Go back"),
  myRole: defineBilingualText("cafeManage", "myRole", "내 역할: {role}", "My role: {role}"),
  roleNone: defineBilingualText("cafeManage", "roleNone", "없음", "None"),
  statusArchived: defineBilingualText("cafeManage", "statusArchived", "보관됨", "Archived"),
  statusActive: defineBilingualText("cafeManage", "statusActive", "운영 중", "Active"),
  navAria: defineBilingualText("cafeManage", "navAria", "운영 관리 섹션 이동", "Management sections"),
  navSettings: defineBilingualText("cafeManage", "navSettings", "기본 설정", "Settings"),
  navRequests: defineBilingualText("cafeManage", "navRequests", "가입 요청", "Join requests"),
  navInvites: defineBilingualText("cafeManage", "navInvites", "초대 링크", "Invite links"),
  navMembers: defineBilingualText("cafeManage", "navMembers", "회원 관리", "Members"),
  navMembersRoles: defineBilingualText("cafeManage", "navMembersRoles", "회원과 역할", "Members & roles"),
  navBans: defineBilingualText("cafeManage", "navBans", "차단 목록", "Banned users"),
  navLogs: defineBilingualText("cafeManage", "navLogs", "운영 기록", "Moderation log"),
  navDanger: defineBilingualText("cafeManage", "navDanger", "위험 영역", "Danger zone"),
  formName: defineBilingualText("cafeManage", "formName", "이름", "Name"),
  formKind: defineBilingualText("cafeManage", "formKind", "유형", "Type"),
  formDescription: defineBilingualText("cafeManage", "formDescription", "소개", "Description"),
  formGenre: defineBilingualText("cafeManage", "formGenre", "장르", "Genre"),
  formGenreAny: defineBilingualText("cafeManage", "formGenreAny", "자유", "Any"),
  formTags: defineBilingualText("cafeManage", "formTags", "태그", "Tags"),
  formVisibility: defineBilingualText("cafeManage", "formVisibility", "공개 범위", "Visibility"),
  formJoinPolicy: defineBilingualText("cafeManage", "formJoinPolicy", "가입 정책", "Join policy"),
  formPostingPolicy: defineBilingualText("cafeManage", "formPostingPolicy", "작성 권한", "Posting policy"),
  formRules: defineBilingualText("cafeManage", "formRules", "규칙", "Rules"),
  formRulesHint: defineBilingualText("cafeManage", "formRulesHint", "(제목|설명)", "(title|description)"),
  saveSettings: defineBilingualText("cafeManage", "saveSettings", "설정 저장", "Save settings"),
  savedSettings: defineBilingualText("cafeManage", "savedSettings", "커뮤니티 설정을 저장했습니다.", "Saved the community settings."),
  requestsNone: defineBilingualText("cafeManage", "requestsNone", "대기 중인 요청이 없어요.", "No pending requests."),
  requestNoMessage: defineBilingualText("cafeManage", "requestNoMessage", "가입 메시지 없음", "No message"),
  reject: defineBilingualText("cafeManage", "reject", "거절", "Reject"),
  approve: defineBilingualText("cafeManage", "approve", "승인", "Approve"),
  approvedRequest: defineBilingualText("cafeManage", "approvedRequest", "가입 요청을 승인했습니다.", "Approved the join request."),
  rejectedRequest: defineBilingualText("cafeManage", "rejectedRequest", "가입 요청을 거절했습니다.", "Rejected the join request."),
  banReasonLabel: defineBilingualText("cafeManage", "banReasonLabel", "차단 사유", "Ban reason"),
  banReasonDefault: defineBilingualText("cafeManage", "banReasonDefault", "커뮤니티 규칙 위반", "Community rule violation"),
  membersNone: defineBilingualText("cafeManage", "membersNone", "회원이 없어요.", "No members yet."),
  joinedAt: defineBilingualText("cafeManage", "joinedAt", "{date} 가입", "Joined {date}"),
  changeRoleAria: defineBilingualText("cafeManage", "changeRoleAria", "{name} 역할 변경", "Change {name}'s role"),
  ownership: defineBilingualText("cafeManage", "ownership", "소유권", "Ownership"),
  ban: defineBilingualText("cafeManage", "ban", "차단", "Ban"),
  confirmTransfer: defineBilingualText(
    "cafeManage",
    "confirmTransfer",
    "{name}님에게 소유권을 이전할까요? 현재 소유자는 관리자가 됩니다.",
    "Transfer ownership to {name}? The current owner becomes an admin.",
  ),
  confirmBan: defineBilingualText(
    "cafeManage",
    "confirmBan",
    "{name}님을 커뮤니티에서 차단할까요?",
    "Ban {name} from the community?",
  ),
  confirmArchive: defineBilingualText(
    "cafeManage",
    "confirmArchive",
    "커뮤니티를 보관할까요? 게시글은 유지되지만 새 글과 가입이 중단됩니다.",
    "Archive the community? Posts stay, but new posts and signups stop.",
  ),
  roleChanged: defineBilingualText("cafeManage", "roleChanged", "{name}님의 역할을 변경했습니다.", "Changed {name}'s role."),
  ownershipTransferred: defineBilingualText("cafeManage", "ownershipTransferred", "소유권을 이전했습니다.", "Transferred ownership."),
  memberBanned: defineBilingualText("cafeManage", "memberBanned", "{name}님을 차단했습니다.", "Banned {name}."),
  inviteUses: defineBilingualText("cafeManage", "inviteUses", "사용 횟수", "Max uses"),
  inviteDays: defineBilingualText("cafeManage", "inviteDays", "유효 일수", "Valid days"),
  createInvite: defineBilingualText("cafeManage", "createInvite", "초대 만들기", "Create invite"),
  inviteCreated: defineBilingualText(
    "cafeManage",
    "inviteCreated",
    "초대 링크를 만들었습니다. 코드는 지금 한 번만 표시됩니다.",
    "Created an invite link. The code is shown only once.",
  ),
  inviteNewCode: defineBilingualText(
    "cafeManage",
    "inviteNewCode",
    "새 초대 코드 — 다시 표시되지 않습니다.",
    "New invite code — it won't be shown again.",
  ),
  copyLink: defineBilingualText("cafeManage", "copyLink", "링크 복사", "Copy link"),
  linkCopied: defineBilingualText("cafeManage", "linkCopied", "초대 링크를 복사했습니다.", "Copied the invite link."),
  invitesNone: defineBilingualText("cafeManage", "invitesNone", "초대 내역이 없어요.", "No invites."),
  inviteMeta: defineBilingualText("cafeManage", "inviteMeta", "{used}/{max}회 · {date} 만료", "{used}/{max} uses · expires {date}"),
  revoke: defineBilingualText("cafeManage", "revoke", "폐기", "Revoke"),
  inviteRevoked: defineBilingualText("cafeManage", "inviteRevoked", "초대 링크를 폐기했습니다.", "Revoked the invite link."),
  bansNone: defineBilingualText("cafeManage", "bansNone", "차단된 사용자가 없어요.", "No banned users."),
  banMeta: defineBilingualText("cafeManage", "banMeta", "{reason} · 만료 {date}", "{reason} · expires {date}"),
  unban: defineBilingualText("cafeManage", "unban", "차단 해제", "Unban"),
  unbanned: defineBilingualText("cafeManage", "unbanned", "차단을 해제했습니다.", "Unbanned."),
  logsNone: defineBilingualText("cafeManage", "logsNone", "기록이 없어요.", "No records."),
  dangerDescription: defineBilingualText(
    "cafeManage",
    "dangerDescription",
    "보관하면 기존 콘텐츠는 유지되지만 가입과 작성이 중단됩니다.",
    "Archiving keeps existing content but stops signups and new posts.",
  ),
  archiveCafe: defineBilingualText("cafeManage", "archiveCafe", "커뮤니티 보관", "Archive community"),
  archivedCafe: defineBilingualText("cafeManage", "archivedCafe", "커뮤니티를 보관했습니다.", "Archived the community."),
  dateNone: defineBilingualText("cafeManage", "dateNone", "없음", "None"),
} as const;

const CAFE_KIND_KEYS: Readonly<Record<CommunityCafeKind, string>> = {
  creator: defineBilingualText("cafeManage", "kindCreator", "창작자 팬 커뮤니티", "Creator fan community"),
  work: defineBilingualText("cafeManage", "kindWork", "작품 팬 커뮤니티", "Work fan community"),
  genre: defineBilingualText("cafeManage", "kindGenre", "장르·관심사", "Genres & interests"),
  project: defineBilingualText("cafeManage", "kindProject", "공동창작·프로젝트", "Co-creation & projects"),
  study: defineBilingualText("cafeManage", "kindStudy", "정보 공유·스터디", "Info sharing & study"),
  social: defineBilingualText("cafeManage", "kindSocial", "자유 친목", "Casual social"),
};

const CAFE_VISIBILITY_KEYS: Readonly<Record<CommunityCafeVisibility, string>> = {
  public: defineBilingualText("cafeManage", "visibilityPublic", "공개", "Public"),
  private: defineBilingualText("cafeManage", "visibilityPrivate", "비공개", "Private"),
};

const CAFE_JOIN_POLICY_KEYS: Readonly<Record<CommunityCafeJoinPolicy, string>> = {
  open: defineBilingualText("cafeManage", "joinOpen", "바로 가입", "Join instantly"),
  approval: defineBilingualText("cafeManage", "joinApproval", "가입 승인", "Approval required"),
  invite: defineBilingualText("cafeManage", "joinInvite", "초대 전용", "Invite only"),
};

const CAFE_POSTING_POLICY_KEYS: Readonly<Record<CommunityCafePostingPolicy, string>> = {
  members: defineBilingualText("cafeManage", "postingMembers", "회원 작성", "Members can post"),
  staff: defineBilingualText("cafeManage", "postingStaff", "운영진만 작성", "Staff only"),
};

const CAFE_ROLE_KEYS: Readonly<Record<CommunityCafeRole, string>> = {
  owner: defineBilingualText("cafeManage", "roleOwner", "소유자", "Owner"),
  admin: defineBilingualText("cafeManage", "roleAdmin", "관리자", "Admin"),
  moderator: defineBilingualText("cafeManage", "roleModerator", "운영자", "Moderator"),
  member: defineBilingualText("cafeManage", "roleMember", "회원", "Member"),
};

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

function formatDate(value: string | null, locale: string, noneLabel: string): string {
  if (!value) return noneLabel;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function CafeManagePage() {
  useBilingualI18nRevision();
  const t = useT();
  const language = useI18n((state) => state.lang);
  const isEnglish = (normalizeLocaleCode(language) ?? "").startsWith("en");
  const pageLang = isEnglish ? "en" : "ko";
  const dateLocale = isEnglish ? "en-US" : "ko-KR";

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
  const [banReasonInput, setBanReasonInput] = useState("");
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

  const banReason = banReasonInput || t(COPY.banReasonDefault);
  const formatCafeDate = (value: string | null) => formatDate(value, dateLocale, t(COPY.dateNone));

  useDocumentTitle(cafe ? t(COPY.manageTitle, { name: cafe.name }) : t(COPY.manageDocDefault));

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
        if (!nextCafe.viewerCanModerate) throw new Error(t(COPY.noPermission));
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
        if (!cancelled) setError(await getApiErrorMessage(caught, t(COPY.loadError)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authHeaders, refreshTick, slug, userId, t]);

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
      setError(await getApiErrorMessage(caught, t(COPY.actionError)));
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
      t(COPY.savedSettings),
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
      t(decision === "approve" ? COPY.approvedRequest : COPY.rejectedRequest),
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
      t(COPY.roleChanged, { name: member.name }),
    );
  }

  async function transferOwnership(member: CommunityCafeMember) {
    if (!globalThis.confirm(t(COPY.confirmTransfer, { name: member.name }))) return;
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
      t(COPY.ownershipTransferred),
    );
  }

  async function banMember(member: CommunityCafeMember) {
    if (!globalThis.confirm(t(COPY.confirmBan, { name: member.name }))) return;
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
      t(COPY.memberBanned, { name: member.name }),
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
      t(COPY.inviteCreated),
    );
  }

  async function copyInvite() {
    if (!createdInvite) return;
    const url = new URL(createdInvite.sharePath, globalThis.location.origin).toString();
    await navigator.clipboard.writeText(url);
    setNotice(t(COPY.linkCopied));
  }

  async function revokeInvite(inviteId: string) {
    await runAction(
      `invite:${inviteId}`,
      async () => {
        await api.delete(`/community/cafes/${encodeURIComponent(slug)}/invites/${encodeURIComponent(inviteId)}`, { headers: authHeaders });
        setInvites((current) => current.map((invite) => invite.id === inviteId ? { ...invite, revokedAt: new Date().toISOString() } : invite));
      },
      t(COPY.inviteRevoked),
    );
  }

  async function unban(userIdToUnban: string) {
    await runAction(
      `unban:${userIdToUnban}`,
      async () => {
        await api.delete(`/community/cafes/${encodeURIComponent(slug)}/bans/${encodeURIComponent(userIdToUnban)}`, { headers: authHeaders });
        setBans((current) => current.filter((ban) => ban.userId !== userIdToUnban));
      },
      t(COPY.unbanned),
    );
  }

  async function archiveCommunity() {
    if (!globalThis.confirm(t(COPY.confirmArchive))) return;
    await runAction(
      "archive",
      async () => {
        await api.delete(`/community/cafes/${encodeURIComponent(slug)}`, { headers: authHeaders });
        navigate(`/community/cafes/${encodeURIComponent(slug)}`);
      },
      t(COPY.archivedCafe),
    );
  }

  if (!userId) {
    return <Container size="wide" className="py-16"><p data-route-blocked="sign-in" className="rounded-2xl border border-line bg-card p-8 text-center text-sm text-fg-3">{t(COPY.signInRequired)}</p></Container>;
  }
  if (loading) {
    return <Container size="wide" className="py-10"><div className="skeleton h-28 rounded-3xl" /><div className="skeleton mt-5 h-96 rounded-3xl" /></Container>;
  }
  if (error && !cafe) {
    return <Container size="wide" className="py-16"><div className="rounded-2xl border border-bad/30 bg-bad/10 p-8 text-center text-sm text-bad">{error}<div><Link href={`/community/cafes/${encodeURIComponent(slug)}`} className="mt-4 inline-flex rounded-lg border border-line px-3 py-2 text-xs text-fg">{t(COPY.goBack)}</Link></div></div></Container>;
  }
  if (!cafe) return null;

  return (
    <div lang={pageLang}>
      <Container size="wide" className="py-8 lg:py-10">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href={`/community/cafes/${encodeURIComponent(slug)}`} className="inline-flex items-center gap-1 text-xs text-fg-3 hover:text-fg"><ArrowLeft size={13} />{t(COPY.backToCafe)}</Link>
            <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold"><Settings size={21} className="text-accent" />{t(COPY.manageTitle, { name: cafe.name })}</h1>
            <p className="mt-1 text-xs text-fg-3">{t(COPY.myRole, { role: cafe.viewerRole ? t(CAFE_ROLE_KEYS[cafe.viewerRole]) : t(COPY.roleNone) })}</p>
          </div>
          <span className="rounded-full border border-line px-3 py-1 text-xs text-fg-3">{cafe.status === "archived" ? t(COPY.statusArchived) : t(COPY.statusActive)}</span>
        </div>

        <nav aria-label={t(COPY.navAria)} className="mb-5 flex gap-2 overflow-x-auto pb-1">
          {[
            ...(canManage ? [
              { id: "cafe-manage-settings", label: t(COPY.navSettings) },
              { id: "cafe-manage-requests", label: `${t(COPY.navRequests)}${requests.length > 0 ? ` ${requests.length}` : ""}` },
              { id: "cafe-manage-invites", label: t(COPY.navInvites) },
            ] : []),
            { id: "cafe-manage-members", label: canManage ? t(COPY.navMembersRoles) : t(COPY.navMembers) },
            { id: "cafe-manage-bans", label: t(COPY.navBans) },
            { id: "cafe-manage-logs", label: t(COPY.navLogs) },
            ...(isOwner && cafe.status === "active" ? [{ id: "cafe-manage-danger", label: t(COPY.navDanger) }] : []),
          ].map((entry) => (
            <a key={entry.id} href={`#${entry.id}`} className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-line bg-card/60 px-4 text-xs font-medium text-fg-2 transition-colors hover:border-accent/45 hover:text-fg">
              {entry.label}
            </a>
          ))}
        </nav>

        {(notice || error) && <div role={error ? "alert" : "status"} className={`mb-5 rounded-xl border px-4 py-3 text-sm ${error ? "border-bad/30 bg-bad/10 text-bad" : "border-good/30 bg-good/10 text-good"}`}>{error ?? notice}</div>}

        <div className="space-y-6">
          {canManage && (
            <section id="cafe-manage-settings" className="scroll-mt-24 rounded-2xl border border-line bg-card/60 p-4 sm:p-5">
              <h2 className="flex items-center gap-2 text-base font-semibold"><Save size={16} className="text-accent" />{t(COPY.navSettings)}</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-fg-3">{t(COPY.formName)}<input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-fg" /></label>
                <label className="text-xs text-fg-3">{t(COPY.formKind)}<select value={kind} onChange={(event) => setKind(event.target.value as CommunityCafeKind)} className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-fg">{COMMUNITY_CAFE_KINDS.map((value) => <option key={value} value={value}>{t(CAFE_KIND_KEYS[value])}</option>)}</select></label>
                <label className="text-xs text-fg-3 sm:col-span-2">{t(COPY.formDescription)}<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className="mt-1 w-full resize-none rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-fg" /></label>
                <label className="text-xs text-fg-3">{t(COPY.formGenre)}<select value={genre} onChange={(event) => setGenre(event.target.value)} className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-fg"><option value="">{t(COPY.formGenreAny)}</option>{GENRES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                <label className="text-xs text-fg-3">{t(COPY.formTags)}<input value={tags} onChange={(event) => setTags(event.target.value)} className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-fg" /></label>
                <label className="text-xs text-fg-3">{t(COPY.formVisibility)}<select value={visibility} onChange={(event) => setVisibility(event.target.value as CommunityCafeVisibility)} className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-fg">{Object.keys(CAFE_VISIBILITY_KEYS).map((value) => <option key={value} value={value}>{t(CAFE_VISIBILITY_KEYS[value as CommunityCafeVisibility])}</option>)}</select></label>
                <label className="text-xs text-fg-3">{t(COPY.formJoinPolicy)}<select value={joinPolicy} onChange={(event) => setJoinPolicy(event.target.value as CommunityCafeJoinPolicy)} className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-fg">{Object.keys(CAFE_JOIN_POLICY_KEYS).map((value) => <option key={value} value={value}>{t(CAFE_JOIN_POLICY_KEYS[value as CommunityCafeJoinPolicy])}</option>)}</select></label>
                <label className="text-xs text-fg-3 sm:col-span-2">{t(COPY.formPostingPolicy)}<select value={postingPolicy} onChange={(event) => setPostingPolicy(event.target.value as CommunityCafePostingPolicy)} className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-fg">{Object.keys(CAFE_POSTING_POLICY_KEYS).map((value) => <option key={value} value={value}>{t(CAFE_POSTING_POLICY_KEYS[value as CommunityCafePostingPolicy])}</option>)}</select></label>
                <label className="text-xs text-fg-3 sm:col-span-2">{t(COPY.formRules)} <span className="text-fg-3/70">{t(COPY.formRulesHint)}</span><textarea value={rules} onChange={(event) => setRules(event.target.value)} rows={4} className="mt-1 w-full resize-none rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-fg" /></label>
              </div>
              <button type="button" onClick={() => void saveSettings()} disabled={Boolean(busyKey)} className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-on-accent disabled:opacity-45"><Save size={14} />{t(COPY.saveSettings)}</button>
            </section>
          )}

          {canManage && (
            <section id="cafe-manage-requests" className="scroll-mt-24 rounded-2xl border border-line bg-card/60 p-4 sm:p-5">
              <h2 className="flex items-center gap-2 text-base font-semibold"><Check size={16} className="text-accent" />{t(COPY.navRequests)} <span className="text-xs font-normal text-fg-3">{requests.length}</span></h2>
              <div className="mt-3 space-y-2">
                {requests.length === 0 ? <p className="text-xs text-fg-3">{t(COPY.requestsNone)}</p> : requests.map((request) => (
                  <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-canvas/50 p-3">
                    <div><p className="text-sm font-medium">{request.userName}</p><p className="mt-1 text-xs text-fg-3">{request.message || t(COPY.requestNoMessage)}</p></div>
                    <div className="flex gap-2"><button type="button" onClick={() => void reviewRequest(request.id, "reject")} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs text-fg-3"><X size={13} />{t(COPY.reject)}</button><button type="button" onClick={() => void reviewRequest(request.id, "approve")} className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent"><Check size={13} />{t(COPY.approve)}</button></div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section id="cafe-manage-members" className="scroll-mt-24 rounded-2xl border border-line bg-card/60 p-4 sm:p-5">
            <h2 className="flex items-center gap-2 text-base font-semibold"><UserCog size={16} className="text-accent" />{canManage ? t(COPY.navMembersRoles) : t(COPY.navMembers)}</h2>
            <label className="mt-3 block max-w-md text-xs text-fg-3">{t(COPY.banReasonLabel)}<input value={banReasonInput} onChange={(event) => setBanReasonInput(event.target.value)} placeholder={t(COPY.banReasonDefault)} className="mt-1 min-h-11 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-fg" /></label>
            <div className="mt-3 divide-y divide-line/70">
              {members.length === 0 ? (
                <p className="py-4 text-xs text-fg-3">{t(COPY.membersNone)}</p>
              ) : members.map((member) => {
                const outranksMember = communityCafeRoleRank(cafe.viewerRole) > communityCafeRoleRank(member.role);
                const canChangeRole = canManage && outranksMember && member.role !== "owner" && member.userId !== userId;
                const canBan = outranksMember && member.role !== "owner" && member.userId !== userId;
                return (
                  <div key={member.userId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {member.name}
                        <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${member.role === "owner" ? "border border-accent/40 bg-accent-soft text-accent" : member.role === "admin" || member.role === "moderator" ? "border border-line bg-raised text-fg-2" : "border border-line bg-canvas/50 text-fg-3"}`}>
                          {t(CAFE_ROLE_KEYS[member.role])}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-fg-3">{t(COPY.joinedAt, { date: formatCafeDate(member.joinedAt) })}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {canChangeRole && <select aria-label={t(COPY.changeRoleAria, { name: member.name })} value={member.role} onChange={(event) => void updateRole(member, event.target.value as CommunityCafeRole)} className="min-h-11 rounded-lg border border-line bg-canvas px-2 py-1.5 text-xs text-fg"><option value="member">{t(CAFE_ROLE_KEYS.member)}</option><option value="moderator">{t(CAFE_ROLE_KEYS.moderator)}</option>{isOwner && <option value="admin">{t(CAFE_ROLE_KEYS.admin)}</option>}</select>}
                      {isOwner && member.role !== "owner" && <button type="button" onClick={() => void transferOwnership(member)} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs text-fg-2"><Crown size={12} />{t(COPY.ownership)}</button>}
                      {canBan && <button type="button" onClick={() => void banMember(member)} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-bad/30 px-2.5 py-1.5 text-xs text-bad"><Ban size={12} />{t(COPY.ban)}</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {canManage && (
            <section id="cafe-manage-invites" className="scroll-mt-24 rounded-2xl border border-line bg-card/60 p-4 sm:p-5">
              <h2 className="flex items-center gap-2 text-base font-semibold"><Link2 size={16} className="text-accent" />{t(COPY.navInvites)}</h2>
              <div className="mt-3 flex flex-wrap items-end gap-2"><label className="text-xs text-fg-3">{t(COPY.inviteUses)}<input type="number" min={1} max={100} value={inviteUses} onChange={(event) => setInviteUses(Number(event.target.value))} className="mt-1 block min-h-11 w-24 rounded-lg border border-line bg-canvas px-2 py-2 text-sm text-fg" /></label><label className="text-xs text-fg-3">{t(COPY.inviteDays)}<input type="number" min={1} max={30} value={inviteDays} onChange={(event) => setInviteDays(Number(event.target.value))} className="mt-1 block min-h-11 w-24 rounded-lg border border-line bg-canvas px-2 py-2 text-sm text-fg" /></label><button type="button" onClick={() => void createInvite()} className="min-h-11 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-on-accent">{t(COPY.createInvite)}</button></div>
              {createdInvite && <div className="mt-3 rounded-xl border border-accent/35 bg-accent-soft p-3"><p className="text-xs font-semibold text-accent">{t(COPY.inviteNewCode)}</p><code className="mt-1 block break-all text-xs text-fg">{createdInvite.code}</code><button type="button" onClick={() => void copyInvite()} className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-lg border border-accent/30 px-2.5 py-1 text-xs text-accent"><Clipboard size={12} />{t(COPY.copyLink)}</button></div>}
              <div className="mt-3 space-y-2">{listedInvites.length === 0 ? <p className="text-xs text-fg-3">{t(COPY.invitesNone)}</p> : listedInvites.map((invite) => <div key={invite.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3 text-xs"><span>{t(COPY.inviteMeta, { used: invite.useCount, max: invite.maxUses, date: formatCafeDate(invite.expiresAt) })}</span><button type="button" onClick={() => void revokeInvite(invite.id)} className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-lg px-2 text-bad"><Trash2 size={12} />{t(COPY.revoke)}</button></div>)}</div>
            </section>
          )}

          <section id="cafe-manage-bans" className="scroll-mt-24 rounded-2xl border border-line bg-card/60 p-4 sm:p-5">
            <h2 className="flex items-center gap-2 text-base font-semibold"><Ban size={16} className="text-accent" />{t(COPY.navBans)}</h2>
            <div className="mt-3 space-y-2">{bans.length === 0 ? <p className="text-xs text-fg-3">{t(COPY.bansNone)}</p> : bans.map((ban) => <div key={ban.userId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3"><div><p className="text-sm font-medium">{ban.userName}</p><p className="text-xs text-fg-3">{t(COPY.banMeta, { reason: ban.reason, date: formatCafeDate(ban.expiresAt) })}</p></div><button type="button" onClick={() => void unban(ban.userId)} className="min-h-11 rounded-lg border border-line px-2.5 py-1.5 text-xs text-fg-2">{t(COPY.unban)}</button></div>)}</div>
          </section>

          <section id="cafe-manage-logs" className="scroll-mt-24 rounded-2xl border border-line bg-card/60 p-4 sm:p-5">
            <h2 className="flex items-center gap-2 text-base font-semibold"><ShieldCheck size={16} className="text-accent" />{t(COPY.navLogs)}</h2>
            <div className="mt-3 space-y-2">{logs.length === 0 ? <p className="text-xs text-fg-3">{t(COPY.logsNone)}</p> : logs.map((log) => <div key={log.id} className="rounded-xl border border-line p-3"><div className="flex flex-wrap justify-between gap-2"><p className="text-xs font-semibold text-fg">{log.action}</p><time className="text-[0.68rem] text-fg-3">{formatCafeDate(log.createdAt)}</time></div><p className="mt-1 text-xs text-fg-3">{log.actorName}{log.targetUserId ? ` → ${log.targetUserId}` : ""}</p></div>)}</div>
          </section>

          {isOwner && cafe.status === "active" && (
            <section id="cafe-manage-danger" className="scroll-mt-24 rounded-2xl border border-bad/25 bg-bad/5 p-4 sm:p-5">
              <h2 className="text-base font-semibold text-bad">{t(COPY.navDanger)}</h2><p className="mt-1 text-xs text-fg-3">{t(COPY.dangerDescription)}</p><button type="button" onClick={() => void archiveCommunity()} className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-bad/35 px-3 py-2 text-xs font-semibold text-bad"><Trash2 size={13} />{t(COPY.archiveCafe)}</button>
            </section>
          )}
        </div>
      </Container>
    </div>
  );
}
