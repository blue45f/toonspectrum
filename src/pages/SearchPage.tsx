import { useSearchParams } from "react-router-dom";
import { SearchExplorer } from "@/components/search-explorer";
import { Container } from "@/components/section";
import { buttonClass } from "@/components/ui/button";
import { PLATFORM_LIST } from "@/lib/platforms";
import type { PlatformId } from "@/lib/types";
import { Search, SlidersHorizontal } from "lucide-react";
import Link from "@/src/compat/router-link";

export function SearchPage() {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const initialFree = searchParams.get("free") === "1";
  const platformIds = new Set(PLATFORM_LIST.map((platform) => platform.id));
  const initialPlatforms = (searchParams.get("platforms") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry): entry is PlatformId => platformIds.has(entry as PlatformId));

  return (
    <Container size="wide" className="py-10">
      <header className="mb-8 rounded-2xl border border-line bg-panel/45 p-5 sm:p-6">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent/35 bg-accent-soft/45 px-2.5 py-1 text-xs font-medium text-accent">
          <Search size={14} />
          통합 검색
        </div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">작품을 바로 찾는 작업공간</h1>
        <p className="mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-fg-2">
          작품명, 작가, 태그를 한 번에 찾고 플랫폼과 가격 조건으로 바로 좁혀보세요.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <a
            href="#toonspectrum-search-explorer-top"
            onClick={(event) => {
              event.preventDefault();
              document.getElementById("toonspectrum-search-explorer-top")?.scrollIntoView({ behavior: "smooth" });
            }}
            className={buttonClass({ size: "sm", variant: "solid", className: "gap-1.5" })}
          >
            <SlidersHorizontal size={14} />
            필터로 좁히기
          </a>
          <Link href="/ranking" className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1.5" })}>
            <Search size={14} />
            랭킹에서 비교하기
          </Link>
        </div>

        <p className="mt-4 flex flex-wrap items-center gap-3 text-xs text-fg-3">
          <span>
            현재 검색어: <span className="text-fg-2">{initialQuery ? `"${initialQuery}"` : "전체"}</span>
          </span>
          <span className="h-1 w-1 rounded-full bg-fg-3" />
          <span>무료·기다무 중심: {initialFree ? "ON" : "OFF"}</span>
        </p>
      </header>

      <div id="toonspectrum-search-explorer-top" />
      <SearchExplorer initialQuery={initialQuery} initialFree={initialFree} initialPlatforms={initialPlatforms} />
    </Container>
  );
}
