import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { getApiErrorMessage } from "@/platform/api";
import {
  messagingClient,
  type MessagingBlockedUser,
  type MessagingPreferences,
} from "@/platform/messaging-client";
import { LoadingState } from "@/shared/components/LoadingState";
import { buttonClass } from "@/shared/components/ui/button-utils";

import { UserAvatar } from "./MessagingUserAvatar";

export function MessagingSettingsPanel({ onClose }: { onClose: () => void }) {
  const [preferences, setPreferences] = useState<MessagingPreferences | null>(null);
  const [blocks, setBlocks] = useState<MessagingBlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [preferenceResult, blockResult] = await Promise.all([
        messagingClient.getPreferences(),
        messagingClient.listBlocks(),
      ]);
      setPreferences(preferenceResult);
      setBlocks(blockResult.items);
    } catch (loadError) {
      setError(await getApiErrorMessage(loadError, "메시지 설정을 불러오지 못했어요."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function updatePreference(input: Partial<Omit<MessagingPreferences, "updatedAt">>) {
    if (!preferences || saving) return;
    const previous = preferences;
    setPreferences({ ...preferences, ...input });
    setSaving(true);
    setError(null);
    try {
      setPreferences(await messagingClient.updatePreferences(input));
    } catch (updateError) {
      setPreferences(previous);
      setError(await getApiErrorMessage(updateError, "메시지 설정을 저장하지 못했어요."));
    } finally {
      setSaving(false);
    }
  }

  async function unblock(userId: string) {
    try {
      await messagingClient.unblockUser(userId);
      setBlocks((current) => current.filter((item) => item.user.id !== userId));
    } catch (unblockError) {
      setError(await getApiErrorMessage(unblockError, "차단을 해제하지 못했어요."));
    }
  }

  return (
    <div className="absolute inset-0 z-20 overflow-y-auto bg-bg/95 p-5 backdrop-blur-sm sm:p-6">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="eyebrow text-accent">MESSAGE SETTINGS</p>
            <h2 className="mt-1 text-xl font-bold">메시지 설정</h2>
          </div>
          <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-xl hover:bg-raised" aria-label="설정 닫기">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="grid min-h-64 place-items-center p-2">
            <LoadingState variant="skeleton" label="메시지 설정을 불러오는 중" className="w-full" />
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            {error && <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
            {preferences && (
              <section className="rounded-2xl border border-line bg-card p-5">
                <h3 className="font-semibold">새 메시지 요청</h3>
                <p className="mt-1 text-xs leading-relaxed text-fg-2">처음 연락하는 회원 중 누구의 요청을 받을지 정합니다.</p>
                <select
                  aria-label="새 메시지 요청 수신 범위"
                  value={preferences.receiveFrom}
                  onChange={(event) => void updatePreference({ receiveFrom: event.target.value as MessagingPreferences["receiveFrom"] })}
                  disabled={saving}
                  className="mt-4 h-11 w-full rounded-xl border border-line bg-bg px-3 text-sm outline-none focus:border-accent"
                >
                  <option value="everyone">모든 인증 회원</option>
                  <option value="followers">나를 팔로우한 회원</option>
                  <option value="mutuals">서로 팔로우한 회원</option>
                  <option value="nobody">새 요청 받지 않기</option>
                </select>
                <label
                  htmlFor="message-read-receipt"
                  aria-label="읽음 표시 공유"
                  className="mt-4 flex items-center justify-between gap-4 border-t border-line pt-4"
                >
                  <span>
                    <span className="block text-sm font-medium">읽음 표시 공유</span>
                    <span className="mt-0.5 block text-xs text-fg-2">내가 메시지를 읽었는지 상대에게 보여 줍니다.</span>
                  </span>
                  <input
                    id="message-read-receipt"
                    type="checkbox"
                    checked={preferences.readReceipt}
                    onChange={(event) => void updatePreference({ readReceipt: event.target.checked })}
                    disabled={saving}
                    className="size-5 accent-accent"
                  />
                </label>
              </section>
            )}

            <section className="rounded-2xl border border-line bg-card p-5">
              <h3 className="font-semibold">차단한 회원</h3>
              <p className="mt-1 text-xs text-fg-2">차단한 회원과는 새 요청이나 메시지를 주고받을 수 없습니다.</p>
              {blocks.length === 0 ? (
                <p className="mt-4 rounded-xl bg-panel px-4 py-5 text-center text-sm text-fg-2">차단한 회원이 없습니다.</p>
              ) : (
                <ul className="mt-4 divide-y divide-line">
                  {blocks.map((item) => (
                    <li key={item.user.id} className="flex items-center gap-3 py-3">
                      <UserAvatar user={item.user} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.user.name}</span>
                      <button
                        type="button"
                        onClick={() => void unblock(item.user.id)}
                        className={buttonClass({ size: "sm", variant: "outline" })}
                      >
                        차단 해제
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
