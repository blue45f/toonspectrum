import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
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
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
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
import { MotionIllustration } from "@/shared/motion-assets";
import { CAFE_KIND_ILLUSTRATIONS } from "./community-cafe-labels";
import { resolveApiError, safeParseJson } from "@/shared/lib/http-safe";
import {
  canShareCommunityCafe,
  compactPublicShareDescription,
} from "@/shared/lib/public-share-policy";
import { useApp } from "@/shared/lib/store";
import { relativeDate } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";
import {
  useDocumentTitle,
  useMetaDescription,
  usePageSocialMeta,
} from "@/shared/seo/use-document-title";
import { api, apiPath, getApiErrorMessage } from "@/platform/api";

const SharePageButton = lazy(async () => {
  const module = await import("@/shared/components/share-page-button");
  return { default: module.SharePageButton };
});

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
  const [membershipNotice, setMembershipNotice] = useState<string | null>(null);
  const [joinMessage, setJoinMessage] = useState("");
  const [inviteCode, setInviteCode] = useState(() => searchParams.get("invite") ?? "");
  const [refreshTick, setRefreshTick] = useState(0);

  const shareable = cafe ? canShareCommunityCafe(cafe) : false;
  const sharePath = slug ? `/community/cafes/${encodeURIComponent(slug)}` : "/community/cafes";
  const shareDescription = compactPublicShareDescription(
    shareable ? cafe?.description : null,
    translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "웹툰 창작자와 독자가 함께 이야기하는 공개 커뮤니티입니다."),
  );
  const publicMetaTitle = shareable && cafe ? cafe.name : translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "회원 커뮤니티");
  const publicMetaDescription = shareable
    ? shareDescription
    : translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "웹툰 창작자와 독자가 함께 이야기하는 회원 커뮤니티입니다.");

  useDocumentTitle(cafe ? cafe.name : notFound ? translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "커뮤니티를 찾을 수 없어요") : translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "커뮤니티"));
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
        if (!response.ok) throw new Error(resolveApiError(data, translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "커뮤니티 정보를 불러오지 못했습니다.")));
        return data as CommunityCafe;
      })
      .then((data) => {
        if (data) setCafe(data);
      })
      .catch((caught) => {
        if ((caught as Error).name !== "AbortError") setError(translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "커뮤니티 정보를 불러오지 못했습니다."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [authHeaders, refreshTick, slug]);

  async function changeMembership(action: "join" | "leave") {
    if (!userId || membershipBusy) return;
    if (action === "leave" && cafe?.viewerIsMember && !globalThis.confirm(translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "이 커뮤니티에서 탈퇴할까요?"))) return;
    setMembershipBusy(true);
    setMembershipError(null);
    setMembershipNotice(null);
    try {
      const path = `/community/cafes/${encodeURIComponent(slug)}/membership`;
      const data = action === "join"
        ? await api.post<CommunityCafe>(path, { message: joinMessage, inviteCode }, { headers: authHeaders })
        : await api.delete<CommunityCafe>(path, { headers: authHeaders });
      setCafe(data);
      if (data.viewerMembershipState === "member") {
        setJoinMessage("");
        setInviteCode("");
        setMembershipNotice(translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "가입이 완료됐어요. 환영합니다!"));
      } else if (data.viewerMembershipState === "pending") {
        setMembershipNotice(translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "가입 요청을 보냈어요. 운영진의 승인을 기다려 주세요."));
      } else if (action === "leave") {
        setMembershipNotice(translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "커뮤니티에서 탈퇴했어요."));
      }
    } catch (caught) {
      setMembershipError(
        await getApiErrorMessage(
          caught,
          action === "join"
            ? translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "가입하지 못했습니다.")
            : translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "탈퇴 또는 요청 취소를 처리하지 못했습니다."),
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
          <h1 className="text-2xl font-bold">{translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "커뮤니티를 찾을 수 없어요")}</h1>
          <p className="mt-2 text-sm text-fg-3">{translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "삭제됐거나 접근 권한이 없는 커뮤니티일 수 있습니다.")}</p>
          <Link href="/community/cafes" className="mt-6 inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent"><ArrowLeft size={15} />{translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "목록으로")}</Link>
        </div>
      </Container>
    );
  }

  if (error || !cafe) {
    return (
      <Container size="wide" className="py-16">
        <div className="rounded-3xl border border-bad/35 bg-bad/10 px-6 py-10 text-center">
          <p className="text-sm font-medium text-bad">{error ?? translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "커뮤니티 정보를 불러오지 못했습니다.")}</p>
          <button type="button" onClick={() => setRefreshTick((tick) => tick + 1)} className="mt-4 min-h-11 rounded-lg border border-bad/35 px-3 py-2 text-xs font-semibold text-bad">{translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "다시 시도")}</button>
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
          ? translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "보관된 커뮤니티는 읽기 전용입니다.")
          : isMember && cafe.postingPolicy === "staff"
            ? translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "이 커뮤니티는 운영진만 글과 댓글을 작성할 수 있어요.")
            : translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "가입한 회원만 글과 댓글을 작성할 수 있어요."),
        actionLabel: !isMember && userId && !isPending && !isBanned ? translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "가입하기") : undefined,
        onAction: !isMember && userId && !isPending && !isBanned ? () => void changeMembership("join") : undefined,
      };

  return (
    <Container size="wide" className="relative py-8 lg:py-10">
      <nav aria-label={translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "이동 경로")} className="mb-5 flex flex-wrap items-center gap-2 text-xs text-fg-3">
        <Link href="/community" className="hover:text-fg">{translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "커뮤니티")}</Link><span aria-hidden>/</span>
        <Link href="/community/cafes" className="hover:text-fg">{translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "회원 커뮤니티")}</Link><span aria-hidden>/</span>
        <span className="text-fg-2">{cafe.name}</span>
      </nav>

      <header className="overflow-hidden rounded-3xl border border-line bg-panel/55">
        {/* 카페 유형별 헤더 배너 — 장식용. */}
        <div className="relative flex h-28 items-center justify-between gap-3 overflow-hidden bg-accent-soft/25 px-5 sm:h-32 sm:px-8" aria-hidden="true">
          <span className="rounded-full bg-accent px-3 py-1 text-xs font-bold text-on-accent">
            {translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", COMMUNITY_CAFE_KIND_LABELS[cafe.kind])}
          </span>
          <MotionIllustration
            name={CAFE_KIND_ILLUSTRATIONS[cafe.kind]}
            size="lg"
            animated={false}
          />
        </div>
        <div className="p-5 sm:p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0 flex-1">
            <p className="eyebrow flex items-center gap-1.5 text-accent"><Coffee size={14} />{translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", COMMUNITY_CAFE_KIND_LABELS[cafe.kind])}</p>
            <h1 className="mt-2 flex flex-wrap items-center gap-2 text-[clamp(1.4rem,6vw,1.5rem)] font-bold tracking-tight sm:text-3xl">
              {cafe.name}
              <span className="rounded-full border border-line bg-canvas/45 px-2 py-0.5 text-xs font-medium text-fg-3">{cafe.genre || translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "자유")}</span>
              {cafe.visibility === "private" && <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs text-fg-3"><Lock size={10} />{translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "비공개")}</span>}
              {cafe.status === "archived" && <span className="rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-xs text-warn">{translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "보관됨")}</span>}
              {isOwner && <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent"><Crown size={11} />{translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "소유자")}</span>}
            </h1>
            <p className="mt-2 max-w-2xl whitespace-pre-wrap text-sm leading-relaxed text-fg-2">{cafe.description}</p>
            {cafe.tags.length > 0 && <div className="mt-3 flex flex-wrap gap-1">{cafe.tags.map((tag) => <span key={tag} className="rounded-full bg-canvas/70 px-2 py-0.5 text-xs text-fg-3">#{tag}</span>)}</div>}
            <p className="mt-3 text-xs text-fg-3">
              {translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", COMMUNITY_CAFE_VISIBILITY_LABELS[cafe.visibility])} · {translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", COMMUNITY_CAFE_JOIN_POLICY_LABELS[cafe.joinPolicy])} · {translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", COMMUNITY_CAFE_POSTING_POLICY_LABELS[cafe.postingPolicy])}
            </p>
            <p className="mt-1 text-xs text-fg-3">{translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "멤버 ")}<span className="numeral text-fg-2" aria-label={`멤버 ${cafe.memberCount}명`}>{cafe.memberCount}</span> {translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "· 글 ")}<span className="numeral text-fg-2" aria-label={`게시글 ${cafe.postCount}개`}>{cafe.postCount}</span> {translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "· 소유자 ")}{cafe.ownerName} · <span aria-label={`개설일 ${relativeDate(cafe.createdAt)}`}>{relativeDate(cafe.createdAt)}</span> {translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "개설")}</p>
          </div>

          <div className="w-full max-w-xs space-y-2 sm:w-auto">
            {shareable && (
              <Suspense fallback={null}>
                <SharePageButton
                  path={sharePath}
                  text={cafe.name}
                  description={shareDescription}
                  label={translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "커뮤니티 공유")}
                  actionLabel={translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "커뮤니티 보기")}
                  className="w-full justify-center rounded-lg"
                />
              </Suspense>
            )}
            {canManage && (
              <Link href={formatI18nTemplate(translateCurrentStaticSourceText("domains.community.CafeDetailPage", "en", "/community/cafes/{v0}/manage"), { v0: String(encodeURIComponent(cafe.slug)) })} className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-xs font-semibold text-accent"><Settings size={14} />{translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "운영 관리")}</Link>
            )}
            {userId ? (
              isMember ? (
                isOwner ? <p className="rounded-lg border border-line bg-canvas/45 px-3 py-2 text-center text-xs text-fg-3">{translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "소유권 이전 후 탈퇴할 수 있어요.")}</p> : (
                  <button type="button" onClick={() => void changeMembership("leave")} disabled={membershipBusy} className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-medium text-fg-3 hover:border-bad/45 hover:text-bad disabled:opacity-45"><DoorOpen size={14} />{membershipBusy ? translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "처리 중...") : translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "탈퇴하기")}</button>
                )
              ) : isPending ? (
                <button type="button" onClick={() => void changeMembership("leave")} disabled={membershipBusy} className="min-h-11 w-full rounded-lg border border-line px-3 py-2 text-xs font-medium text-fg-2 disabled:opacity-45">{membershipBusy ? translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "처리 중...") : translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "가입 요청 취소")}</button>
              ) : isBanned ? (
                <p className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-center text-xs text-bad">{translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "가입할 수 없는 커뮤니티입니다.")}</p>
              ) : (
                <div className="space-y-2">
                  {requiresApproval && <textarea value={joinMessage} onChange={(event) => setJoinMessage(event.target.value.slice(0, 300))} rows={2} placeholder={translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "가입 인사 또는 참여 목적")} className="w-full resize-none rounded-lg border border-line bg-card px-2.5 py-2 text-xs text-fg" />}
                  {(requiresInvite || inviteCode) && <input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} placeholder={translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "초대 코드")} className="min-h-11 w-full rounded-lg border border-line bg-card px-2.5 py-2 text-xs text-fg" />}
                  <button type="button" onClick={() => void changeMembership("join")} disabled={membershipBusy || (requiresInvite && !inviteCode.trim())} className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-on-accent disabled:opacity-45"><UserPlus size={14} />{membershipBusy ? translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "처리 중...") : requiresApproval ? translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "가입 요청") : translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "가입하기")}</button>
                </div>
              )
            ) : <p className="rounded-lg border border-line bg-canvas/45 px-3 py-2 text-center text-xs text-fg-3">{translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "로그인하면 가입할 수 있어요.")}</p>}
            {membershipError && <p role="alert" className="text-xs text-bad">{membershipError}</p>}
            {membershipNotice && <p role="status" className="rounded-lg border border-good/30 bg-good/10 px-3 py-2 text-xs text-good">{membershipNotice}</p>}
            {cafe.viewerRole && <p className="text-center text-xs text-fg-3">{translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "내 역할: ")}{translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", COMMUNITY_CAFE_ROLE_LABELS[cafe.viewerRole])}</p>}
          </div>
        </div>
        </div>
      </header>

      {cafe.rules.length > 0 && (
        <section className="mt-5 rounded-2xl border border-line bg-card/60 p-4" aria-labelledby="community-rules-title">
          <h2 id="community-rules-title" className="inline-flex items-center gap-1.5 text-sm font-semibold"><ShieldCheck size={15} className="text-accent" />{translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "커뮤니티 규칙")}</h2>
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
            <h2 className="text-base font-semibold">{translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "회원 전용 커뮤니티")}</h2>
            <p className="mt-2 text-sm text-fg-3">{translateCurrentStaticSourceText("domains.community.CafeDetailPage", "ko", "가입이 완료되면 게시글과 댓글을 볼 수 있어요.")}</p>
          </div>
        )}
      </section>
    </Container>
  );
}
