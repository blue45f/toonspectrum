import { ArrowRight, ArchiveRestore, Search } from "lucide-react";
import { useMemo, useState } from "react";

import Link from "@/compat/router-link";

import { BRUSH_QUALITY_CATALOG } from "./brush-studio-v5-quality-catalog";
import { BRUSH_STUDIO_V6_RECIPES } from "./brush-studio-v6-engine";
import { resolveLegacyBrushV6RecipeId } from "./brush-studio-version-integration";

function successionHref(baseHref: string, legacyBrushId: string, recipeId: string): string {
  const separator = baseHref.includes("?") ? "&" : "?";
  const params = new URLSearchParams({
    applyRecipe: "1",
    legacyBrush: legacyBrushId,
    recipe: recipeId,
  });
  params.sort();
  return `${baseHref}${separator}${params.toString()}`;
}

/** Restores discoverability for all 72 V5 quality designs and maps each to a shipped V6 start. */
export function StudioBrushLegacyCataloguePanel({ baseHref }: { readonly baseHref: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const recipeNames = useMemo(
    () => new Map(BRUSH_STUDIO_V6_RECIPES.map((recipe) => [recipe.id, recipe.label])),
    [],
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    if (!normalized) return BRUSH_QUALITY_CATALOG;
    return BRUSH_QUALITY_CATALOG.filter((entry) =>
      `${entry.name} ${entry.id} ${entry.group} ${entry.signature} ${entry.engine}`
        .toLocaleLowerCase("ko-KR")
        .includes(normalized),
    );
  }, [query]);

  return (
    <section className="rounded-3xl border border-line bg-card/35 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-[0.68rem] font-black uppercase tracking-[0.16em] text-accent">
            <ArchiveRestore size={15} aria-hidden="true" /> V5 SUCCESSION
          </p>
          <h2 className="mt-1 text-sm font-black text-fg">V5 품질 브러시 72종 승계 카탈로그</h2>
          <p className="mt-1 max-w-4xl text-xs leading-5 text-fg-3">
            과거 72종 설계를 숨기지 않고 모두 검색할 수 있습니다. 선택하면 재료·물리·패턴 의미가
            가장 가까운 V6 레시피에서 시작하며, 픽셀 동일 변환으로 표시하지 않습니다.
          </p>
        </div>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-line bg-card px-4 py-2 text-sm font-bold text-fg hover:border-line-strong hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
        >
          {open ? "카탈로그 닫기" : "72종 모두 보기"}
        </button>
      </div>

      {open ? (
        <div className="mt-5">
          <label className="relative block max-w-xl">
            <span className="sr-only">V5 브러시 검색</span>
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="이름·재질·엔진·그룹 검색"
              className="min-h-11 w-full rounded-xl border border-line bg-panel pl-10 pr-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
            />
          </label>
          <p className="mt-2 text-xs text-fg-3">{filtered.length} / {BRUSH_QUALITY_CATALOG.length}종</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((entry) => {
              const recipeId = resolveLegacyBrushV6RecipeId(entry);
              return (
                <Link
                  key={entry.id}
                  href={successionHref(baseHref, entry.id, recipeId)}
                  className="group rounded-2xl border border-line bg-panel/55 p-3.5 transition-colors hover:border-accent/45 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span>
                      <strong className="block text-sm text-fg">{entry.name}</strong>
                      <span className="mt-1 block text-[0.68rem] font-semibold text-accent">{entry.group}</span>
                    </span>
                    <span className="rounded-full border border-line px-2 py-1 text-[0.62rem] font-bold text-fg-3">
                      {entry.engine}
                    </span>
                  </span>
                  <span className="mt-2 block text-xs leading-5 text-fg-3">{entry.signature}</span>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-accent">
                    {recipeNames.get(recipeId) ?? recipeId}로 열기
                    <ArrowRight size={13} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </span>
                </Link>
              );
            })}
          </div>
          {filtered.length === 0 ? (
            <p className="mt-4 rounded-xl border border-line bg-panel/55 px-3 py-5 text-center text-sm text-fg-3" role="status">
              일치하는 V5 브러시가 없습니다.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
