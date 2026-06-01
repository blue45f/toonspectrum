import { useSearchParams } from "react-router-dom";
import { SearchExplorer } from "@/components/search-explorer";
import { Container } from "@/components/section";

export function SearchPage() {
  const [searchParams] = useSearchParams();

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
      <SearchExplorer initialQuery={searchParams.get("q") ?? ""} initialFree={searchParams.get("free") === "1"} />
    </Container>
  );
}
