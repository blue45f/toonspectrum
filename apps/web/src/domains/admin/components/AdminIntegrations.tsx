import { PlugZap, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { api, getApiErrorMessage } from "@/infrastructure/api";
import { useI18n } from "@/shared/lib/i18n";

interface RuntimeProvider {
  id: string;
  name: string;
  category: string;
  status: "ready" | "manual" | "configuration-required" | "approval-required";
  executable: boolean;
  statusReason: string;
}

interface RuntimeResponse {
  generatedAt: string;
  totalProviders: number;
  ready: number;
  manual: number;
  configurationRequired: number;
  approvalRequired: number;
  providers: readonly RuntimeProvider[];
}

export function AdminIntegrations() {
  const lang = useI18n((state) => state.lang);
  const ko = lang.startsWith("ko");
  const [runtime, setRuntime] = useState<RuntimeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void api.get<RuntimeResponse>("/integrations/runtime")
      .then((response) => { if (!cancelled) setRuntime(response); })
      .catch(async (reason: unknown) => {
        if (!cancelled) setError(await getApiErrorMessage(reason, "연동 운영 상태를 불러오지 못했습니다."));
      });
    return () => { cancelled = true; };
  }, [refreshKey]);

  return (
    <section id="integrations" className="rounded-2xl border border-line bg-card p-5" aria-labelledby="admin-integrations-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-accent"><PlugZap size={14} aria-hidden /> Integration runtime</p>
          <h2 id="admin-integrations-title" className="mt-1 text-xl font-bold text-fg">{ko ? "외부 연동 운영 콘솔" : "External integration operations"}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2">
            {ko ? "공급자별 설정·승인·수동 처리 상태를 확인합니다. 비밀 값은 이 화면과 API 응답에 포함되지 않습니다." : "Inspect provider configuration, approval and manual handoff states. Secret values are never included in this response."}
          </p>
        </div>
        <button type="button" onClick={() => setRefreshKey((value) => value + 1)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold text-fg-2">
          <RefreshCw size={15} aria-hidden /> {ko ? "새로고침" : "Refresh"}
        </button>
      </div>

      {error ? <p className="mt-5 rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{error}</p> : null}
      {!runtime && !error ? <p className="mt-5 text-sm text-fg-2" aria-busy="true">{ko ? "상태 확인 중" : "Loading status"}</p> : null}
      {runtime ? (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              [ko ? "전체" : "Total", runtime.totalProviders],
              [ko ? "준비됨" : "Ready", runtime.ready],
              [ko ? "수동" : "Manual", runtime.manual],
              [ko ? "설정 필요" : "Config", runtime.configurationRequired],
              [ko ? "승인 필요" : "Approval", runtime.approvalRequired],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-line bg-panel/50 p-3">
                <p className="text-xs text-fg-3">{label}</p><p className="mt-1 text-2xl font-bold text-fg">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 overflow-x-auto rounded-xl border border-line">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-panel text-xs uppercase tracking-wide text-fg-3">
                <tr><th className="px-3 py-3">Provider</th><th className="px-3 py-3">Category</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Reason</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {runtime.providers.map((provider) => (
                  <tr key={provider.id}>
                    <td className="px-3 py-3 font-semibold text-fg">{provider.name}</td>
                    <td className="px-3 py-3 text-fg-2">{provider.category}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${provider.executable ? "bg-good/10 text-good" : "bg-warn/10 text-warn"}`}>
                        {provider.status}
                      </span>
                    </td>
                    <td className="max-w-xl px-3 py-3 text-xs leading-5 text-fg-3">{provider.statusReason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-fg-3">{ko ? "마지막 계산" : "Last calculated"}: {new Date(runtime.generatedAt).toLocaleString()}</p>
        </>
      ) : null}
    </section>
  );
}
