import { ShieldCheck, Plus, Trash2, Key, AlertOctagon } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";

import { adminFetch, formatDate } from "./admin-client";
import { AdminEmptyState, AdminSpinner } from "./admin-ui";
import { adminButtonClass } from "./admin-ui-utils";

import { useT } from "@/shared/lib/i18n";

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
  const t = useT();

  // New IP form
  const [showModal, setShowModal] = useState(false);
  const [ipAddress, setIpAddress] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  // Inline delete / revoke confirmations (replace blocking confirm())
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);
  const cancelRevokeRef = useRef<HTMLButtonElement>(null);

  // Move keyboard focus to the safe (cancel) action and allow Escape to
  // dismiss whichever inline confirmation is open.
  useEffect(() => {
    if (!confirmingDeleteId && !confirmingRevoke) return;
    (confirmingRevoke ? cancelRevokeRef : cancelDeleteRef).current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setConfirmingDeleteId(null);
        setConfirmingRevoke(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirmingDeleteId, confirmingRevoke]);

  const openModal = () => {
    setModalError(null);
    setShowModal(true);
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await adminFetch<{ items: IpRuleItem[] }>("/security/ip-rules", userId);
      setIpRules(res.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.security.loadError"));
    } finally {
      setLoading(false);
    }
  }, [userId, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleAddIp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ipAddress.trim()) return;
    try {
      setSubmitting(true);
      setModalError(null);
      await adminFetch("/security/ip-rules", userId, {
        method: "POST",
        body: JSON.stringify({ ipAddress, reason }),
      });
      setShowModal(false);
      setIpAddress("");
      setReason("");
      void loadData();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : t("admin.security.saveError"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteIp = async (id: string) => {
    try {
      setDeleting(true);
      await adminFetch(`/security/ip-rules/${id}`, userId, { method: "DELETE" });
      setConfirmingDeleteId(null);
      void loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.security.saveError"));
    } finally {
      setDeleting(false);
    }
  };

  const handleRevokeAllSessions = async () => {
    try {
      setRevoking(true);
      setNotice(null);
      const res = await adminFetch<{ message: string }>("/system/revoke-sessions", userId, { method: "POST" });
      setNotice(res.message);
      setConfirmingRevoke(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.security.saveError"));
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card/60 border border-line p-6 rounded-2xl backdrop-blur-xl">
        <div>
          <h2 className="text-xl font-bold text-fg flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            {t("admin.security.title")}
          </h2>
          <p className="text-sm text-fg-3 mt-1">
            {t("admin.security.desc")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setConfirmingRevoke(true)}
            disabled={revoking}
            className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-xl text-sm font-medium transition-all flex items-center gap-2"
          >
            <Key className="w-4 h-4 text-rose-400" />
            {revoking ? t("admin.security.revoking") : t("admin.security.revokeSessions")}
          </button>
          <button
            onClick={openModal}
            className="px-4 py-2 bg-accent hover:bg-accent-2 text-on-accent font-medium rounded-xl text-sm transition-all flex items-center gap-2 shadow-lg shadow-accent/20"
          >
            <Plus className="w-4 h-4" />
            {t("admin.security.addIp")}
          </button>
        </div>
      </div>

      {confirmingRevoke && (
        <div
          role="alert"
          className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm"
        >
          <p className="flex-1 text-amber-200">{t("admin.security.confirmRevokeSessions")}</p>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => void handleRevokeAllSessions()}
              disabled={revoking}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-60 text-white rounded-xl text-sm font-medium transition-colors"
            >
              {revoking ? t("admin.security.revoking") : t("admin.security.confirmRevokeButton")}
            </button>
            <button
              ref={cancelRevokeRef}
              onClick={() => setConfirmingRevoke(false)}
              disabled={revoking}
              className="px-4 py-2 bg-raised hover:bg-raised/80 text-fg-2 rounded-xl text-sm font-medium transition-colors"
            >
              {t("admin.plans.cancel")}
            </button>
          </div>
        </div>
      )}

      {notice && (
        <div role="status" className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-xl text-sm">
          {notice}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-bad/30 bg-bad/10 p-4 text-sm text-bad"
        >
          <span>{error}</span>
          <button
            type="button"
            className={adminButtonClass("ghost")}
            onClick={() => void loadData()}
          >
            {t("common.retry.short")}
          </button>
        </div>
      )}

      {loading ? (
        <AdminSpinner />
      ) : ipRules.length === 0 ? (
        <AdminEmptyState
          icon={<ShieldCheck size={20} />}
          title={t("admin.security.empty")}
        >
          <button
            type="button"
            className={adminButtonClass("accent")}
            onClick={openModal}
          >
            <Plus size={15} /> {t("admin.security.addIp")}
          </button>
        </AdminEmptyState>
      ) : (
        <div className="bg-card/60 border border-line rounded-2xl overflow-x-auto backdrop-blur-xl">
          <table className="w-full text-left text-sm text-fg-2">
            <thead className="bg-canvas/60 text-fg-3 font-medium uppercase text-xs border-b border-line">
              <tr>
                <th scope="col" className="p-4">{t("admin.security.thIp")}</th>
                <th scope="col" className="p-4">{t("admin.security.thReason")}</th>
                <th scope="col" className="p-4">{t("admin.security.thAction")}</th>
                <th scope="col" className="p-4">{t("admin.security.thDate")}</th>
                <th scope="col" className="p-4 text-right">{t("admin.plans.tableHeaderAction")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {ipRules.map((rule) => (
                <tr key={rule.id} className="hover:bg-raised/30 transition-colors">
                  <td className="p-4 font-mono text-fg font-semibold flex items-center gap-2">
                    <AlertOctagon className="w-4 h-4 text-rose-400" />
                    {rule.ipAddress}
                  </td>
                  <td className="p-4 text-fg-2">{rule.reason || "—"}</td>
                  <td className="p-4">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30 uppercase">
                      {rule.action}
                    </span>
                  </td>
                  <td className="p-4 text-fg-3 text-xs">{formatDate(rule.createdAt)}</td>
                  <td className="p-4 text-right">
                    {confirmingDeleteId === rule.id ? (
                      <div
                        role="alert"
                        className="flex items-center justify-end gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-2"
                      >
                        <span className="text-xs text-rose-300">
                          {t("admin.security.confirmDeleteIp")}
                        </span>
                        <button
                          onClick={() => void handleDeleteIp(rule.id)}
                          disabled={deleting}
                          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-60 text-white font-medium rounded-lg text-xs transition-colors"
                        >
                          {t("admin.security.confirmDeleteIpButton")}
                        </button>
                        <button
                          ref={cancelDeleteRef}
                          onClick={() => setConfirmingDeleteId(null)}
                          disabled={deleting}
                          className="px-3 py-1.5 bg-raised hover:bg-raised/80 text-fg-2 rounded-lg text-xs font-medium transition-colors"
                        >
                          {t("admin.plans.cancel")}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmingDeleteId(rule.id)}
                        className="p-2 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                        title="Unblock"
                        aria-label={t("admin.security.confirmDeleteIp")}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
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
            className="bg-card border border-line p-6 rounded-2xl w-full max-w-md space-y-4 shadow-2xl"
          >
            <h3 className="text-lg font-bold text-fg">{t("admin.security.modalTitle")}</h3>
            {modalError && (
              <div role="alert" className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-sm">
                {modalError}
              </div>
            )}
            <div>
              <label htmlFor="security-ip" className="text-xs font-medium text-fg-3 block mb-1">{t("admin.security.thIp")}</label>
              <input
                id="security-ip"
                type="text"
                required
                value={ipAddress}
                onChange={(e) => setIpAddress(e.target.value)}
                placeholder="192.168.1.100"
                className="w-full bg-canvas border border-line rounded-xl p-3 text-sm text-fg focus:outline-none focus:border-accent font-mono"
              />
            </div>
            <div>
              <label htmlFor="security-reason" className="text-xs font-medium text-fg-3 block mb-1">{t("admin.security.thReason")}</label>
              <input
                id="security-reason"
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("admin.security.reasonPlaceholder")}
                className="w-full bg-canvas border border-line rounded-xl p-3 text-sm text-fg focus:outline-none focus:border-accent"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-raised text-fg-2 rounded-xl text-sm font-medium hover:bg-raised"
              >
                {t("admin.plans.cancel")}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-fg rounded-xl text-sm font-medium shadow-lg shadow-rose-600/20"
              >
                {submitting ? t("admin.announcements.submitting") : t("admin.security.submitAddIp")}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
