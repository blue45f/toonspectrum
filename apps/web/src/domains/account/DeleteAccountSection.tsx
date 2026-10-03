import { Trash2 } from "lucide-react";
import { useState } from "react";

import { signOut } from "@/domains/auth/public/session/auth-session-store";
import { deleteMyAccount } from "@/platform/me-client";
import { useT } from "@/shared/lib/i18n";

import { DeleteAccountDialog } from "./AccountPage";

/**
 * 계정 탈퇴 섹션 — 위험·저빈도 작업이라 일상적인 프로필 편집(/me)과 분리해
 * 설정의 계정 탭에서만 제공한다. 게스트(userId 없음)에게는 그리지 않는다.
 */
export function DeleteAccountSection({ userId }: { userId: string | null }) {
  const t = useT();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!userId) return null;

  const onDeleteAccount = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteMyAccount();
      const logout = await signOut();
      if (!logout.ok) throw new Error(logout.error);
      globalThis.location.assign("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("account.profile.errorDelete"));
      setDeleting(false);
    }
  };

  return (
    <>
      <section className="rounded-2xl border border-bad/30 bg-bad/5 p-5">
        <h2 className="text-sm font-semibold text-fg">{t("account.profile.deleteTitle")}</h2>
        <p className="mt-1.5 text-[0.78rem] leading-relaxed text-fg-3">
          {t("account.profile.deleteDesc")}
        </p>
        {error && (
          <p className="mt-3 rounded-xl border border-bad/40 bg-bad/10 px-3.5 py-2.5 text-sm text-bad" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          disabled={deleting}
          className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-bad/45 px-3 py-2 text-xs font-semibold text-bad transition-colors hover:bg-bad/10 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Trash2 size={14} />
          {t("account.profile.deleteTitle")}
        </button>
      </section>

      <DeleteAccountDialog
        open={deleteOpen}
        deleting={deleting}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => {
          void onDeleteAccount();
        }}
      />
    </>
  );
}
