import { Ticket, Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";

import { adminFetch, formatDate } from "./admin-client";

import { useT } from "@/shared/lib/i18n";

export interface PromoItem {
  id: string;
  code: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  maxUses: number;
  usedCount: number;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
}

interface AdminPromosProps {
  userId: string;
}

export function AdminPromos({ userId }: AdminPromosProps) {
  const [promos, setPromos] = useState<PromoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const t = useT();

  // New promo modal
  const [showModal, setShowModal] = useState(false);
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [discountValue, setDiscountValue] = useState(10);
  const [maxUses, setMaxUses] = useState(100);
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Inline delete confirmation (row-level, replaces blocking confirm())
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);

  // Move keyboard focus to the safe (cancel) action and allow Escape to
  // dismiss the inline confirmation.
  useEffect(() => {
    if (!confirmingDeleteId) return;
    cancelDeleteRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmingDeleteId(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirmingDeleteId]);

  const openModal = () => {
    setModalError(null);
    setShowModal(true);
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await adminFetch<{ items: PromoItem[] }>("/promos", userId);
      setPromos(res.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.promos.loadError"));
    } finally {
      setLoading(false);
    }
  }, [userId, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    try {
      setSubmitting(true);
      setModalError(null);
      await adminFetch("/promos", userId, {
        method: "POST",
        body: JSON.stringify({
          code,
          discountType,
          discountValue,
          maxUses,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        }),
      });
      setShowModal(false);
      setCode("");
      setDiscountValue(10);
      setMaxUses(100);
      setExpiresAt("");
      void loadData();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : t("admin.promos.saveError"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (id: string) => {
    try {
      await adminFetch(`/promos/${id}/toggle`, userId, { method: "POST" });
      void loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.promos.saveError"));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setDeleting(true);
      await adminFetch(`/promos/${id}`, userId, { method: "DELETE" });
      setConfirmingDeleteId(null);
      void loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.promos.saveError"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card/60 border border-line p-6 rounded-2xl backdrop-blur-xl">
        <div>
          <h2 className="text-xl font-bold text-fg flex items-center gap-2">
            <Ticket className="w-5 h-5 text-accent" />
            {t("admin.promos.title")}
          </h2>
          <p className="text-sm text-fg-3 mt-1">
            {t("admin.promos.desc")}
          </p>
        </div>

        <button
          onClick={openModal}
          className="px-4 py-2 bg-accent hover:bg-accent-2 text-on-accent font-medium rounded-xl text-sm transition-all flex items-center gap-2 self-start sm:self-auto shadow-lg shadow-accent/20"
        >
          <Plus className="w-4 h-4" />
          {t("admin.promos.create")}
        </button>
      </div>

      {error && (
        <div role="alert" className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-fg-3">{t("admin.promos.loading")}</div>
      ) : promos.length === 0 ? (
        <div className="p-12 text-center bg-card/30 border border-line rounded-2xl text-fg-3">
          {t("admin.promos.empty")}
        </div>
      ) : (
        <div className="bg-card/60 border border-line rounded-2xl overflow-x-auto backdrop-blur-xl">
          <table className="w-full text-left text-sm text-fg-2">
            <thead className="bg-canvas/60 text-fg-3 font-medium uppercase text-xs border-b border-line">
              <tr>
                <th scope="col" className="p-4">{t("admin.promos.thCode")}</th>
                <th scope="col" className="p-4">{t("admin.promos.thBenefit")}</th>
                <th scope="col" className="p-4">{t("admin.promos.thUsage")}</th>
                <th scope="col" className="p-4">{t("admin.plans.tableHeaderStatus")}</th>
                <th scope="col" className="p-4">{t("admin.campaigns.endsAt")}</th>
                <th scope="col" className="p-4 text-right">{t("admin.plans.tableHeaderAction")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {promos.map((item) => (
                <tr key={item.id} className="hover:bg-raised/30 transition-colors">
                  <td className="p-4 font-mono font-bold text-accent">{item.code}</td>
                  <td className="p-4 font-semibold text-fg">
                    {item.discountType === "percent"
                      ? `${item.discountValue}%`
                      : `₩${item.discountValue.toLocaleString()}`}
                  </td>
                  <td className="p-4 text-fg-2">
                    {item.usedCount} / {item.maxUses}
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        item.isActive
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : "bg-raised text-fg-3 border border-line-strong"
                      }`}
                    >
                      {item.isActive ? t("admin.plans.statusActive") : t("admin.plans.statusInactive")}
                    </span>
                  </td>
                  <td className="p-4 text-fg-3 text-xs font-mono">
                    {item.expiresAt ? formatDate(item.expiresAt) : "Unlimited"}
                  </td>
                  <td className="p-4 text-right">
                    {confirmingDeleteId === item.id ? (
                      <div
                        role="alert"
                        className="flex items-center justify-end gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-2"
                      >
                        <span className="text-xs text-rose-300">
                          {t("admin.promos.confirmDelete")}
                        </span>
                        <button
                          onClick={() => void handleDelete(item.id)}
                          disabled={deleting}
                          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-60 text-white font-medium rounded-lg text-xs transition-colors"
                        >
                          {t("admin.promos.confirmDeleteButton")}
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
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => void handleToggle(item.id)}
                          aria-label={item.isActive ? t("admin.promos.toggleDeactivate") : t("admin.promos.toggleActivate")}
                          className="p-2 text-fg-3 hover:text-fg rounded-lg hover:bg-raised transition-colors"
                        >
                          {item.isActive ? (
                            <ToggleRight className="w-5 h-5 text-emerald-400" />
                          ) : (
                            <ToggleLeft className="w-5 h-5 text-fg-3" />
                          )}
                        </button>
                        <button
                          onClick={() => setConfirmingDeleteId(item.id)}
                          className="p-2 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                          aria-label={t("admin.promos.confirmDelete")}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
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
            onSubmit={(e) => void handleCreate(e)}
            className="bg-card border border-line p-6 rounded-2xl w-full max-w-md space-y-4 shadow-2xl"
          >
            <h3 className="text-lg font-bold text-fg">{t("admin.promos.modalTitle")}</h3>

            {modalError && (
              <div role="alert" className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-sm">
                {modalError}
              </div>
            )}

            <div>
              <label htmlFor="promo-code" className="text-xs font-medium text-fg-3 block mb-1">{t("admin.promos.inputCode")}</label>
              <input
                id="promo-code"
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="WELCOME2026"
                className="w-full bg-canvas border border-line rounded-xl p-3 text-sm text-fg focus:outline-none focus:border-accent font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="promo-discount-type" className="text-xs font-medium text-fg-3 block mb-1">{t("admin.promos.inputType")}</label>
                <select
                  id="promo-discount-type"
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value as "percent" | "fixed")}
                  className="w-full bg-canvas border border-line rounded-xl p-3 text-sm text-fg focus:outline-none focus:border-accent"
                >
                  <option value="percent">{t("admin.promos.typePercent")}</option>
                  <option value="fixed">{t("admin.promos.typeFixed")}</option>
                </select>
              </div>

              <div>
                <label htmlFor="promo-discount-val" className="text-xs font-medium text-fg-3 block mb-1">
                  {discountType === "percent" ? t("admin.promos.inputValuePercent") : t("admin.promos.inputValueFixed")}
                </label>
                <input
                  id="promo-discount-val"
                  type="number"
                  required
                  min={1}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(Number(e.target.value))}
                  className="w-full bg-canvas border border-line rounded-xl p-3 text-sm text-fg focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="promo-max-uses" className="text-xs font-medium text-fg-3 block mb-1">{t("admin.promos.inputMaxUses")}</label>
                <input
                  id="promo-max-uses"
                  type="number"
                  required
                  min={1}
                  value={maxUses}
                  onChange={(e) => setMaxUses(Number(e.target.value))}
                  className="w-full bg-canvas border border-line rounded-xl p-3 text-sm text-fg focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label htmlFor="promo-expires-at" className="text-xs font-medium text-fg-3 block mb-1">{t("admin.promos.inputExpiresAt")}</label>
                <input
                  id="promo-expires-at"
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="w-full bg-canvas border border-line rounded-xl p-3 text-sm text-fg focus:outline-none focus:border-accent"
                />
              </div>
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
                className="px-4 py-2 bg-accent hover:bg-accent-2 text-on-accent rounded-xl text-sm font-medium shadow-lg shadow-accent/20"
              >
                {submitting ? t("admin.announcements.submitting") : t("admin.promos.submit")}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
