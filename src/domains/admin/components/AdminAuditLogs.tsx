import { History, Search, FileText, X } from "lucide-react";
import { useState, useEffect, useCallback } from "react";

import { adminFetch, formatDate } from "./admin-client";
import { LiveAutoRefresh } from "./LiveAutoRefresh";

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
      setError(err instanceof Error ? err.message : "감사 로그를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [userId, search]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-6 rounded-2xl backdrop-blur-xl">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-400" />
            관리자 감사 로그 (Audit Logs)
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            관리자 권한으로 수행된 모든 주요 조치 및 권한/설정 변경 이력을 추적합니다.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <LiveAutoRefresh onRefresh={() => void loadData()} loading={loading} />
          <div className="relative w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="검색 (이메일/작업)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
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
        <div className="p-12 text-center text-slate-400">감사 로그 로딩 중...</div>
      ) : logs.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/30 border border-slate-800 rounded-2xl text-slate-400">
          기록된 감사 로그가 없습니다.
        </div>
      ) : (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden backdrop-blur-xl">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/60 text-slate-400 font-medium uppercase text-xs border-b border-slate-800">
              <tr>
                <th className="p-4">일시</th>
                <th className="p-4">수행 관리자</th>
                <th className="p-4">작업 (Action)</th>
                <th className="p-4">대상 (Target)</th>
                <th className="p-4 text-right">상세</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="p-4 text-slate-400 text-xs font-mono">{formatDate(log.createdAt)}</td>
                  <td className="p-4 font-medium text-white">{log.adminEmail || log.adminId}</td>
                  <td className="p-4">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono">
                      {log.action}
                    </span>
                  </td>
                  <td className="p-4 text-slate-300 text-xs">
                    {log.targetType} {log.targetId ? `(${log.targetId})` : ""}
                  </td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => setSelectedLog(log)}
                      className="p-2 text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors inline-flex items-center gap-1 text-xs font-medium"
                    >
                      <FileText className="w-4 h-4" />
                      보기
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
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-lg space-y-4 shadow-2xl relative">
            <button
              onClick={() => setSelectedLog(null)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-400" />
              감사 로그 상세 (ID: {selectedLog.id.slice(0, 8)})
            </h3>
            <div className="space-y-2 text-sm text-slate-300 bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs">
              <p><span className="text-slate-500">Action:</span> {selectedLog.action}</p>
              <p><span className="text-slate-500">Admin Email:</span> {selectedLog.adminEmail}</p>
              <p><span className="text-slate-500">Target:</span> {selectedLog.targetType} / {selectedLog.targetId || "—"}</p>
              <p><span className="text-slate-500">Time:</span> {formatDate(selectedLog.createdAt)}</p>
              <div className="pt-2">
                <p className="text-slate-500 mb-1">Details Payload:</p>
                <pre className="p-3 bg-slate-900 rounded-lg text-indigo-300 overflow-x-auto border border-slate-800">
                  {JSON.stringify(selectedLog.details, null, 2)}
                </pre>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm font-medium hover:bg-slate-700"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
