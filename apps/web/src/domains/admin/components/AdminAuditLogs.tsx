import { History, Search, FileText, X } from "lucide-react";
import { useState, useEffect, useCallback } from "react";

import { adminFetch, formatDate } from "./admin-client";
import { LiveAutoRefresh } from "./LiveAutoRefresh";

import { useT } from "@/shared/lib/i18n";

export interface AuditLogItem {
  id: string;
  adminId: string;
  adminEmail: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}
interface AdminAuditLogsProps {
  userId: string;
}

export function AdminAuditLogs({ userId }: AdminAuditLogsProps) {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const t = useT();

  // Modal detail
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      const queryStr = params.toString() ? `?${params.toString()}` : "";
      const res = await adminFetch<{ items: AuditLogItem[] }>(`/audit-logs${queryStr}`, userId);
      setLogs(res.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.auditLogs.loadError"));
    } finally {
      setLoading(false);
    }
  }, [userId, search, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card/60 border border-line p-6 rounded-2xl backdrop-blur-xl">
        <div>
          <h2 className="text-xl font-bold text-fg flex items-center gap-2">
            <History className="w-5 h-5 text-accent" />
            {t("admin.auditLogs.title")}
          </h2>
          <p className="text-sm text-fg-3 mt-1">
            {t("admin.auditLogs.desc")}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <LiveAutoRefresh onRefresh={() => void loadData()} loading={loading} />
          <div className="relative w-64">
            <Search className="w-4 h-4 text-fg-3 absolute left-3 top-3" />
            <input
              type="text"
              placeholder={t("admin.auditLogs.searchPlaceholder")}
              aria-label={t("admin.auditLogs.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-canvas border border-line rounded-xl text-xs text-fg focus:outline-none focus:border-accent"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-fg-3">{t("admin.auditLogs.loading")}</div>
      ) : logs.length === 0 ? (
        <div className="p-12 text-center bg-card/30 border border-line rounded-2xl text-fg-3">
          {t("admin.auditLogs.empty")}
        </div>
      ) : (
        <div className="bg-card/60 border border-line rounded-2xl overflow-hidden backdrop-blur-xl">
          <table className="w-full text-left text-sm text-fg-2">
            <th scope="col"ead className="bg-canvas/60 text-fg-3 font-medium uppercase text-xs border-b border-line">
              <tr>
                <th scope="col" className="p-4">{t("admin.security.thDate")}</th>
                <th scope="col" className="p-4">{t("admin.auditLogs.thAdmin")}</th>
                <th scope="col" className="p-4">{t("admin.auditLogs.thAction")}</th>
                <th scope="col" className="p-4">{t("admin.auditLogs.thTarget")}</th>
                <th scope="col" className="p-4 text-right">{t("admin.auditLogs.thDetail")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-raised/30 transition-colors">
                  <td className="p-4 text-fg-3 text-xs font-mono">{formatDate(log.createdAt)}</td>
                  <td className="p-4 font-medium text-fg">{log.adminEmail || log.adminId}</td>
                  <td className="p-4">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-accent/20 text-accent border border-accent/30 font-mono">
                      {log.action}
                    </span>
                  </td>
                  <td className="p-4 text-fg-2 text-xs">
                    {log.targetType} {log.targetId ? `(${log.targetId})` : ""}
                  </td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => setSelectedLog(log)}
                      className="p-2 text-accent hover:bg-accent-2/10 rounded-lg transition-colors inline-flex items-center gap-1 text-xs font-medium"
                    >
                      <FileText className="w-4 h-4" />
                      {t("admin.auditLogs.view")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-card border border-line p-6 rounded-2xl w-full max-w-lg space-y-4 shadow-2xl relative">
            <button
              onClick={() => setSelectedLog(null)}
              className="absolute top-4 right-4 p-2 text-fg-3 hover:text-fg"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-fg flex items-center gap-2">
              <FileText className="w-5 h-5 text-accent" />
              {t("admin.auditLogs.modalTitle")} ({selectedLog.id.slice(0, 8)})
            </h3>
            <div className="space-y-2 text-sm text-fg-2 bg-canvas p-4 rounded-xl border border-line font-mono text-xs">
              <p><span className="text-fg-3">Action:</span> {selectedLog.action}</p>
              <p><span className="text-fg-3">Admin Email:</span> {selectedLog.adminEmail}</p>
              <p><span className="text-fg-3">Target:</span> {selectedLog.targetType} / {selectedLog.targetId || "—"}</p>
              <p><span className="text-fg-3">Time:</span> {formatDate(selectedLog.createdAt)}</p>
              <div className="pt-2">
                <p className="text-fg-3 mb-1">Details Payload:</p>
                <pre className="p-3 bg-card rounded-lg text-accent overflow-x-auto border border-line">
                  {JSON.stringify(selectedLog.details, null, 2)}
                </pre>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-raised text-fg-2 rounded-xl text-sm font-medium hover:bg-raised"
              >
                {t("admin.auditLogs.close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
