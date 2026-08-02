import { Megaphone, Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { useState, useEffect, useCallback } from "react";

import { adminFetch, formatDate } from "./admin-client";

import { useT } from "@/lib/i18n";

export interface AnnouncementItem {
  id: string;
  title: string;
  content: string;
  level: "info" | "warning" | "critical";
  placement: "top_banner" | "popup_modal" | "community_top";
  targetRole: string;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
}

interface AdminAnnouncementsProps {
  userId: string;
}

export function AdminAnnouncements({ userId }: AdminAnnouncementsProps) {
  const [items, setItems] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const t = useT();

  // New item modal
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [level, setLevel] = useState<"info" | "warning" | "critical">("info");
  const [placement, setPlacement] = useState<"top_banner" | "popup_modal" | "community_top">("top_banner");
  const [targetRole, setTargetRole] = useState("all");
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await adminFetch<{ items: AnnouncementItem[] }>("/announcements", userId);
      setItems(res.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.announcements.loadError"));
    } finally {
      setLoading(false);
    }
  }, [userId, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      setSaving(true);
      await adminFetch("/announcements", userId, {
        method: "POST",
        body: JSON.stringify({ title, content, level, placement, targetRole, isActive: true }),
      });
      setShowModal(false);
      setTitle("");
      setContent("");
      void loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id: string) => {
    try {
      await adminFetch(`/announcements/${id}/toggle`, userId, { method: "POST" });
      void loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("admin.announcements.confirmDelete"))) return;
    try {
      await adminFetch(`/announcements/${id}`, userId, { method: "DELETE" });
      void loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-6 rounded-2xl backdrop-blur-xl">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-indigo-400" />
            {t("admin.announcements.title")}
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            {t("admin.announcements.desc")}
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl text-sm transition-all flex items-center gap-2 self-start sm:self-auto shadow-lg shadow-indigo-600/20"
        >
          <Plus className="w-4 h-4" />
          {t("admin.announcements.create")}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-slate-400">{t("admin.announcements.loading")}</div>
      ) : items.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/30 border border-slate-800 rounded-2xl text-slate-400">
          {t("admin.announcements.empty")}
        </div>
      ) : (
        <div className="grid gap-4">
          {items.map((item) => (
            <div
              key={item.id}
              className={`p-5 rounded-2xl border transition-all ${
                item.isActive
                  ? "bg-slate-900/80 border-slate-700/80 shadow-md"
                  : "bg-slate-950/40 border-slate-800/60 opacity-60"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`px-2 py-0.5 text-[10px] font-bold rounded-md uppercase tracking-wider ${
                        item.level === "critical"
                          ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                          : item.level === "warning"
                          ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                          : "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                      }`}
                    >
                      {item.level}
                    </span>
                    <span className="px-2 py-0.5 text-[10px] font-mono rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                      {item.placement}
                    </span>
                    <span className="text-xs text-slate-500">
                      Target: {item.targetRole}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-white pt-1">{item.title}</h3>
                  {item.content && <p className="text-sm text-slate-300 leading-relaxed">{item.content}</p>}
                  <p className="text-[11px] text-slate-500 font-mono pt-2">Created: {formatDate(item.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => void handleToggle(item.id)}
                    className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    {item.isActive ? <ToggleRight className="w-6 h-6 text-emerald-400" /> : <ToggleLeft className="w-6 h-6 text-slate-600" />}
                  </button>
                  <button
                    onClick={() => void handleDelete(item.id)}
                    className="p-2 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreate}
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl"
          >
            <h3 className="text-lg font-bold text-white">{t("admin.announcements.modalTitle")}</h3>

            <div className="space-y-1">
              <label className="text-xs text-slate-400 font-medium">{t("admin.announcements.inputTitle")}</label>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400 font-medium">{t("admin.announcements.inputContent")}</label>
              <textarea
                rows={3}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1">{t("admin.announcements.inputLevel")}</label>
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value as "info" | "warning" | "critical")}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-2 text-xs text-white"
                >
                  <option value="info">{t("admin.announcements.levelInfo")}</option>
                  <option value="warning">{t("admin.announcements.levelWarning")}</option>
                  <option value="critical">{t("admin.announcements.levelCritical")}</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1">{t("admin.announcements.inputPlacement")}</label>
                <select
                  value={placement}
                  onChange={(e) => setPlacement(e.target.value as "top_banner" | "popup_modal" | "community_top")}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-2 text-xs text-white"
                >
                  <option value="top_banner">{t("admin.announcements.placementBanner")}</option>
                  <option value="popup_modal">{t("admin.announcements.placementModal")}</option>
                  <option value="community_top">{t("admin.announcements.placementCommunity")}</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1">{t("admin.announcements.inputTarget")}</label>
                <select
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-2 text-xs text-white"
                >
                  <option value="all">{t("admin.announcements.targetAll")}</option>
                  <option value="creator">{t("admin.announcements.targetCreator")}</option>
                  <option value="user">{t("admin.announcements.targetUser")}</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm font-medium hover:bg-slate-700"
              >
                {t("admin.plans.cancel")}
              </button>
              <button
                type="submit"
                disabled={saving}
              >
                {saving ? "저장 중..." : "등록하기"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
