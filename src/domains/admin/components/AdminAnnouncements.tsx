import { Megaphone, Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { useState, useEffect, useCallback } from "react";

import { adminFetch, formatDate } from "./admin-client";

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
      setError(err instanceof Error ? err.message : "공지 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

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
      alert(err instanceof Error ? err.message : "등록에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id: string) => {
    try {
      await adminFetch(`/announcements/${id}/toggle`, userId, { method: "POST" });
      void loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "상태 변경 실패");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("이 공지사항을 삭제하시겠습니까?")) return;
    try {
      await adminFetch(`/announcements/${id}`, userId, { method: "DELETE" });
      void loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "삭제 실패");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-6 rounded-2xl backdrop-blur-xl">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-indigo-400" />
            전역 공지사항 & 배너 관리
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            상단 긴급 안내 배너, 팝업 모달 및 커뮤니티 전역 공지를 실시간으로 배치하고 관리합니다.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl text-sm transition-all flex items-center gap-2 self-start sm:self-auto shadow-lg shadow-indigo-600/20"
        >
          <Plus className="w-4 h-4" />
          새 공지/배너 작성
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-slate-400">공지 목록 로딩 중...</div>
      ) : items.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/30 border border-slate-800 rounded-2xl text-slate-400">
          등록된 공지사항이나 배너가 없습니다.
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
                      className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase ${
                        item.level === "critical"
                          ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                          : item.level === "warning"
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                      }`}
                    >
                      {item.level}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-300">
                      {item.placement === "top_banner"
                        ? "상단 배너"
                        : item.placement === "popup_modal"
                        ? "팝업 모달"
                        : "커뮤니티 상단"}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-950 text-indigo-300 border border-indigo-800/40">
                      대상: {item.targetRole === "all" ? "전체 회원" : item.targetRole}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-white pt-1">{item.title}</h3>
                  {item.content && <p className="text-sm text-slate-300 whitespace-pre-wrap">{item.content}</p>}
                  <p className="text-xs text-slate-500 pt-1">생성일: {formatDate(item.createdAt)}</p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => void handleToggle(item.id)}
                    title={item.isActive ? "비활성화" : "활성화"}
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    {item.isActive ? (
                      <ToggleRight className="w-8 h-8 text-emerald-400" />
                    ) : (
                      <ToggleLeft className="w-8 h-8 text-slate-600" />
                    )}
                  </button>
                  <button
                    onClick={() => void handleDelete(item.id)}
                    className="p-2 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                    title="삭제"
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <form
            onSubmit={(e) => void handleCreate(e)}
            className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-lg space-y-4 shadow-2xl"
          >
            <h3 className="text-lg font-bold text-white">새 공지 / 배너 생성</h3>
            <div>
              <label htmlFor="announcement-title" className="text-xs font-medium text-slate-400 block mb-1">제목</label>
              <input
                id="announcement-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="공지사항 제목을 입력하세요"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="announcement-content" className="text-xs font-medium text-slate-400 block mb-1">내용 (선택)</label>
              <textarea
                id="announcement-content"
                rows={3}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="상세 내용을 입력하세요..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="announcement-level" className="text-xs font-medium text-slate-400 block mb-1">중요도 레벨</label>
                <select
                  id="announcement-level"
                  value={level}
                  onChange={(e) => setLevel(e.target.value as never)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="info">일반 (Info)</option>
                  <option value="warning">주의 (Warning)</option>
                  <option value="critical">긴급 (Critical)</option>
                </select>
              </div>
              <div>
                <label htmlFor="announcement-placement" className="text-xs font-medium text-slate-400 block mb-1">노출 위치</label>
                <select
                  id="announcement-placement"
                  value={placement}
                  onChange={(e) => setPlacement(e.target.value as never)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="top_banner">상단 긴급 배너</option>
                  <option value="popup_modal">팝업 모달</option>
                  <option value="community_top">커뮤니티 상단 고정</option>
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="announcement-target-role" className="text-xs font-medium text-slate-400 block mb-1">대상 타겟</label>
              <select
                id="announcement-target-role"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="all">전체 회원</option>
                <option value="creator">크리에이터 전용</option>
                <option value="user">일반 독자 전용</option>
              </select>
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
                disabled={saving}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium shadow-lg shadow-indigo-600/20"
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
