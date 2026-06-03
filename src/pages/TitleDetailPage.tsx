import { useParams } from "react-router-dom";
import { AdaptationGraph } from "@/components/adaptation-graph";
import { AuthorLine } from "@/components/author-line";
import Link from "@/src/compat/router-link";
import { AvailabilityRouter } from "@/components/availability";
import { PriceCompare } from "@/components/price-compare";
import { CollectionAdd } from "@/components/collection-add";
import { FanCafePanel } from "@/components/fan-cafe-panel";
import { ReadStateSelector } from "@/components/read-state";
import { ReviewCard } from "@/components/review-card";
import { ReviewForm } from "@/components/review-form";
import { Rail, Section, Container } from "@/components/section";
import { SubscribeButton } from "@/components/subscribe-button";
import { TitleCard } from "@/components/title-card";
import { TitlePoster } from "@/components/title-poster";
import { Badge, GenreChip } from "@/components/ui/chip";
import { DistributionBars, GenreSpectrum, MeterBar } from "@/components/ui/spectrum-bar";
import { Stars } from "@/components/ui/stars";
import { statsAreEstimated } from "@/lib/estimate";
import { AGE_LABEL, STATUS_LABEL, TYPE_LABEL } from "@/lib/taxonomy";
import type { SeedReview, Title } from "@/lib/types";
import { formatCount } from "@/lib/utils";
import { Bookmark, Eye, Heart, Layers, MapPin, Star } from "lucide-react";
import { NotFoundPage } from "./NotFoundPage";
import { ErrorState } from "@/src/components/error-state";
import { useDocumentTitle } from "@/src/hooks/use-document-title";
import { useApiResource } from "./use-api-resource";

interface TitleDetailResponse {
  title: Title;
  reviews: SeedReview[];
  similar: Title[];
  original: Title;
  adaptations: Title[];
  hasFamily: boolean;
  reviewAvg: number;
  reviewCount: number;
  generatedAt: string;
  source: string;
}

export function TitleDetailPage() {
  const { slug } = useParams();
  const { data, loading, error, notFound, reload } = useApiResource<TitleDetailResponse>(
    slug ? `/api/titles/${encodeURIComponent(slug)}` : null,
    "작품 상세 데이터를 불러오지 못했습니다."
  );
  useDocumentTitle(data?.title?.title);

  if (loading) {
    return (
      <Container size="wide" className="relative py-8 lg:py-10">
        <div className="grid gap-8 lg:grid-cols-[19rem_1fr]">
          <aside className="flex flex-col gap-4">
            <div className="skeleton aspect-[3/4] rounded-2xl" />
            <div className="skeleton h-12 rounded-xl" />
            <div className="skeleton h-24 rounded-2xl" />
          </aside>
          <div className="space-y-5">
            <div className="skeleton h-8 w-40" />
            <div className="skeleton h-12 w-3/4" />
            <div className="skeleton h-5 w-64" />
            <div className="skeleton h-28 rounded-2xl" />
            <div className="skeleton h-24 rounded-2xl" />
          </div>
        </div>
      </Container>
    );
  }

  if (notFound || !data) {
    if (!error) return <NotFoundPage />;
  }

  if (error || !data) {
    return (
      <Container size="wide" className="py-10">
        <ErrorState title="작품 상세를 불러오지 못했습니다." message={error} onRetry={reload} />
      </Container>
    );
  }

  const { title, reviews, similar, original, adaptations, hasFamily } = data;
  const reviewCount = data.reviewCount || title.stats.ratingCount;
  const reviewAvg = data.reviewCount > 0 ? data.reviewAvg : title.stats.ratingAvg;
  const estimated = statsAreEstimated(title);
  const fmtStat = (value: number) => (estimated ? `≈${formatCount(value)}` : formatCount(value));
  const stats = [
    { icon: Eye, label: "조회", value: fmtStat(title.stats.views) },
    { icon: Heart, label: "좋아요", value: fmtStat(title.stats.likes) },
    { icon: Bookmark, label: "관심", value: fmtStat(title.stats.bookmarks) },
    { icon: Star, label: "평가", value: fmtStat(reviewCount) },
  ];

  return (
    <Container size="wide" className="relative py-8 lg:py-10">
      {title.coverImage && (
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[480px] w-screen -translate-x-1/2 overflow-hidden"
        >
          <img src={title.coverImage} alt="" className="size-full scale-110 object-cover opacity-25 blur-2xl" />
          <div className="absolute inset-0 bg-gradient-to-b from-canvas/30 via-canvas/85 to-canvas" />
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[19rem_1fr]">
        <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <TitlePoster title={title} size="lg" priority />
          <ReadStateSelector titleId={title.id} />
          <CollectionAdd titleId={title.id} />
          {title.status === "ongoing" && title.updateDays && title.updateDays.length > 0 && (
            <SubscribeButton titleId={title.id} days={title.updateDays} />
          )}
          <div className="rounded-2xl border border-line bg-panel/50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <MapPin size={15} className="text-accent" />
              <p className="text-sm font-semibold text-fg">어디서 볼 수 있나요</p>
            </div>
            <AvailabilityRouter availability={title.availability} />
            <p className="mt-3 text-[0.7rem] leading-relaxed text-fg-3">
              플랫폼을 가로질러 가격(무료·기다무·유료)을 비교합니다. 가장 저렴한 진입점을 위로
              정렬했어요.
            </p>
          </div>
          <PriceCompare availability={title.availability} />
        </aside>

        <div className="flex flex-col gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="accent">{TYPE_LABEL[title.type]}</Badge>
              <Badge tone={title.status === "completed" ? "good" : title.status === "hiatus" ? "warn" : "neutral"}>
                {STATUS_LABEL[title.status]}
              </Badge>
              <Badge tone={title.ageRating === "19" ? "bad" : "neutral"}>{AGE_LABEL[title.ageRating]}</Badge>
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
            <AuthorLine author={title.author} artist={title.artist} year={title.releaseYear} />
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-line bg-card p-5">
            <div className="flex items-center gap-3">
              <span className="numeral text-4xl text-accent">{reviewAvg.toFixed(1)}</span>
              <div>
                <div className="flex items-center gap-1.5">
                  <Stars value={reviewAvg} size="md" />
                  {estimated && <Badge tone="neutral">추정</Badge>}
                </div>
                <p className="mt-1 text-xs text-fg-3">
                  {estimated ? `약 ${formatCount(reviewCount)} 평가 (추정)` : `${formatCount(reviewCount)}개의 평가`}
                </p>
              </div>
            </div>
            <div className="ml-auto flex flex-wrap gap-1.5">
              {title.genres.map((genre) => (
                <GenreChip key={genre} genre={genre} />
              ))}
            </div>
          </div>

          <p className="text-pretty text-[0.95rem] leading-relaxed text-fg-2">{title.synopsis}</p>

          {title.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {title.tags.map((tag) => (
                <Link
                  key={tag}
                  href={`/explore?tags=${encodeURIComponent(tag)}`}
                  className="rounded-full border border-line bg-raised/50 px-2.5 py-1 text-xs text-fg-3 transition-colors hover:border-accent/50 hover:text-accent"
                >
                  #{tag}
                </Link>
              ))}
            </div>
          )}

          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
            {stats.map((item) => (
              <div key={item.label} className="flex flex-col gap-1 bg-card p-4">
                <dt className="flex items-center gap-1.5 text-xs text-fg-3">
                  <item.icon size={13} /> {item.label}
                </dt>
                <dd className="numeral text-xl text-fg">{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <section className="mt-14">
        <p className="eyebrow mb-1 text-accent">METRICS · 지표</p>
        <p className="mb-4 text-xs text-fg-3">완독률·몰입·분포는 수집값과 추정값을 함께 사용합니다.</p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-line bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-fg">평점 분포</h3>
            <DistributionBars dist={title.stats.ratingDist} />
          </div>
          <div className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-5">
            <h3 className="text-sm font-semibold text-fg">정주행 지표</h3>
            <MeterBar label="완독률" value={Math.round(title.stats.completionRate)} suffix="%" />
            <MeterBar label="몰입 지수" value={Math.round(title.stats.bingeIndex)} color="var(--color-cool)" />
            <MeterBar label="트렌드 점수" value={Math.round(title.stats.trendingScore)} color="var(--color-good)" />
            <div className="mt-1">
              <p className="mb-1.5 text-xs text-fg-3">장르 스펙트럼</p>
              <GenreSpectrum genres={title.genres} height={6} />
            </div>
          </div>
        </div>
      </section>

      {hasFamily && (
        <Section
          className="mt-14"
          eyebrow="ADAPTATION"
          title="같은 이야기, 다른 형태"
          desc="원작부터 웹툰화까지, 하나의 우주로 연결했습니다."
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

      <Section
        className="mt-14"
        eyebrow="COMMUNITY"
        title={`${title.title} 팬카페`}
        desc="작품 해석, 정주행 메모, 팬아트 아이디어를 독자들과 나눕니다."
      >
        <FanCafePanel scope="title" targetId={title.id} targetLabel={title.title} />
      </Section>

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
                <p className="mt-1 text-xs text-fg-3">첫 리뷰를 남기면 취향 분석에도 반영됩니다.</p>
              </div>
            ) : (
              reviews.map((review) => <ReviewCard key={review.id} review={review} enableReplies />)
            )}
          </div>
        </div>
      </Section>

      {similar.length > 0 && (
        <Section
          className="mt-14"
          eyebrow="SIMILAR"
          title="이 작품과 비슷한"
          desc="장르·태그·어댑테이션 관계로 찾은 추천"
        >
          <Rail>
            {similar.map((item) => (
              <TitleCard key={item.id} title={item} />
            ))}
          </Rail>
        </Section>
      )}
    </Container>
  );
}
