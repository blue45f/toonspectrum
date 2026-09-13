import { Link, useLocation } from "react-router-dom";

import type { ReactNode } from "react";

/** Identity-bearing legacy URLs must reach the canonical resolver, including invalid/empty values. */
export function StudioHomeEntryRoute({ home, legacy }: { home: ReactNode; legacy: ReactNode }) {
  const { search } = useLocation();
  const query = new URLSearchParams(search);
  if (query.has("id") || query.has("remix") || query.has("mode")) return legacy;
  return <>
    <nav aria-label="확장 창작 도구" className="flex flex-wrap items-center justify-center gap-4 border-b border-line bg-panel px-4 py-3 text-sm text-fg">
      <Link className="underline underline-offset-4" to="/studio/generate">생성형 애니메이션 · 2D↔3D</Link>
      <Link className="underline underline-offset-4" to="/read/spatial">공간 웹툰 감상</Link>
      <a className="underline underline-offset-4" href="/offline-drawing.html">서버 없이 로컬 드로잉</a>
    </nav>
    {home}
  </>;
}
