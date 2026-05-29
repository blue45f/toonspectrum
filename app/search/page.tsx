import type { Metadata } from "next";
import { Container } from "@/components/section";
import { SearchExplorer } from "@/components/search-explorer";

export const metadata: Metadata = {
  title: "통합 검색",
  description: "플랫폼을 가로지르는 웹툰·웹소설 통합 검색. 장르·태그·플랫폼·평점으로 정밀하게.",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; free?: string }>;
}) {
  const sp = await searchParams;

  return (
    <Container size="wide" className="py-10">
      <header className="mb-6">
        <p className="eyebrow text-accent">UNIFIED SEARCH</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">통합 검색</h1>
        <p className="mt-2 max-w-xl text-pretty text-sm leading-relaxed text-fg-2">
          한 번의 검색으로 모든 플랫폼을 훑습니다. 장르·태그·플랫폼·평점·가격으로 좁혀
          정확히 원하는 작품에 닿으세요.
        </p>
      </header>
      <SearchExplorer initialQuery={sp.q ?? ""} initialFree={sp.free === "1"} />
    </Container>
  );
}
