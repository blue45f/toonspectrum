import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { loadStudioAllToolsCatalog } from "./studio-all-tools-catalog-loader";
import type { StudioAllToolsCatalog } from "./StudioAllToolsCatalog";

type Catalog = typeof StudioAllToolsCatalog;
export function StudioAllToolsCatalogSlot(props: ComponentProps<Catalog>) {
  const [Component, setComponent] = useState<Catalog | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true; setFailed(false);
    void loadStudioAllToolsCatalog().then((module) => {
      if (active) setComponent(() => module.StudioAllToolsCatalog);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [attempt]);
  useLayoutEffect(() => {
    if (!Component || !root.current) return;
    const document = root.current.ownerDocument;
    const dialog = root.current.closest('[role="dialog"]');
    if (document.activeElement === document.body || document.activeElement === dialog
      || document.activeElement === dialog?.querySelector("header button")) {
      root.current.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
    }
  }, [Component]);
  return <div ref={root}>
    {Component ? <Component {...props} /> : <div role={failed ? "alert" : "status"} className="space-y-2 p-3 text-sm text-fg-2">
      <p>{failed ? "전체 도구를 불러오지 못했습니다. 원고와 도구 구성은 유지됩니다." : "전체 도구를 불러오는 중…"}</p>
      {failed ? <button type="button" className="min-h-11 rounded-lg border border-line px-3 focus-visible:ring-2 focus-visible:ring-accent"
        onClick={() => setAttempt((value) => value + 1)}>전체 도구 다시 불러오기</button> : null}
    </div>}
  </div>;
}
