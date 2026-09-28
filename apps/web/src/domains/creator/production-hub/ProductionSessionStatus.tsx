import { RefreshCw } from "lucide-react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export function ProductionSessionStatus({ revision, refreshing, saving, onRefresh }: {
  readonly revision: number;
  readonly refreshing: boolean;
  readonly saving: boolean;
  readonly onRefresh: () => Promise<void>;
}) {
  const bt = useBilingual("ProductionSessionStatus");
  return <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-panel p-3 text-xs text-fg-2">
    <p>{bt("저장된 버전", "Saved revision")} r{revision} · {bt("다른 탭·재접속 시 최신 상태를 확인합니다.", "Refreshes on tab updates and reconnect.")}</p>
    <button type="button" disabled={refreshing || saving} onClick={() => void onRefresh()}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-card px-3 font-semibold focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50">
      <RefreshCw size={15} aria-hidden="true" />
      {refreshing ? bt("최신 상태 확인 중…", "Refreshing…") : bt("최신 상태 확인", "Refresh project")}
    </button>
  </div>;
}
