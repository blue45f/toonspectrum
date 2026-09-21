import { useLayoutEffect, useRef, useState } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { acquireProductionViewsRepository, productionViewScope, type ProductionSavedFilter, type ProductionSavedView } from "./studio-production-saved-views";

export function StudioProductionSavedViews(props: {
  readonly actorId: string | null; readonly scopeKey: string; readonly filter: ProductionSavedFilter;
  readonly onApply: (filter: ProductionSavedFilter) => void;
}) {
  return <SavedViewsForScope key={productionViewScope(props.actorId, props.scopeKey)} {...props} />;
}
function SavedViewsForScope({ actorId, scopeKey, filter, onApply }: Parameters<typeof StudioProductionSavedViews>[0]) {
  const bt = useBilingual("StudioProductionSavedViews");
  const [views, setViews] = useState<ProductionSavedView[] | null>(null), [name, setName] = useState("");
  const [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const active = useRef(false), pending = useRef(false);
  const scope = productionViewScope(actorId, scopeKey);
  useLayoutEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const run = async (action: "load" | "save" | "remove", id?: string) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setNotice("");
    const savedName = name;
    try {
      const repository = await acquireProductionViewsRepository();
      if (!active.current) return;
      const result = action === "load" ? await repository.load(scope) : action === "save"
        ? await repository.save(scope, savedName, filter) : await repository.remove(scope, id!);
      if (!active.current) return;
      setViews(result);
      if (action === "save") setName((current) => current === savedName ? "" : current);
      setNotice(action === "load" ? bt("이 기기에 저장된 보기입니다.", "Views saved on this device.")
        : bt("이 기기의 보기 설정에 반영했습니다. 원고나 팀 작업은 변경하지 않았습니다.", "Updated local views. No manuscript or team task was changed."));
    } catch {
      if (active.current) setNotice(bt("보기 설정을 확인하거나 저장하지 못했습니다. 다른 이름·저장 한도(16개)·기기 저장소를 확인해 주세요. 현재 작업은 유지됩니다.", "Could not read or save views. Check the name, 16-view limit and device storage. Current work is unchanged."));
    } finally { pending.current = false; if (active.current) setBusy(false); }
  };
  return <details className="rounded-xl border border-line p-3">
    <summary className="min-h-11 cursor-pointer text-sm font-semibold">{bt("내 보기 저장·불러오기", "Save and load my views")}</summary>
    <p className="my-2 text-xs text-fg-2">{bt("현재 계정·작품의 이름과 검색 조건만 이 기기에 저장합니다. 팀 공유나 권한 설정이 아닙니다.", "Save only the name and filters for this account and work on this device. This does not share work or grant access.")}</p>
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-0 text-xs">{bt("보기 이름", "View name")}<input className="mt-1 block min-h-11 max-w-full rounded-lg border border-line bg-panel px-3" value={name} maxLength={60} disabled={busy} onChange={(event) => setName(event.target.value)} /></label>
      <button type="button" className="min-h-11 rounded-lg border border-line px-3 text-sm" disabled={busy || !name.trim()} onClick={() => void run("save")}>{bt("현재 조건 저장", "Save current filters")}</button>
      <button type="button" className="min-h-11 rounded-lg border border-line px-3 text-sm" disabled={busy} onClick={() => void run("load")}>{bt("저장된 보기 불러오기", "Load saved views")}</button>
    </div>
    {views?.map((view) => <div key={view.id} className="mt-2 flex flex-wrap gap-2">
      <button type="button" className="min-h-11 min-w-0 max-w-full break-words rounded-lg border border-line px-3 text-sm" disabled={busy || (view.filter.view === "mine" && !actorId)} onClick={() => onApply(view.filter)}>{view.name}</button>
      <button type="button" className="min-h-11 rounded-lg border border-line px-3 text-xs" disabled={busy} onClick={() => void run("remove", view.id)} aria-label={bt(`${view.name} 보기 삭제`, `Delete ${view.name} view`)}>{bt("보기 삭제", "Delete view")}</button>
    </div>)}
    {views?.length === 0 ? <p className="mt-2 text-sm">{bt("저장된 보기가 없습니다.", "No saved views.")}</p> : null}
    {notice ? <p role="status" className="mt-2 text-xs">{notice}</p> : null}
  </details>;
}
