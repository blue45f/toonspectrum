import { Flag, CheckCircle, XCircle } from "lucide-react";
import { useState, useEffect, useCallback } from "react";

import { adminFetch, formatDate } from "./admin-client";

export interface ContentReportItem {
  id: string;
  reporterId: string;
  reporterName: string | null;
  reporterEmail: string | null;
  targetType: string;
  targetId: string;
  reason: string;
  status: "pending" | "resolved" | "dismissed";
  resolutionNote: string | null;
  createdAt: string;
}

interface AdminReportsProps {
  userId: string;
}

export function AdminReports({ userId }: AdminReportsProps) {
  const [reports, setReports] = useState<ContentReportItem[]>([]);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await adminFetch<{ items: ContentReportItem[] }>(
        `/reports?status=${encodeURIComponent(statusFilter)}`,
        userId
      );
      setReports(res.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "신고 목록 로딩 실패");
    } finally {
      setLoading(false);
    }
  }, [userId, statusFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleResolve = async (id: string, action: "resolve" | "dismiss") => {
    const note = prompt(
      action === "resolve"
        ? "제재/조치 사유 및 후속 조치 메모를 입력하세요:"
        : "기각/기각 처리 이유를 입력하세요:"
    );
    if (note === null) return;
    try {
      await adminFetch(`/reports/${id}/resolve`, userId, {
        method: "POST",
        body: JSON.stringify({ action, note }),
      });
      void loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "처리 실패");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-6 rounded-2xl backdrop-blur-xl">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Flag className="w-5 h-5 text-amber-400" />
            유저 신고 & 분쟁 심의 처리 큐
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            게시글, 댓글, 작품 리뷰 및 자산 권리 침해 신고를 심의하고 제재 조치를 취합니다.
          </p>
        </div>

        <div className="flex bg-slate-950 p-1 border border-slate-800 rounded-xl">
          {(["pending", "resolved", "dismissed", "all"] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all uppercase ${
                statusFilter === st
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {st === "pending"
                ? "대기 중"
                : st === "resolved"
                ? "조치 완료"
                : st === "dismissed"
                ? "기각됨"
                : "전체"}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-slate-400">신고 항목 로딩 중...</div>
      ) : reports.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/30 border border-slate-800 rounded-2xl text-slate-400">
          해당 조건의 신고 내역이 없습니다.
        </div>
      ) : (
        <div className="grid gap-4">
          {reports.map((item) => (
            <div
              key={item.id}
              className="p-5 bg-slate-900/60 border border-slate-800 rounded-2xl backdrop-blur-xl space-y-3"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase ${
                        item.status === "pending"
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          : item.status === "resolved"
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : "bg-slate-700/40 text-slate-400 border border-slate-700/50"
                      }`}
                    >
                      {item.status === "pending"
                        ? "심의 대기"
                        : item.status === "resolved"
                        ? "제재 완료"
                        : "기각"}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-slate-800 text-slate-300">
                      유형: {item.targetType}
                    </span>
                    <span className="text-xs text-slate-500">ID: {item.targetId}</span>
                  </div>

                  <p className="text-sm font-medium text-white pt-1">
                    신고자: {item.reporterName || item.reporterEmail || item.reporterId}
                  </p>
                  <p className="text-sm text-slate-300 bg-slate-950/60 border border-slate-800/80 p-3 rounded-xl">
                    <span className="text-amber-400 font-semibold">신고 사유:</span> {item.reason}
                  </p>

                  {item.resolutionNote && (
                    <p className="text-xs text-slate-400 italic pt-1">
                      관리자 처리 메모: {item.resolutionNote}
                    </p>
                  )}
                  <p className="text-xs text-slate-500">접수일: {formatDate(item.createdAt)}</p>
                </div>

                {item.status === "pending" && (
                  <div className="flex items-center gap-2 self-center sm:self-start">
                    <button
                      onClick={() => void handleResolve(item.id, "resolve")}
                      className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      제재 승인
                    </button>
                    <button
                      onClick={() => void handleResolve(item.id, "dismiss")}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      기각
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
