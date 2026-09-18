import {
  ArrowLeft,
  Coffee,
  Crown,
  DoorOpen,
  Lock,
  Settings,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import {
  COMMUNITY_CAFE_JOIN_POLICY_LABELS,
  COMMUNITY_CAFE_KIND_LABELS,
  COMMUNITY_CAFE_POSTING_POLICY_LABELS,
  COMMUNITY_CAFE_ROLE_LABELS,
  COMMUNITY_CAFE_VISIBILITY_LABELS,
} from "@/shared/lib/types";
import type { CommunityCafe } from "@/shared/lib/types";

import { FanCafePanel } from "@/shared/components/fan-cafe-panel";
import { Container } from "@/shared/components/section";
import { SharePageButton } from "@/shared/components/share-page-button";
import { resolveApiError, safeParseJson } from "@/shared/lib/http-safe";
import {
  canShareCommunityCafe,
  compactPublicShareDescription,
} from "@/shared/lib/public-share-policy";
import { useApp } from "@/shared/lib/store";
import { relativeDate } from "@/shared/lib/utils";
import Link from "@/compat/router-link";
import {
  useDocumentTitle,
  useMetaDescription,
  usePageSocialMeta,
} from "@/hooks/use-document-title";
import { api, apiPath, getApiErrorMessage } from "@/infrastructure/api";

export function CafeDetailPage() {
  const { slug: rawSlug } = useParams();
  const [searchParams] = useSearchParams();
  const slug = rawSlug ?? "";
  const userId = useApp((state) => state.userId);
  const sessionToken = useApp((state) => state.sessionToken);
  const authHeaders = useMemo(
    () => (sessionToken ? { "x-user-id": sessionToken } : undefined),
    [sessionToken],
  );

  const [cafe, setCafe] = useState<CommunityCafe | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [membershipBusy, setMembershipBusy] = useState(false);
  const [membershipError, setMembershipError] = useState<string | null>(null);
  const [joinMessage, setJoinMessage] = useState("");
  const [inviteCode, setInviteCode] = useState(() => searchParams.get("invite") ?? "");
  const [refreshTick, setRefreshTick] = useState(0);

  const shareable = cafe ? canShareCommunityCafe(cafe) : false;
  const sharePath = slug ? `/community/cafes/${encodeURIComponent(slug)}` : "/community/cafes";
  const shareDescription = compactPublicShareDescription(
    shareable ? cafe?.description : null,
    "웹툰 창작자와 독자가 함께 이야기하는 공개 커뮤니티입니다.",
  );
  const publicMetaTitle = shareable && cafe ? cafe.name : "회원 커뮤니티";
  const publicMetaDescription = shareable
    ? shareDescription
    : "웹툰 창작자와 독자가 함께 이야기하는 회원 커뮤니티입니다.";

  useDocumentTitle(cafe ? cafe.name : notFound ? "커뮤니티를 찾을 수 없어요" : "커뮤니티");
  useMetaDescription(cafe ? publicMetaDescription : null);
  usePageSocialMeta({
    canonicalPath: sharePath,
    title: publicMetaTitle,
    description: publicMetaDescription,
    type: "website",
  });

  useEffect(() => {
    const fromQuery = searchParams.get("invite");
    if (fromQuery) setInviteCode(fromQuery);
  }, [searchParams]);

  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setNotFound(false);
    api
      .raw(apiPath(`/community/cafes/${encodeURIComponent(slug)}`), {
        cache: "no-store",
        signal: controller.signal,
        throwHttpErrors: false,
        headers: authHeaders,
      })
      .then(async (response) => {
        if (response.status === 404) {
          setNotFound(true);
          return null;
        }
        const data = await safeParseJson<unknown>(response);
        if (!response.ok) throw new Error(resolveApiError(data, "커뮤니티 정보를 불러오지 못했습니다."));
        return data as CommunityCafe;
      })
      .then((data) => {
        if (data) setCafe(data);
      })
      .catch((caught) => {
        if ((caught as Error).name !== "AbortError") setError("커뮤니티 정보를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [authHeaders, refreshTick, slug]);

  async function changeMembership(action: "join" | "leave") {
    if (!userId || membershipBusy) return;
    if (action === "leave" && cafe?.viewerIsMember && !globalThis.confirm("이 커뮤니티에서 탈퇴할까요?")) return;
    setMembershipBusy(true);
    setMembershipError(null);
    try {
      const path = `/community/cafes/${encodeURIComponent(slug)}/membership`;
      const data = action === "join"
        ? await api.post<CommunityCafe>(path, { message: joinMessage, inviteCode }, { headers: authHeaders })
        : await api.delete<CommunityCafe>(path, { headers: authHeaders });
      setCafe(data);
      if (data.viewerMembershipState === "member") {
        setJoinMessage("");
        setInviteCode("");
      }
    } catch (caught) {
      setMembershipError(
        await getApiErrorMessage(
          caught,
          action === "join" ? "가입하지 못했습니다." : "탈퇴 또는 요청 취소를 처리하지 못했습니다.",
        ),
      );
    } finally {
      setMembershipBusy(false);
    }
  }

  if (loading && !cafe) {
    return <Container size="wide" className="py-10"><div className="skeleton h-40 rounded-3xl" /><div className="skeleton mt-6 h-72 rounded-3xl" /></Container>;
  }

  if (notFound) {
    return (
      <Container size="wide" className="py-16">
        <div className="rounded-3xl border border-dashed border-line bg-card/50 px-6 py-14 text-center">
          <Coffee className="mx-auto mb-3 text-fg-3" size={24} />
          <h1 className="text-2xl font-bold">커뮤니티를 찾을 수 없어요</h1>
          <p className="mt-2 text-sm text-fg-3">삭제됐거나 접근 권한이 없는 커뮤니티일 수 있습니다.</p>
          <Link href="/community/cafes" className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent"><ArrowLeft size={15} />목록으로</Link>
        </div>
      </Container>
    );
  }

  if (error || !cafe) {
    return (
      <Container size="wide" className="py-16">
        <div className="rounded-3xl border border-bad/35 bg-bad/10 px-6 py-10 text-center">
          <p className="text-sm font-medium text-bad">{error ?? "커뮤니티 정보를 불러오지 못했습니다."}</p>
          <button type="button" onClick={() => setRefreshTick((tick) => tick + 1)} className="mt-4 rounded-lg border border-bad/35 px-3 py-2 text-xs font-semibold text-bad">다시 시도</button>
        </div>
      </Container>
    );
  }

  const isMember = Boolean(cafe.viewerIsMember);
  const isOwner = cafe.viewerRole === "owner";
  const isPending = cafe.viewerMembershipState === "pending";
  const isBanned = cafe.viewerMembershipState === "banned";
  const canManage = Boolean(cafe.viewerCanModerate);
  const canViewContent = Boolean(cafe.viewerCanViewContent);
  const canPost = Boolean(cafe.viewerCanPost);
  const requiresInvite = cafe.joinPolicy === "invite";
  const requiresApproval = cafe.joinPolicy === "approval";
  const composeLock = canPost
    ? null
    : {
        message: cafe.status === "archived"
          ? "보관된 커뮤니티는 읽기 전용입니다."
          : isMember && cafe.postingPolicy === "staff"
            ? "이 커뮤니티는 운영진만 글과 댓글을 작성할 수 있어요."
            : "가입한 회원만 글과 댓글을 작성할 수 있어요.",
        actionLabel: !isMember && userId && !isPending && !isBanned ? "가입하기" : undefined,
        onAction: !isMember && userId && !isPending && !isBanned ? () => void changeMembership("join") : undefined,
      };

  return (
    <Container size="wide" className="relative py-8 lg:py-10">
      <nav aria-label="이동 경로" className="mb-5 flex flex-wrap items-center gap-2 text-xs text-fg-3">
        <Link href="/community" className="hover:text-fg">커뮤니티</Link><span aria-hidden>/</span>
        <Link href="/community/cafes" className="hover:text-fg">회원 커뮤니티</Link><span aria-hidden>/</span>
        <span className="text-fg-2">{cafe.name}</span>
      </nav>

      <header className="rounded-3xl border border-line bg-panel/55 p-5 sm:p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0 flex-1">
            <p className="eyebrow flex items-center gap-1.5 text-accent"><Coffee size={14} />{COMMUNITY_CAFE_KIND_LABELS[cafe.kind]}</p>
            <h1 className="mt-2 flex flex-wrap items-center gap-2 text-[clamp(1.4rem,6vw,1.5rem)] font-bold tracking-tight sm:text-3xl">
              {cafe.name}
              <span className="rounded-full border border-line bg-canvas/45 px-2 py-0.5 text-[0.68rem] font-medium text-fg-3">{cafe.genre || "자유"}</span>
              {cafe.visibility === "private" && <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[0.68rem] text-fg-3"><Lock size={10} />비공개</span>}
              {cafe.status === "archived" && <span className="rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-[0.68rem] text-warn">보관됨</span>}
              {isOwner && <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent-soft px-2 py-0.5 text-[0.68rem] font-semibold text-accent"><Crown size={11} />소유자</span>}
            </h1>
            <p className="mt-2 max-w-2xl whitespace-pre-wrap text-sm leading-relaxed text-fg-2">{cafe.description}</p>
            {cafe.tags.length > 0 && <div className="mt-3 flex flex-wrap gap-1">{cafe.tags.map((tag) => <span key={tag} className="rounded-full bg-canvas/70 px-2 py-0.5 text-[0.68rem] text-fg-3">#{tag}</span>)}</div>}
            <p className="mt-3 text-xs text-fg-3">
              {COMMUNITY_CAFE_VISIBILITY_LABELS[cafe.visibility]} · {COMMUNITY_CAFE_JOIN_POLICY_LABELS[cafe.joinPolicy]} · {COMMUNITY_CAFE_POSTING_POLICY_LABELS[cafe.postingPolicy]}
            </p>
            <p className="mt-1 text-xs text-fg-3">멤버 <span className="numeral text-fg-2">{cafe.memberCount}</span> · 글 <span className="numeral text-fg-2">{cafe.postCount}</span> · 소유자 {cafe.ownerName} · {relativeDate(cafe.createdAt)} 개설</p>
          </div>

          <div className="w-full max-w-xs space-y-2 sm:w-auto">
            {shareable && (
              <SharePageButton
                path={sharePath}
                text={cafe.name}
                description={shareDescription}
                label="커뮤니티 공유"
                actionLabel="커뮤니티 보기"
                className="w-full justify-center rounded-lg"
              />
            )}
            {canManage && (
              <Link href={`/community/cafes/${encodeURIComponent(cafe.slug)}/manage`} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-xs font-semibold text-accent"><Settings size={14} />운영 관리</Link>
            )}
            {userId ? (
              isMember ? (
                isOwner ? <p className="rounded-lg border border-line bg-canvas/45 px-3 py-2 text-center text-xs text-fg-3">소유권 이전 후 탈퇴할 수 있어요.</p> : (
                  <button type="button" onClick={() => void changeMembership("leave")} disabled={membershipBusy} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-medium text-fg-3 hover:border-bad/45 hover:text-bad disabled:opacity-45"><DoorOpen size={14} />{membershipBusy ? "처리 중..." : "탈퇴하기"}</button>
                )
              ) : isPending ? (
                <button type="button" onClick={() => void changeMembership("leave")} disabled={membershipBusy} className="w-full rounded-lg border border-line px-3 py-2 text-xs font-medium text-fg-2 disabled:opacity-45">{membershipBusy ? "처리 중..." : "가입 요청 취소"}</button>
              ) : isBanned ? (
                <p className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-center text-xs text-bad">가입할 수 없는 커뮤니티입니다.</p>
              ) : (
                <div className="space-y-2">
                  {requiresApproval && <textarea value={joinMessage} onChange={(event) => setJoinMessage(event.target.value.slice(0, 300))} rows={2} placeholder="가입 인사 또는 참여 목적" className="w-full resize-none rounded-lg border border-line bg-card px-2.5 py-2 text-xs text-fg" />}
                  {(requiresInvite || inviteCode) && <input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} placeholder="초대 코드" className="w-full rounded-lg border border-line bg-card px-2.5 py-2 text-xs text-fg" />}
                  <button type="button" onClick={() => void changeMembership("join")} disabled={membershipBusy || (requiresInvite && !inviteCode.trim())} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-on-accent disabled:opacity-45"><UserPlus size={14} />{membershipBusy ? "처리 중..." : requiresApproval ? "가입 요청" : "가입하기"}</button>
                </div>
              )
            ) : <p className="rounded-lg border border-line bg-canvas/45 px-3 py-2 text-center text-xs text-fg-3">로그인하면 가입할 수 있어요.</p>}
            {membershipError && <p className="text-xs text-bad">{membershipError}</p>}
            {cafe.viewerRole && <p className="text-center text-[0.68rem] text-fg-3">내 역할: {COMMUNITY_CAFE_ROLE_LABELS[cafe.viewerRole]}</p>}
          </div>
        </div>
      </header>

      {cafe.rules.length > 0 && (
        <section className="mt-5 rounded-2xl border border-line bg-card/60 p-4" aria-labelledby="community-rules-title">
          <h2 id="community-rules-title" className="inline-flex items-center gap-1.5 text-sm font-semibold"><ShieldCheck size={15} className="text-accent" />커뮤니티 규칙</h2>
          <ol className="mt-3 grid gap-2 sm:grid-cols-2">
            {cafe.rules.map((rule, index) => <li key={rule.id} className="rounded-xl border border-line bg-canvas/40 p-3"><p className="text-xs font-semibold text-fg">{index + 1}. {rule.title}</p>{rule.description && <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-fg-3">{rule.description}</p>}</li>)}
          </ol>
        </section>
      )}

      <section className="mt-6">
        {canViewContent ? (
          <FanCafePanel scope="cafe" targetId={cafe.slug} targetLabel={cafe.name} composeLock={composeLock} compact />
        ) : (
          <div className="rounded-3xl border border-dashed border-line bg-card/45 px-6 py-16 text-center">
            <Lock className="mx-auto mb-3 text-fg-3" size={24} />
            <h2 className="text-base font-semibold">회원 전용 커뮤니티</h2>
            <p className="mt-2 text-sm text-fg-3">가입이 완료되면 게시글과 댓글을 볼 수 있어요.</p>
          </div>
        )}
      </section>
    </Container>
  );
}
