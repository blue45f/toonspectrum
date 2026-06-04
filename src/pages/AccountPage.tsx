"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Link from "@/src/compat/router-link";
import { Container } from "@/components/section";
import { buttonClass } from "@/components/ui/button";
import { CoverImage } from "@/components/cover-image";
import { ErrorState } from "@/src/components/error-state";
import { AvatarUploader } from "@/components/avatar-uploader";
import { cn, formatCount, relativeDate } from "@/lib/utils";
import { useApp, useHydrated } from "@/lib/store";
import { useSession } from "@/src/compat/auth-session";
import { AuthModal } from "@/components/auth/auth-modal";
import { listWorks, getCurrentUserId, type WorkSummary } from "@/src/lib/creator-client";
import { updateMyProfile } from "@/src/lib/me-client";
import {
  Bookmark,
  BookOpen,
  CheckCircle2,
  FolderHeart,
  PenLine,
  Star,
  UserRound,
  Eye,
  Heart,
  MessageCircle,
  Check,
  Loader2,
} from "lucide-react";

type Tab = "posts" | "activity" | "profile";
const TABS: { id: Tab; label: string }[] = [
  { id: "posts", label: "내 게시물" },
  { id: "activity", label: "내 활동" },
  { id: "profile", label: "프로필" },
];

function isTab(value: string | null): value is Tab {
  return value === "posts" || value === "activity" || value === "profile";
}

// ── 로그아웃 상태 안내 ──────────────────────────────
function SignInPrompt() {
  const [modal, setModal] = useState(false);
  return (
    <Container size="prose" className="py-16">
      <div className="rounded-2xl border border-dashed border-line bg-card/40 p-12 text-center">
        <UserRound size={28} className="mx-auto mb-3 text-fg-3" />
        <h1 className="text-lg font-bold text-fg">로그인이 필요해요</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-fg-3">
          내 게시물과 활동, 프로필을 확인하려면 로그인해 주세요.
        </p>
        <button
          type="button"
          onClick={() => setModal(true)}
          className={buttonClass({ variant: "solid", className: "mt-5 gap-1.5" })}
        >
          <UserRound size={16} />
          로그인
        </button>
      </div>
      {modal && <AuthModal onClose={() => setModal(false)} />}
    </Container>
  );
}

// ── 내 게시물(창작물) 그리드 ───────────────────────────
function PostCard({ work }: { work: WorkSummary }) {
  return (
    <Link
      href={`/create/${work.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-panel/30 transition-colors hover:border-line-strong"
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-raised/40">
        <CoverImage
          src={work.cover}
          alt={work.title}
          className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
          fallback={
            <span className="grid h-full w-full place-items-center bg-gradient-to-br from-raised to-card text-fg-3">
              <PenLine size={28} />
            </span>
          }
        />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="line-clamp-2 text-sm font-semibold leading-tight text-fg group-hover:text-accent">
          {work.title}
        </h3>
        <div className="mt-auto flex items-center gap-3 pt-1.5 text-[0.72rem] text-fg-3">
          <span className="inline-flex items-center gap-1">
            <Heart size={12} className={cn(work.liked && "fill-accent text-accent")} />
            <span className="numeral">{formatCount(work.likes)}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageCircle size={12} />
            <span className="numeral">{formatCount(work.comments)}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Eye size={12} />
            <span className="numeral">{formatCount(work.views)}</span>
          </span>
          <span className="ml-auto shrink-0">{relativeDate(work.createdAt)}</span>
        </div>
      </div>
    </Link>
  );
}

function PostsTab({ userId }: { userId: string }) {
  const [works, setWorks] = useState<WorkSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listWorks({ userId }, controller.signal)
      .then((result) => {
        if (alive) setWorks(result);
      })
      .catch((err: unknown) => {
        if (!alive || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "내 게시물을 불러오지 못했어요.");
        setWorks([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [userId, reloadKey]);

  if (error) {
    return (
      <ErrorState
        title="내 게시물을 불러오지 못했어요."
        message={error}
        onRetry={() => setReloadKey((value) => value + 1)}
      />
    );
  }
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="overflow-hidden rounded-2xl border border-line bg-panel/30">
            <span className="skeleton block aspect-[3/4]" />
            <div className="space-y-2 p-3">
              <span className="skeleton block h-4 w-full" />
              <span className="skeleton block h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (works.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-card/40 p-12 text-center">
        <PenLine size={26} className="mx-auto mb-3 text-fg-3" />
        <p className="text-sm font-medium text-fg">아직 올린 창작물이 없어요.</p>
        <p className="mt-1 text-xs text-fg-3">창작 스튜디오에서 첫 작품을 만들어 보세요.</p>
        <Link
          href="/studio"
          className={buttonClass({ size: "sm", variant: "outline", className: "mt-4 gap-1.5" })}
        >
          <PenLine size={14} />
          창작 스튜디오로 만들기
        </Link>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {works.map((work) => (
        <PostCard key={work.id} work={work} />
      ))}
    </div>
  );
}

// ── 내 활동(로컬 스토어 요약) ───────────────────────────
function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Star;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-panel/40 p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
        <Icon size={18} />
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-bold leading-none text-fg numeral">{value}</p>
        <p className="mt-1 text-xs text-fg-3">{label}</p>
      </div>
    </div>
  );
}

function ActivityTab() {
  const hydrated = useHydrated();
  const reviews = useApp((s) => s.reviews);
  const reads = useApp((s) => s.reads);
  const collections = useApp((s) => s.collections);

  if (!hydrated) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <span key={i} className="skeleton block h-[4.5rem] rounded-2xl" />
        ))}
      </div>
    );
  }

  const reviewCount = Object.keys(reviews).length;
  const readEntries = Object.entries(reads);
  const wantCount = readEntries.filter(([, s]) => s === "want").length;
  const readingCount = readEntries.filter(([, s]) => s === "reading").length;
  const doneCount = readEntries.filter(([, s]) => s === "done").length;
  const collectionCount = collections.length;

  // 최근 리뷰(createdAt 기준 내림차순) — 작품 메타가 로컬에 없어 titleId로 상세 링크만 제공.
  const recentReviews = Object.values(reviews)
    .slice()
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .slice(0, 6);

  const empty =
    reviewCount === 0 && wantCount === 0 && readingCount === 0 && doneCount === 0 && collectionCount === 0;

  if (empty) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-card/40 p-12 text-center">
        <Star size={26} className="mx-auto mb-3 text-fg-3" />
        <p className="text-sm font-medium text-fg">아직 활동 기록이 없어요.</p>
        <p className="mt-1 text-xs text-fg-3">작품에 별점·리뷰를 남기거나 찜·서재에 담아 보세요.</p>
        <Link
          href="/ranking"
          className={buttonClass({ size: "sm", variant: "outline", className: "mt-4 gap-1.5" })}
        >
          작품 둘러보기
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard icon={Star} label="작성한 리뷰" value={reviewCount} />
        <StatCard icon={Bookmark} label="찜(보고 싶어요)" value={wantCount} />
        <StatCard icon={BookOpen} label="보는 중" value={readingCount} />
        <StatCard icon={CheckCircle2} label="완독" value={doneCount} />
        <StatCard icon={FolderHeart} label="컬렉션" value={collectionCount} />
      </div>

      {recentReviews.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-fg-3">최근 리뷰</h2>
          <ul className="space-y-2">
            {recentReviews.map((review) => (
              <li key={review.titleId}>
                <Link
                  href={`/title/${review.titleId}`}
                  className="flex items-start gap-3 rounded-xl border border-line bg-panel/30 p-3 transition-colors hover:border-line-strong"
                >
                  <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">
                    <Star size={12} className="fill-accent" />
                    {review.rating.toFixed(1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm text-fg-2">
                      {review.text || "(별점만 남긴 리뷰)"}
                    </p>
                    {review.createdAt && (
                      <p className="mt-1 text-[0.7rem] text-fg-3">{relativeDate(review.createdAt)}</p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-[0.72rem] leading-relaxed text-fg-3">
        활동 기록은 이 브라우저(및 로그인 시 계정)에 저장됩니다. 자세한 목록은{" "}
        <Link href="/library" className="text-accent underline-offset-2 hover:underline">
          내 서재
        </Link>
        에서 볼 수 있어요.
      </p>
    </div>
  );
}

// ── 프로필 편집(아바타 + 이름 + 소개) ─────────────────
function ProfileTab() {
  const { data: session } = useSession();
  const user = session?.user;
  const fallbackInitial = (user?.name ?? user?.email ?? "U").charAt(0).toUpperCase();

  const [name, setName] = useState(user?.name ?? "");
  const [bio, setBio] = useState("");
  const [image, setImage] = useState<string | null>(user?.image ?? null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 서버 프로필(소개 포함)을 불러와 폼 초기값을 채운다(세션엔 bio가 없음).
  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    fetch("/api/me", { cache: "no-store", headers: { "x-user-id": user.id } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { profile?: { name?: string | null; bio?: string | null; image?: string | null } } | null) => {
        if (!alive || !data?.profile) return;
        setName((prev) => prev || data.profile?.name || "");
        setBio((prev) => prev || data.profile?.bio || "");
        setImage((prev) => prev ?? data.profile?.image ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user?.id]);

  const onSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateMyProfile({ name: name.trim(), bio: bio.trim(), image });
      setSaved(true);
      // 사이트 헤더/메뉴 아바타 반영을 위해 페이지를 새로고침(세션 객체는 localStorage 기반이라 직접 갱신 불가).
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "프로필을 저장하지 못했어요.");
    } finally {
      setSaving(false);
    }
  };

  const nameInvalid = name.trim().length === 0;

  return (
    <div className="max-w-xl space-y-6">
      <section className="rounded-2xl border border-line bg-panel/40 p-5">
        <h2 className="mb-1 text-sm font-semibold text-fg">프로필 사진</h2>
        <p className="mb-4 text-[0.78rem] text-fg-3">메뉴와 댓글 등 내 이름이 보이는 곳에 표시돼요.</p>
        <AvatarUploader
          value={image}
          fallbackText={fallbackInitial}
          onChange={setImage}
          onError={setError}
          disabled={saving}
        />
      </section>

      <section className="rounded-2xl border border-line bg-panel/40 p-5 space-y-4">
        <div>
          <label htmlFor="profile-name" className="mb-1.5 block text-sm font-semibold text-fg">
            이름
          </label>
          <input
            id="profile-name"
            type="text"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
            className="w-full rounded-xl border border-line bg-card px-3.5 py-2.5 text-sm text-fg outline-none transition-colors focus:border-accent/70 focus-visible:ring-2 focus-visible:ring-accent/40"
            placeholder="표시할 이름"
          />
        </div>
        <div>
          <label htmlFor="profile-bio" className="mb-1.5 block text-sm font-semibold text-fg">
            소개
          </label>
          <textarea
            id="profile-bio"
            value={bio}
            maxLength={280}
            rows={3}
            onChange={(e) => setBio(e.target.value)}
            disabled={saving}
            className="w-full resize-none rounded-xl border border-line bg-card px-3.5 py-2.5 text-sm text-fg outline-none transition-colors focus:border-accent/70 focus-visible:ring-2 focus-visible:ring-accent/40"
            placeholder="나를 한 줄로 소개해 보세요."
          />
          <p className="mt-1 text-right text-[0.7rem] text-fg-3 numeral">{bio.length}/280</p>
        </div>
      </section>

      {error && (
        <p className="rounded-xl border border-bad/40 bg-bad/10 px-3.5 py-2.5 text-sm text-bad" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || nameInvalid}
          className={buttonClass({ variant: "solid", className: "gap-1.5" })}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? <Check size={16} /> : null}
          {saving ? "저장 중…" : saved ? "저장됨" : "프로필 저장"}
        </button>
        {nameInvalid && <span className="text-xs text-fg-3">이름을 입력해 주세요.</span>}
      </div>
    </div>
  );
}

export function AccountPage() {
  const { status } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: Tab = isTab(tabParam) ? tabParam : "posts";
  const userId = getCurrentUserId();

  if (status !== "authenticated" || !userId) {
    return <SignInPrompt />;
  }

  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  return (
    <Container size="wide" className="py-10">
      <header className="mb-7">
        <p className="eyebrow flex items-center gap-1.5 text-accent">
          <UserRound size={14} /> MY ACCOUNT
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">내 정보</h1>
        <p className="mt-2 max-w-xl text-pretty text-sm leading-relaxed text-fg-2">
          내가 올린 게시물과 활동 기록을 확인하고 프로필을 관리합니다.
        </p>
      </header>

      <div role="tablist" aria-label="내 정보 탭" className="mb-6 flex flex-wrap gap-1.5 border-b border-line">
        {TABS.map((option) => {
          const on = option.id === tab;
          return (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(option.id)}
              className={cn(
                "-mb-px border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors",
                on
                  ? "border-accent text-fg"
                  : "border-transparent text-fg-3 hover:text-fg"
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {tab === "posts" && <PostsTab userId={userId} />}
      {tab === "activity" && <ActivityTab />}
      {tab === "profile" && <ProfileTab />}
    </Container>
  );
}
