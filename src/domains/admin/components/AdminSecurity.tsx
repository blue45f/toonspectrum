import { ShieldCheck, Plus, Trash2, Key, AlertOctagon } from "lucide-react";
import { useState, useEffect, useCallback } from "react";

import { adminFetch, formatDate } from "./admin-client";

export interface IpRuleItem {
  id: string;
  ipAddress: string;
  reason: string;
  action: string;
  createdAt: string;
}

interface AdminSecurityProps {
  userId: string;
}

export function AdminSecurity({ userId }: AdminSecurityProps) {
  const [ipRules, setIpRules] = useState<IpRuleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New IP form
  const [showModal, setShowModal] = useState(false);
  const [ipAddress, setIpAddress] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await adminFetch<{ items: IpRuleItem[] }>("/security/ip-rules", userId);
      setIpRules(res.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "보안 정책 로딩 실패");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleAddIp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ipAddress.trim()) return;
    try {
      setSubmitting(true);
      await adminFetch("/security/ip-rules", userId, {
        method: "POST",
        body: JSON.stringify({ ipAddress, reason }),
      });
      setShowModal(false);
      setIpAddress("");
      setReason("");
      void loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "IP 추가 실패");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteIp = async (id: string) => {
    if (!confirm("이 IP 차단 규칙을 해제하시겠습니까?")) return;
    try {
      await adminFetch(`/security/ip-rules/${id}`, userId, { method: "DELETE" });
      void loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "삭제 실패");
    }
  };

  const handleRevokeAllSessions = async () => {
    if (!confirm("⚠️ 주의: 전체 회원의 세션 버전을 갱신하여 기존 모든 로그인 접속을 해제(로그아웃)하시겠습니까?")) return;
    try {
      setRevoking(true);
      const res = await adminFetch<{ message: string }>("/system/revoke-sessions", userId, { method: "POST" });
      alert(res.message);
    } catch (err) {
      alert(err instanceof Error ? err.message : "세션 만료 처리 실패");
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-6 rounded-2xl backdrop-blur-xl">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            로그인 보안 & IP 블랙리스트 정책
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            이상 징후 IP 차단 정책 관리 및 전역 세션 즉시 만료 비상 제어를 수행합니다.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => void handleRevokeAllSessions()}
            disabled={revoking}
            className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-xl text-sm font-medium transition-all flex items-center gap-2"
          >
            <Key className="w-4 h-4 text-rose-400" />
            {revoking ? "처리 중..." : "전체 세션 즉시 강제 만료"}
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl text-sm transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/20"
          >
            <Plus className="w-4 h-4" />
            차단 IP 등록
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-slate-400">차단 IP 목록 로딩 중...</div>
      ) : ipRules.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/30 border border-slate-800 rounded-2xl text-slate-400">
          현재 등록된 차단 IP가 없습니다.
        </div>
      ) : (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden backdrop-blur-xl">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/60 text-slate-400 font-medium uppercase text-xs border-b border-slate-800">
              <tr>
                <th className="p-4">IP 주소</th>
                <th className="p-4">차단 사유</th>
                <th className="p-4">조치</th>
                <th className="p-4">등록일</th>
                <th className="p-4 text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {ipRules.map((rule) => (
                <tr key={rule.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="p-4 font-mono text-white font-semibold flex items-center gap-2">
                    <AlertOctagon className="w-4 h-4 text-rose-400" />
                    {rule.ipAddress}
                  </td>
                  <td className="p-4 text-slate-300">{rule.reason || "—"}</td>
                  <td className="p-4">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30 uppercase">
                      {rule.action}
                    </span>
                  </td>
                  <td className="p-4 text-slate-400 text-xs">{formatDate(rule.createdAt)}</td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => void handleDeleteIp(rule.id)}
                      className="p-2 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                      title="차단 해제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <form
            onSubmit={(e) => void handleAddIp(e)}
            className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-md space-y-4 shadow-2xl"
          >
            <h3 className="text-lg font-bold text-white">IP 차단 규칙 추가</h3>
            <div>
              <label htmlFor="security-ip" className="text-xs font-medium text-slate-400 block mb-1">IP 주소</label>
              <input
                id="security-ip"
                type="text"
                required
                value={ipAddress}
                onChange={(e) => setIpAddress(e.target.value)}
                placeholder="예: 192.168.1.100"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
            <div>
              <label htmlFor="security-reason" className="text-xs font-medium text-slate-400 block mb-1">차단 사유</label>
              <input
                id="security-reason"
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="예: 과도한 로그인 시도 및 스팸 어뷰징"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm font-medium hover:bg-slate-700"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-sm font-medium shadow-lg shadow-rose-600/20"
              >
                {submitting ? "등록 중..." : "차단 추가"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
