import type { Metadata } from "next";
import { Container } from "@/components/section";
import { RecommendView } from "@/components/recommend-view";
import { GENRES } from "@/lib/taxonomy";

export const metadata: Metadata = {
  title: "추천",
  description: "취향 장르를 고르면 즉시 추천, 평가 이력 기반 맞춤 추천, 비슷한 작품 찾기까지.",
};

export default async function RecommendPage({
  searchParams,
}: {
  searchParams: Promise<{ genre?: string }>;
}) {
  const sp = await searchParams;
  const initial = sp.genre && (GENRES as readonly string[]).includes(sp.genre) ? [sp.genre] : [];

  return (
    <Container size="wide" className="py-10">
      <header className="mb-8">
        <p className="eyebrow text-accent">RECOMMENDATIONS · 추천</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">오늘 뭐 볼까</h1>
        <p className="mt-2 max-w-xl text-pretty text-sm leading-relaxed text-fg-2">
          취향을 고르면 그 자리에서 추천이 만들어집니다. 평가를 남길수록, 추천은 점점 더 당신을
          닮아갑니다.
        </p>
      </header>
      <RecommendView initialGenres={initial} />
    </Container>
  );
}
