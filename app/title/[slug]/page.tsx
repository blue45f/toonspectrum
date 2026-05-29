import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  TITLES,
  getTitle,
  reviewsFor,
  originalOf,
  adaptationsOf,
} from "@/lib/data";
import { similarTitles } from "@/lib/recommend";
import { Container, Section, Rail } from "@/components/section";
import { TitlePoster } from "@/components/title-poster";
import { TitleCard } from "@/components/title-card";
import { Stars } from "@/components/ui/stars";
import { GenreChip, Badge } from "@/components/ui/chip";
import { DistributionBars, MeterBar, GenreSpectrum } from "@/components/ui/spectrum-bar";
import { AvailabilityRouter } from "@/components/availability";
import { AdaptationGraph } from "@/components/adaptation-graph";
import { ReadStateSelector } from "@/components/read-state";
import { CollectionAdd } from "@/components/collection-add";
import { ReviewForm } from "@/components/review-form";
import { ReviewCard } from "@/components/review-card";
import { STATUS_LABEL, AGE_LABEL, TYPE_LABEL } from "@/lib/taxonomy";
import { formatCount, formatFull } from "@/lib/utils";
import { Eye, Heart, Bookmark, Star, Layers, MapPin } from "lucide-react";

export async function generateStaticParams() {
  return TITLES.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const t = getTitle(slug);
  if (!t) return { title: "작품을 찾을 수 없어요" };
  return {
    title: `${t.title} · ${TYPE_LABEL[t.type]}`,
    description: t.synopsis,
  };
}

export default async function TitleDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const title = getTitle(slug);
  if (!title) notFound();

  const reviews = [...reviewsFor(title.id)].sort((a, b) => b.likes - a.likes);
  const similar = similarTitles(TITLES, title, 8);

  // 어댑테이션 패밀리
  const original = originalOf(title) ?? title;
  const adaptations = adaptationsOf(original);
  const hasFamily = adaptations.length > 0;

  const reviewAvg =
    reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  const stats = [
    { icon: Eye, label: "조회", value: formatCount(title.stats.views) },
    { icon: Heart, label: "좋아요", value: formatCount(title.stats.likes) },
    { icon: Bookmark, label: "관심", value: formatCount(title.stats.bookmarks) },
    { icon: Star, label: "평가", value: formatCount(title.stats.ratingCount) },
  ];

  return (
    <Container size="wide" className="relative py-8 lg:py-10">
      {/* 앰비언트 표지 배경 (실제 표지 블러) */}
      {title.coverImage && (
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[480px] w-screen -translate-x-1/2 overflow-hidden"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={title.coverImage}
            alt=""
            className="size-full scale-110 object-cover opacity-25 blur-2xl"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-canvas/30 via-canvas/85 to-canvas" />
        </div>
      )}

      {/* ░ HERO ░ */}
      <div className="grid gap-8 lg:grid-cols-[19rem_1fr]">
        {/* 좌: 포스터 + 액션 + 어디서봐 */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <TitlePoster title={title} size="lg" />
          <ReadStateSelector titleId={title.id} />
          <CollectionAdd titleId={title.id} />
          <div className="rounded-2xl border border-line bg-panel/50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <MapPin size={15} className="text-accent" />
              <h2 className="text-sm font-semibold text-fg">어디서 볼 수 있나요</h2>
            </div>
            <AvailabilityRouter availability={title.availability} />
            <p className="mt-3 text-[0.7rem] leading-relaxed text-fg-3">
              플랫폼을 가로질러 가격(무료·기다무·유료)을 비교합니다. 가장 저렴한 진입점을 위로 정렬했어요.
            </p>
          </div>
        </aside>

        {/* 우: 정보 */}
        <div className="flex flex-col gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="accent">{TYPE_LABEL[title.type]}</Badge>
              <Badge tone={title.status === "completed" ? "good" : "neutral"}>
                {STATUS_LABEL[title.status]}
              </Badge>
              <Badge tone={title.ageRating === "19" ? "bad" : "neutral"}>
                {AGE_LABEL[title.ageRating]}
              </Badge>
              {title.updateDays && title.updateDays.length > 0 && (
                <Badge tone="cool">{title.updateDays.join("·")} 연재</Badge>
              )}
            </div>

            <h1 className="mt-3 text-pretty text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              {title.title}
            </h1>
            {title.altTitles && title.altTitles.length > 0 && (
              <p className="mt-1.5 text-sm text-fg-3">{title.altTitles.join(" · ")}</p>
            )}
            <p className="mt-2 text-sm text-fg-2">
              글 {title.author}
              {title.artist && title.artist !== title.author && ` · 그림 ${title.artist}`}
              <span className="text-fg-3"> · {title.releaseYear}</span>
            </p>
          </div>

          {/* 평점 블록 */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-line bg-card p-5">
            <div className="flex items-center gap-3">
              <span className="numeral text-4xl text-accent">{title.stats.ratingAvg.toFixed(1)}</span>
              <div>
                <Stars value={title.stats.ratingAvg} size="md" />
                <p className="mt-1 text-xs text-fg-3">
                  {formatFull(title.stats.ratingCount)}명의 평가
                </p>
              </div>
            </div>
            <div className="ml-auto flex flex-wrap gap-1.5">
              {title.genres.map((g) => (
                <GenreChip key={g} genre={g} />
              ))}
            </div>
          </div>

          <p className="text-pretty text-[0.95rem] leading-relaxed text-fg-2">{title.synopsis}</p>

          {title.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {title.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-line bg-raised/50 px-2.5 py-1 text-xs text-fg-3"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}

          {/* 스탯 레저 */}
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col gap-1 bg-card p-4">
                <dt className="flex items-center gap-1.5 text-xs text-fg-3">
                  <s.icon size={13} /> {s.label}
                </dt>
                <dd className="numeral text-xl text-fg">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* ░ 지표 ░ */}
      <section className="mt-14">
        <p className="eyebrow mb-4 text-accent">METRICS · 지표</p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-line bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-fg">평점 분포</h3>
            <DistributionBars dist={title.stats.ratingDist} />
          </div>
          <div className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-5">
            <h3 className="text-sm font-semibold text-fg">정주행 지표</h3>
            <MeterBar label="완독률" value={Math.round(title.stats.completionRate)} suffix="%" />
            <MeterBar
              label="몰입 지수"
              value={Math.round(title.stats.bingeIndex)}
              color="var(--color-cool)"
            />
            <MeterBar
              label="트렌드 점수"
              value={Math.round(title.stats.trendingScore)}
              color="var(--color-good)"
            />
            <div className="mt-1">
              <p className="mb-1.5 text-xs text-fg-3">장르 스펙트럼</p>
              <GenreSpectrum genres={title.genres} height={6} />
            </div>
          </div>
        </div>
      </section>

      {/* ░ 어댑테이션 ░ */}
      {hasFamily && (
        <Section
          className="mt-14"
          eyebrow="ADAPTATION"
          title="같은 이야기, 다른 형태"
          desc="원작부터 영상화까지, 하나의 우주로 연결했습니다."
        >
          <div className="rounded-2xl border border-line bg-card p-5">
            <div className="mb-4 flex items-center gap-2 text-fg-3">
              <Layers size={15} />
              <span className="eyebrow text-[0.62rem]">{original.title} 유니버스</span>
            </div>
            <AdaptationGraph original={original} adaptations={adaptations} currentId={title.id} />
          </div>
        </Section>
      )}

      {/* ░ 리뷰 ░ */}
      <Section
        className="mt-14"
        eyebrow="REVIEWS"
        title={
          <span className="flex items-baseline gap-3">
            리뷰
            <span className="numeral text-lg text-fg-3">{reviews.length}</span>
            {reviews.length > 0 && (
              <span className="flex items-center gap-1.5 text-sm font-normal text-fg-3">
                <Stars value={reviewAvg} size="sm" /> {reviewAvg.toFixed(1)}
              </span>
            )}
          </span>
        }
      >
        <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr] lg:items-start">
          <div className="lg:sticky lg:top-20">
            <ReviewForm titleId={title.id} />
          </div>
          <div className="flex flex-col gap-3">
            {reviews.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line bg-card/50 p-10 text-center">
                <p className="text-sm text-fg-2">아직 리뷰가 없어요.</p>
                <p className="mt-1 text-xs text-fg-3">첫 리뷰를 남겨 정주행 길잡이가 되어주세요.</p>
              </div>
            ) : (
              reviews.map((r) => <ReviewCard key={r.id} review={r} />)
            )}
          </div>
        </div>
      </Section>

      {/* ░ 비슷한 작품 ░ */}
      {similar.length > 0 && (
        <Section
          className="mt-14"
          eyebrow="SIMILAR"
          title="이 작품과 비슷한"
          desc="장르·태그·어댑테이션 관계로 찾은 추천"
        >
          <Rail>
            {similar.map((t) => (
              <TitleCard key={t.id} title={t} />
            ))}
          </Rail>
        </Section>
      )}
    </Container>
  );
}
