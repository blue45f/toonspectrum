import { useSearchParams } from "react-router-dom";
import { LibraryView } from "@/components/library-view";
import { Container } from "@/components/section";

const TABS = ["shelf", "rated", "alerts", "taste", "collections"] as const;

export function LibraryPage() {
  const [searchParams] = useSearchParams();
  const tab = TABS.find((entry) => entry === searchParams.get("tab")) ?? "shelf";

  return (
    <Container size="wide" className="py-10">
      <header className="mb-7">
        <p className="eyebrow text-accent">MY LIBRARY</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">내 서재</h1>
        <p className="mt-2 max-w-xl text-pretty text-sm leading-relaxed text-fg-2">
          관심 작품과 평가를 모으면, WEBDEX가 당신의 취향 스펙트럼을 분석해 다음 작품을 추천합니다.
          모든 기록은 이 브라우저에 저장됩니다.
        </p>
      </header>
      <LibraryView initialTab={tab} />
    </Container>
  );
}
