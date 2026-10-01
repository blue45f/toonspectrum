// 창작 챌린지 — 진행 중 주제 카드(D-day) + 챌린지별 참여작 그리드 + 참여 3단계 안내.
import { useFx } from "@toonstudio/core/fx";
import { ArrowLeft, CalendarClock, LayoutGrid, Lightbulb, PenLine, Share2, Sparkles, Trophy, Users } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { WorkCard, WorkGridSkeleton } from "./creator-community-ui";
import { buildStudioHref } from "./creator-studio-links";
import { SHOWCASE_HOME_PATH } from "./publishing/showcase-links";
import {
  ShowcaseEmptyState,
  ShowcaseStepStrip,
  ShowcaseUnavailableState,
  type ShowcaseStep,
} from "./publishing/ShowcaseStates";
import { useShowcaseResource } from "./publishing/use-showcase-resource";

import { CountUp } from "@/shared/components/count-up";
import { RevealOnScroll } from "@/shared/components/reveal-on-scroll";
import { Container } from "@/shared/components/section";
import { ShimmerTitle } from "@/shared/components/shimmer-title";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn, formatCount } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  challengeDday,
  getChallenge,
  listChallenges,
  type ChallengeSummary,
  type WorkSummary,
} from "@/platform/creator-client";

const URGENT_DDAY = 3;
const ONGOING_CARD_LIMIT = 4;
const CARD_STAGGER_MS = 70;

// 마감 D-day 칩 — 마감 임박(3일 이내)은 경고 톤. 색 외에 아이콘·문구로도 상태를 전달한다.
function DdayChip({ endsAt }: { endsAt: string | null }) {
  const bt = useBilingual("CreateChallengesPage");
  const dday = challengeDday(endsAt);
  const base = "numeral inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[0.72rem] font-semibold leading-none";
  if (dday == null) {
    return (
      <span className={cn(base, "border-line bg-raised text-fg-2")}>
        <CalendarClock size={11} aria-hidden /> {bt("상시", "Always open")}
      </span>
    );
  }
  if (dday < 0) {
    return <span className={cn(base, "border-line bg-raised text-fg-3")}>{bt("종료", "Ended")}</span>;
  }
  return (
    <span className={cn(base, dday <= URGENT_DDAY ? "border-warn/35 bg-warn/10 text-warn" : "border-accent/30 bg-accent-soft text-fg")}>
      <CalendarClock size={11} aria-hidden />
      {dday === 0 ? bt("오늘 마감", "Ends today") : `D-${dday}`}
    </span>
  );
}

// 챌린지 카드 — 선택하면 아래에 참여작 그리드.
function ChallengeCard({
  challenge,
  active,
  onSelect,
}: {
  challenge: ChallengeSummary;
  active: boolean;
  onSelect: () => void;
}) {
  const bt = useBilingual("CreateChallengesPage");
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "sheen-sweep group relative flex h-full w-full flex-col rounded-2xl border p-4 text-left transition-[transform,background-color,border-color,box-shadow] duration-200 ease-out-expo hover:-translate-y-0.5 active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        active
          ? "border-accent/60 bg-accent-soft shadow-lg shadow-accent/15"
          : "border-line bg-panel/30 hover:border-accent/40 hover:bg-panel/50",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-accent">
          <Trophy size={12} aria-hidden className="transition-transform duration-200 ease-out-expo group-hover:-rotate-6 group-hover:scale-110" />
          {challenge.state === "ended" ? bt("지난 챌린지", "Past challenge") : bt("주간 챌린지", "Weekly challenge")}
        </span>
        <DdayChip endsAt={challenge.endsAt} />
      </div>
      <h3 className="mt-2 text-lg font-bold leading-tight text-fg transition-colors group-hover:text-accent">{challenge.title}</h3>
      <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-fg-2">{challenge.theme}</p>
      <span className="mt-auto inline-flex items-center gap-1 pt-3 text-[0.72rem] text-fg-2">
        <Users size={12} aria-hidden />
        {bt("참여작", "Entries")} <span className="numeral font-semibold">{formatCount(challenge.entries)}</span>
      </span>
      {active ? <span className="sr-only">{bt("선택됨", "Selected")}</span> : null}
    </button>
  );
}

function ChallengeListSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-hidden>
      {Array.from({ length: ONGOING_CARD_LIMIT }, (_, index) => (
        <div key={index} className="rounded-2xl border border-line bg-panel/30 p-4">
          <span className="skeleton block h-4 w-1/2" />
          <span className="skeleton mt-3 block h-6 w-3/4" />
          <span className="skeleton mt-2 block h-3 w-full" />
          <span className="skeleton mt-3 block h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

function JoinFromStudioLink({ challenge }: { challenge: ChallengeSummary }) {
  const bt = useBilingual("CreateChallengesPage");
  const fx = useFx();
  return (
    <Link
      href={buildStudioHref({ challengeId: challenge.id })}
      data-no-sfx
      onClick={(event) => {
        // 참여 시작은 작은 보상감 — 강조색 파티클 + 'pop'. 모션 감소 설정은 fx 가 존중한다.
        fx.sfx("pop");
        fx.burstAt(event.currentTarget, { count: 16, spread: 1.1 });
      }}
      className={buttonClass({ size: "sm", variant: "solid", className: "gap-1.5 shadow-lg shadow-accent/25" })}
    >
      <PenLine size={14} aria-hidden />
      {bt("스튜디오에서 참여하기", "Join from Studio")}
    </Link>
  );
}

/** 선택한 챌린지의 참여작 — 불러오기 실패를 "참여작 없음"으로 오인하지 않게 분리해 안내한다. */
function ChallengeEntries({ challenge }: { challenge: ChallengeSummary }) {
  const bt = useBilingual("CreateChallengesPage");
  const entries = useShowcaseResource<WorkSummary[]>(
    JSON.stringify(["challenge-entries", challenge.slug]),
    async (signal) => (await getChallenge(challenge.slug, signal)).works,
    bt("참여작을 불러오지 못했습니다.", "Couldn't load the entries."),
  );

  if (entries.status === "error") {
    return (
      <ShowcaseUnavailableState
        title={bt("참여작을 잠시 불러올 수 없어요", "Entries are temporarily unavailable")}
        detail={entries.error}
        onRetry={entries.reload}
        actions={<JoinFromStudioLink challenge={challenge} />}
      />
    );
  }
  if (entries.status !== "ready") return <WorkGridSkeleton count={5} />;
  if (entries.data.length === 0) {
    return (
      <ShowcaseEmptyState
        icon={PenLine}
        title={bt("아직 참여작이 없습니다.", "No entries yet.")}
        description={bt("첫 번째 참여자가 되어 보세요. 스튜디오에서 만든 작품에 챌린지가 자동으로 연결됩니다.", "Be the first to join. Works made from the Studio are linked to the challenge automatically.")}
        action={challenge.state === "ended" ? undefined : <JoinFromStudioLink challenge={challenge} />}
      />
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {entries.data.map((work) => (
        <WorkCard key={work.id} work={work} />
      ))}
    </div>
  );
}

export function CreateChallengesPage() {
  const bt = useBilingual("CreateChallengesPage");
  useDocumentTitle(bt("창작 챌린지", "Creator challenges"));
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedKey = searchParams.get("c") ?? "";
  const challengesResource = useShowcaseResource<ChallengeSummary[]>(
    "challenges",
    (signal) => listChallenges(signal),
    bt("챌린지 목록을 불러오지 못했습니다.", "Couldn't load the challenge list."),
  );

  const steps: readonly ShowcaseStep[] = [
    {
      icon: Lightbulb,
      title: bt("이번 주 주제 확인", "Check this week's theme"),
      description: bt("카드를 눌러 주제와 마감일, 다른 참여작을 살펴봅니다.", "Tap a card to see the theme, deadline and other entries."),
    },
    {
      icon: PenLine,
      title: bt("스튜디오에서 참여", "Join from the Studio"),
      description: bt("‘스튜디오에서 참여하기’로 열면 챌린지가 자동으로 연결된 새 작품이 준비됩니다.", "“Join from Studio” opens a new work already linked to the challenge."),
    },
    {
      icon: Share2,
      title: bt("공개하고 응원 받기", "Publish and get cheers"),
      description: bt("발행하면 참여작 목록과 갤러리에 함께 소개되고 좋아요·댓글을 받을 수 있어요.", "Published entries appear here and in the gallery, ready for likes and comments."),
    },
  ];

  const challenges = challengesResource.status === "ready" ? challengesResource.data : [];
  const ongoing = challenges.filter((c) => c.state !== "ended");
  const ended = challenges.filter((c) => c.state === "ended");
  const selected =
    challenges.find((c) => c.slug === selectedKey || c.id === selectedKey) ?? ongoing[0] ?? challenges[0] ?? null;

  const select = (challenge: ChallengeSummary) => {
    const params = new URLSearchParams(searchParams);
    params.set("c", challenge.slug);
    setSearchParams(params, { replace: true });
  };

  return (
    <Container size="wide" className="py-10">
      <Link
        href={SHOWCASE_HOME_PATH}
        className="mb-5 inline-flex min-h-11 items-center gap-1.5 text-sm text-fg-2 transition-colors hover:text-fg"
      >
        <ArrowLeft size={15} aria-hidden />
        {bt("창작 갤러리", "Creator gallery")}
      </Link>

      <header className="relative mb-6 overflow-hidden rounded-2xl border border-line bg-panel/45 p-5 surface-hl shadow-lg shadow-black/15 sm:p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 size-72 rounded-full opacity-60 blur-3xl motion-safe:[animation:hero-bloom_11s_ease-in-out_infinite]"
          style={{ background: "radial-gradient(closest-side, color-mix(in oklch, var(--color-accent) 24%, transparent), transparent 72%)" }}
        />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow flex items-center gap-2 text-accent">
              <span aria-hidden className="pulse-dot shrink-0" />
              <Sparkles size={14} aria-hidden /> CREATOR CHALLENGE
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              <ShimmerTitle as="span" particleCount={22} particleSpread={1.2}>
                {bt("창작 챌린지", "Creator challenges")}
              </ShimmerTitle>
            </h1>
            <p className="mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-fg-2">
              {bt(
                "매주 새로운 주제로 함께 그리는 창작 이벤트입니다. 주제를 고르고 스튜디오에서 바로 참여해 보세요.",
                "A weekly drawing event with a fresh theme. Pick a theme and join straight from the Studio.",
              )}
            </p>
          </div>
          <Link href={SHOWCASE_HOME_PATH} className={buttonClass({ size: "sm", variant: "outline", className: "gap-1.5" })}>
            <LayoutGrid size={14} aria-hidden />
            {bt("갤러리에서 작품 보기", "Browse the gallery")}
          </Link>
        </div>
      </header>

      <ShowcaseStepStrip label={bt("챌린지 참여 방법", "How to join a challenge")} steps={steps} className="mb-8" />

      {challengesResource.status === "error" ? (
        <ShowcaseUnavailableState
          title={bt("챌린지를 잠시 불러올 수 없어요", "Challenges are temporarily unavailable")}
          detail={challengesResource.error}
          onRetry={challengesResource.reload}
          actions={
            <>
              <Link href="/studio" className={buttonClass({ size: "md", variant: "outline", className: "gap-1.5" })}>
                <PenLine size={15} aria-hidden />
                {bt("웹툰 그리기", "Draw a webtoon")}
              </Link>
              <Link href={SHOWCASE_HOME_PATH} className={buttonClass({ size: "md", variant: "outline", className: "gap-1.5" })}>
                <LayoutGrid size={15} aria-hidden />
                {bt("창작 갤러리", "Creator gallery")}
              </Link>
            </>
          }
        />
      ) : challengesResource.status !== "ready" ? (
        <ChallengeListSkeleton />
      ) : challenges.length === 0 ? (
        <ShowcaseEmptyState
          icon={Trophy}
          title={bt("진행 중인 챌린지가 없습니다.", "No ongoing challenges.")}
          description={bt("새로운 주간 챌린지가 곧 열립니다. 그동안 자유 주제로 작품을 만들어 갤러리에 공개해 보세요.", "A new weekly challenge opens soon. Meanwhile, publish a free-theme work to the gallery.")}
          action={
            <Link href="/studio" className={buttonClass({ size: "md", variant: "solid", className: "gap-1.5" })}>
              <PenLine size={15} aria-hidden />
              {bt("자유 주제로 그리기", "Draw a free theme")}
            </Link>
          }
        />
      ) : (
        <>
          {/* 진행 중 챌린지 카드 — 형제 카드 스태거 진입 */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(ongoing.length > 0 ? ongoing : challenges.slice(0, ONGOING_CARD_LIMIT)).map((challenge, index) => (
              <RevealOnScroll key={challenge.id} delayMs={index * CARD_STAGGER_MS}>
                <ChallengeCard
                  challenge={challenge}
                  active={selected?.id === challenge.id}
                  onSelect={() => select(challenge)}
                />
              </RevealOnScroll>
            ))}
          </div>

          {selected ? (
            <section className="mt-8" aria-labelledby="challenge-entries-title">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <h2 id="challenge-entries-title" className="flex items-center gap-1.5 text-base font-bold text-fg">
                  <Trophy size={16} aria-hidden className="text-accent" />
                  {selected.title} {bt("참여작", "entries")}
                  <CountUp
                    key={`${selected.id}:${selected.entries}`}
                    value={selected.entries}
                    duration={0.7}
                    separator={selected.entries >= 1000}
                    className="numeral text-sm text-fg-3"
                  />
                </h2>
                <DdayChip endsAt={selected.endsAt} />
                {selected.state === "ended" ? null : (
                  <span className="ml-auto">
                    <JoinFromStudioLink challenge={selected} />
                  </span>
                )}
              </div>
              {selected.theme ? (
                <p className="mb-4 rounded-xl border border-line bg-card/50 px-3.5 py-3 text-sm leading-relaxed text-fg-2">
                  {selected.theme}
                </p>
              ) : null}
              <ChallengeEntries challenge={selected} />
            </section>
          ) : null}

          {ended.length > 0 ? (
            <section className="mt-10" aria-labelledby="challenge-past-title">
              <h2 id="challenge-past-title" className="mb-3 text-sm font-bold text-fg-2">{bt("지난 챌린지", "Past challenges")}</h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {ended.map((challenge) => (
                  <ChallengeCard
                    key={challenge.id}
                    challenge={challenge}
                    active={selected?.id === challenge.id}
                    onSelect={() => select(challenge)}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </Container>
  );
}
