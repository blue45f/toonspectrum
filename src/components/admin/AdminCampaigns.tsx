import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import {
  adminFetch,
  centsToWon,
  formatNum,
  formatWon,
  wonToCents,
  type AdminApiError,
  type Campaign,
} from "./admin-client";
import { AdminNotice, AdminSpinner, Field, adminButtonClass, adminInputClass } from "./admin-ui";

interface Draft {
  id?: string;
  creatorId: string;
  titleId: string;
  planId: string;
  title: string;
  description: string;
  targetWon: string;
  raisedWon: string;
  isActive: boolean;
  startsAt: string;
  endsAt: string;
}

const emptyDraft: Draft = {
  creatorId: "",
  titleId: "",
  planId: "",
  title: "",
  description: "",
  targetWon: "",
  raisedWon: "0",
  isActive: true,
  startsAt: "",
  endsAt: "",
};

const dateInput = (value: string | null) => (value ? new Date(value).toISOString().slice(0, 10) : "");

function toDraft(c: Campaign): Draft {
  return {
    id: c.id,
    creatorId: c.creatorId,
    titleId: c.titleId ?? "",
    planId: c.planId ?? "",
    title: c.title,
    description: c.description ?? "",
    targetWon: String(centsToWon(c.targetAmountCents)),
    raisedWon: String(centsToWon(c.raisedAmountCents)),
    isActive: c.isActive,
    startsAt: dateInput(c.startsAt),
    endsAt: dateInput(c.endsAt),
  };
}

export function AdminCampaigns({ uid }: { uid: string }) {
  const [items, setItems] = useState<Campaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    adminFetch<{ items: Campaign[] }>("/campaigns", uid)
      .then((d) => setItems(d.items))
      .catch((e: AdminApiError) => setError(e.message));
  }, [uid]);

  useEffect(() => {
    setItems(null);
    load();
  }, [load]);

  const submit = async () => {
    if (!draft) return;
    if (!draft.creatorId.trim() || !draft.title.trim()) {
      setFormError("크리에이터 ID와 제목은 필수예요.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await adminFetch("/campaigns", uid, {
        method: "POST",
        body: JSON.stringify({
          id: draft.id,
          creatorId: draft.creatorId.trim(),
          titleId: draft.titleId.trim() || null,
          planId: draft.planId.trim() || null,
          title: draft.title.trim(),
          description: draft.description.trim(),
          targetAmountCents: wonToCents(Number(draft.targetWon)),
          raisedAmountCents: wonToCents(Number(draft.raisedWon)),
          isActive: draft.isActive,
          startsAt: draft.startsAt || null,
          endsAt: draft.endsAt || null,
        }),
      });
      setDraft(null);
      load();
    } catch (e) {
      setFormError((e as AdminApiError).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c: Campaign) => {
    if (!window.confirm(`캠페인 “${c.title}”을(를) 삭제할까요?`)) return;
    try {
      await adminFetch(`/campaigns/${encodeURIComponent(c.id)}`, uid, { method: "DELETE" });
      load();
    } catch (e) {
      setError((e as AdminApiError).message);
    }
  };

  if (error) return <AdminNotice title="캠페인을 불러오지 못했어요" body={error} />;
  if (!items) return <AdminSpinner />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-fg-3">
          크리에이터 캠페인 <span className="numeral text-fg">{formatNum(items.length)}</span>개
        </p>
        {!draft && (
          <button className={adminButtonClass("accent")} onClick={() => setDraft({ ...emptyDraft })}>
            <Plus size={15} /> 새 캠페인
          </button>
        )}
      </div>

      {draft && (
        <form
          className="grid grid-cols-1 gap-3 rounded-2xl border border-line-strong bg-panel p-5 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="flex items-center justify-between sm:col-span-2">
            <h3 className="text-sm font-semibold text-fg">{draft.id ? "캠페인 수정" : "새 캠페인"}</h3>
            <button type="button" aria-label="닫기" className="text-fg-3 hover:text-fg" onClick={() => setDraft(null)}>
              <X size={16} />
            </button>
          </div>
          <Field label="제목 *" full>
            <input className={adminInputClass} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </Field>
          <Field label="크리에이터 ID *">
            <input className={adminInputClass} value={draft.creatorId} onChange={(e) => setDraft({ ...draft, creatorId: e.target.value })} />
          </Field>
          <Field label="플랜 ID (선택)">
            <input className={adminInputClass} value={draft.planId} onChange={(e) => setDraft({ ...draft, planId: e.target.value })} />
          </Field>
          <Field label="작품 ID (선택)">
            <input className={adminInputClass} value={draft.titleId} onChange={(e) => setDraft({ ...draft, titleId: e.target.value })} placeholder="nw-..." />
          </Field>
          <Field label="설명" full>
            <input className={adminInputClass} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </Field>
          <Field label="목표 금액(원)">
            <input type="number" min={0} className={adminInputClass} value={draft.targetWon} onChange={(e) => setDraft({ ...draft, targetWon: e.target.value })} />
          </Field>
          <Field label="모금 금액(원)">
            <input type="number" min={0} className={adminInputClass} value={draft.raisedWon} onChange={(e) => setDraft({ ...draft, raisedWon: e.target.value })} />
          </Field>
          <Field label="시작일">
            <input type="date" className={adminInputClass} value={draft.startsAt} onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })} />
          </Field>
          <Field label="종료일">
            <input type="date" className={adminInputClass} value={draft.endsAt} onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-fg-2">
            <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />
            활성화
          </label>
          <div className="flex items-center justify-end gap-2 sm:col-span-2">
            {formError && <span className="mr-auto text-xs text-bad">{formError}</span>}
            <button type="button" className={adminButtonClass("ghost")} onClick={() => setDraft(null)}>
              취소
            </button>
            <button type="submit" className={adminButtonClass("accent")} disabled={saving}>
              {saving ? "저장 중…" : "저장"}
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-col gap-3">
        {items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line bg-card/40 px-5 py-10 text-center text-sm text-fg-3">
            등록된 캠페인이 없어요. “새 캠페인”으로 추가하세요.
          </div>
        )}
        {items.map((c) => {
          const pct = c.targetAmountCents > 0 ? Math.min(100, Math.round((c.raisedAmountCents / c.targetAmountCents) * 100)) : 0;
          return (
            <article key={c.id} className="rounded-2xl border border-line bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-semibold text-fg">{c.title}</h3>
                    <span className={c.isActive ? "text-xs text-good" : "text-xs text-fg-3"}>{c.isActive ? "활성" : "비활성"}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-fg-3">
                    {c.creatorName ?? c.creatorId}
                    {c.planCode ? ` · ${c.planCode}` : ""}
                    {c.titleId ? ` · ${c.titleId}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button className={adminButtonClass("ghost")} onClick={() => setDraft(toDraft(c))}>
                    <Pencil size={13} /> 수정
                  </button>
                  <button className={adminButtonClass("danger")} onClick={() => void remove(c)} aria-label="삭제">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              {c.description && <p className="mt-2 line-clamp-2 text-sm text-fg-2">{c.description}</p>}
              <div className="mt-3 flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                </div>
                <span className="numeral shrink-0 text-xs text-fg-2">
                  {formatWon(c.raisedAmountCents)} / {formatWon(c.targetAmountCents)} ({pct}%)
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
