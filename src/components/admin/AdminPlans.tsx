import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, X } from "lucide-react";
import {
  adminFetch,
  centsToWon,
  formatNum,
  formatWon,
  wonToCents,
  type AdminApiError,
  type Plan,
} from "./admin-client";
import { AdminNotice, AdminSpinner, Field, adminButtonClass, adminInputClass } from "./admin-ui";

interface Draft {
  id?: string;
  code: string;
  name: string;
  description: string;
  intervalDays: string;
  priceWon: string;
  perks: string;
  isActive: boolean;
}

const emptyDraft: Draft = {
  code: "",
  name: "",
  description: "",
  intervalDays: "30",
  priceWon: "",
  perks: "",
  isActive: true,
};

function toDraft(plan: Plan): Draft {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description ?? "",
    intervalDays: String(plan.intervalDays ?? 30),
    priceWon: String(centsToWon(plan.priceCents)),
    perks: (plan.perks ?? []).join(", "),
    isActive: plan.isActive,
  };
}

export function AdminPlans({ uid }: { uid: string }) {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    adminFetch<{ items: Plan[] }>("/plans", uid)
      .then((d) => setPlans(d.items))
      .catch((e: AdminApiError) => setError(e.message));
  }, [uid]);

  useEffect(() => {
    setPlans(null);
    load();
  }, [load]);

  const submit = async () => {
    if (!draft) return;
    if (!draft.code.trim() || !draft.name.trim()) {
      setFormError("코드와 이름은 필수예요.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await adminFetch("/plans", uid, {
        method: "POST",
        body: JSON.stringify({
          id: draft.id,
          code: draft.code.trim(),
          name: draft.name.trim(),
          description: draft.description.trim(),
          intervalDays: Number(draft.intervalDays) || 30,
          currency: "KRW",
          priceCents: wonToCents(Number(draft.priceWon)),
          perks: draft.perks.split(",").map((p) => p.trim()).filter(Boolean),
          isActive: draft.isActive,
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

  if (error) return <AdminNotice title="플랜을 불러오지 못했어요" body={error} />;
  if (!plans) return <AdminSpinner />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-fg-3">
          구독 플랜 <span className="numeral text-fg">{formatNum(plans.length)}</span>개
        </p>
        {!draft && (
          <button className={adminButtonClass("accent")} onClick={() => setDraft({ ...emptyDraft })}>
            <Plus size={15} /> 새 플랜
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
            <h3 className="text-sm font-semibold text-fg">{draft.id ? "플랜 수정" : "새 플랜"}</h3>
            <button type="button" aria-label="닫기" className="text-fg-3 hover:text-fg" onClick={() => setDraft(null)}>
              <X size={16} />
            </button>
          </div>
          <Field label="코드 *">
            <input className={adminInputClass} value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
          </Field>
          <Field label="이름 *">
            <input className={adminInputClass} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </Field>
          <Field label="설명" full>
            <input className={adminInputClass} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </Field>
          <Field label="결제 주기(일)">
            <input type="number" min={1} className={adminInputClass} value={draft.intervalDays} onChange={(e) => setDraft({ ...draft, intervalDays: e.target.value })} />
          </Field>
          <Field label="가격(원)">
            <input type="number" min={0} className={adminInputClass} value={draft.priceWon} onChange={(e) => setDraft({ ...draft, priceWon: e.target.value })} />
          </Field>
          <Field label="혜택(쉼표로 구분)" full>
            <input className={adminInputClass} value={draft.perks} onChange={(e) => setDraft({ ...draft, perks: e.target.value })} placeholder="광고 제거, 조기 열람, 전용 뱃지" />
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

      <div className="overflow-hidden rounded-2xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-raised/50 text-left text-xs text-fg-3">
            <tr>
              <th className="px-4 py-2.5 font-medium">플랜</th>
              <th className="px-4 py-2.5 font-medium">가격 / 주기</th>
              <th className="px-4 py-2.5 font-medium">혜택</th>
              <th className="px-4 py-2.5 font-medium">상태</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {plans.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-fg-3">
                  등록된 플랜이 없어요. “새 플랜”으로 추가하세요.
                </td>
              </tr>
            )}
            {plans.map((plan) => (
              <tr key={plan.id} className="border-t border-line">
                <td className="px-4 py-3">
                  <div className="font-medium text-fg">{plan.name}</div>
                  <div className="text-xs text-fg-3">{plan.code}</div>
                </td>
                <td className="px-4 py-3 text-fg-2">
                  <span className="numeral">{formatWon(plan.priceCents)}</span>
                  <span className="text-fg-3"> / {formatNum(plan.intervalDays)}일</span>
                </td>
                <td className="px-4 py-3 text-fg-3">{(plan.perks ?? []).length}개</td>
                <td className="px-4 py-3">
                  <span className={plan.isActive ? "text-good" : "text-fg-3"}>{plan.isActive ? "활성" : "비활성"}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button className={adminButtonClass("ghost")} onClick={() => setDraft(toDraft(plan))}>
                    <Pencil size={13} /> 수정
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
