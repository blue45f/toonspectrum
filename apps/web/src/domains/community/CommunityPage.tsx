import { ArrowRight, MessageCircle, UsersRound } from "lucide-react";
import { Navigate, useParams } from "react-router-dom";

import type { FanCafeScopeFilter } from "@/shared/lib/types";

import { FanCafePanel } from "@/shared/components/fan-cafe-panel";
import { Container } from "@/shared/components/section";
import { PublicStoryHero } from "@/shared/components/public-story-hero";
import { useDocumentTitle } from "@/hooks/use-document-title";
import {
  COMMUNITY_SCOPE_DESCRIPTION,
  COMMUNITY_SCOPE_DIRECTORIES,
  COMMUNITY_SCOPE_LABEL,
} from "@/shared/lib/community-ui";
import Link from "@/compat/router-link";


const SCOPES = ["title", "author", "pencafe"] as const;

function parseScope(raw: string | undefined): Exclude<FanCafeScopeFilter, "all" | "cafe"> | null {
  return SCOPES.find((scope) => scope === raw) ?? null;
}

export function CommunityPage() {
  useDocumentTitle("커뮤니티 · 웹툰을 함께 읽고 그리는 곳");
  return (
    <Container size="wide" className="relative py-6 sm:py-8 lg:py-10">
      <PublicStoryHero
        eyebrow="COMMUNITY · STORIES BRING US TOGETHER"
        title="혼자 그린 이야기, 함께 넓어지는 세계."
        description="인상 깊은 한 컷의 해석부터 좋아하는 작가의 이야기까지. 작품·작가·펜카페를 따라 대화를 찾아보세요. 창작자의 갤러리에서 새로운 작업을 만나고, 리뷰로 감상을 이어갈 수 있습니다."
        image="world"
        imageAlt="웹툰 속 도시와 사람들의 이야기를 표현한 장면 콘셉트 아트"
        caption="A WORLD OF STORIES · 웹툰 장면 콘셉트 아트"
      >
        <div className="flex flex-wrap gap-3">
          <Link href="/showcase" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-on-accent transition-colors hover:bg-accent-2">창작자 갤러리<ArrowRight size={16} aria-hidden="true" /></Link>
          <Link href="/reviews" className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line-strong px-5 text-sm font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg"><MessageCircle size={16} aria-hidden="true" />작품 리뷰 읽기</Link>
        </div>
      </PublicStoryHero>

      <section className="mt-10" aria-labelledby="community-directories-title">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow text-accent">FIND YOUR CONVERSATION</p><h2 id="community-directories-title" className="mt-3 text-2xl font-bold tracking-tight text-fg">어떤 이야기부터 나눌까요?</h2></div><Link href="/make" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent">영감을 내 웹툰으로<ArrowRight size={15} aria-hidden="true" /></Link></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {COMMUNITY_SCOPE_DIRECTORIES.map((entry) => <Link key={entry.value} href={entry.href} className="group flex min-h-20 items-center gap-4 rounded-xl border border-line bg-panel/60 p-5 transition-colors hover:border-accent/50 hover:bg-card"><span aria-hidden="true" className="text-xl">{entry.icon}</span><span className="flex-1 text-sm font-semibold text-fg">{entry.label}<span className="mt-1 block text-xs font-normal text-fg-3">대화 둘러보기</span></span><ArrowRight size={16} className="text-fg-3 group-hover:text-accent" aria-hidden="true" /></Link>)}
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-line bg-panel/45 p-1">
        <FanCafePanel scope="all" targetLabel="통합 커뮤니티 피드" compact />
      </section>
    </Container>
  );
}

export function CommunityScopePage() {
  const { scope: rawScope } = useParams();
  const scope = parseScope(rawScope);

  // 장르 카페는 전용 분할 라우트(목록·상세·생성)를 쓴다.
  if (rawScope === "cafe" || rawScope === "cafes") {
    return <Navigate to="/community/cafes" replace />;
  }

  if (!scope) {
    return (
      <Container size="wide" className="py-16">
        <p className="eyebrow text-accent">COMMUNITY</p>
        <h1 className="mt-2 text-2xl font-bold">커뮤니티 범주를 찾을 수 없어요</h1>
        <Link href="/community" className="mt-5 inline-flex text-sm font-medium text-accent">
          통합 커뮤니티로 이동
        </Link>
      </Container>
    );
  }

  return (
    <Container size="wide" className="relative py-6 sm:py-8 lg:py-10">
      <header className="mb-6 sm:mb-8">
        <p className="eyebrow flex items-center gap-1.5 text-accent">
          <UsersRound size={14} />
          COMMUNITY DIRECTORY
        </p>
        <h1 className="mt-2 text-[clamp(1.6rem,7vw,1.875rem)] font-bold tracking-tight sm:text-4xl">{COMMUNITY_SCOPE_LABEL[scope]} 커뮤니티</h1>
        <p className="lede mt-2 max-w-xl text-pretty text-sm leading-relaxed text-fg-2">{COMMUNITY_SCOPE_DESCRIPTION[scope]}</p>
      </header>
      <FanCafePanel scope={scope} targetLabel={`${COMMUNITY_SCOPE_LABEL[scope]} 커뮤니티`} compact />
    </Container>
  );
}
