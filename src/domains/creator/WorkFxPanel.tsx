/**
 * WorkFxPanel — 작성자 전용 "효과툰" 설정 패널. 작품에 배경음악·스크롤 모션·분위기
 * 오버레이를 붙인다. 설정은 작품 doc의 `fx` 키에 저장되므로 백엔드 스키마 변경이 없다.
 * StudioPage는 건드리지 않고, 상세 페이지에서 추가 게시 설정으로 동작한다.
 */
import { Music4, Settings2 } from "lucide-react";
import { useState } from "react";

import { BGM_MOODS } from "./studio-bgm";
import {
  AMBIENT_PRESETS,
  REVEAL_PRESETS,
  readWorkFx,
  type WorkFxSettings,
} from "./studio-motion-fx";

import { buttonClass } from "@/components/ui/button-utils";
import { updateWork, type WorkDetail } from "@/src/infrastructure/creator-client";

export function WorkFxPanel({
  work,
  onUpdated,
}: {
  work: WorkDetail;
  onUpdated: (doc: Record<string, unknown>) => void;
}) {
  const initial = readWorkFx(work.doc);
  const [open, setOpen] = useState(false);
  const [fx, setFx] = useState<WorkFxSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState(false);

  const patch = (p: Partial<WorkFxSettings>) => setFx((prev) => ({ ...prev, ...p }));

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    setSavedMsg(false);
    const nextDoc = { ...work.doc, fx };
    try {
      await updateWork(work.id, { doc: nextDoc });
      onUpdated(nextDoc);
      setSavedMsg(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "효과 설정을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const summary = [
    fx.bgmMood || fx.bgmUrl ? "BGM" : null,
    fx.reveal !== "none" ? "모션" : null,
    fx.ambient !== "none" ? "분위기" : null,
  ].filter(Boolean);

  return (
    <div className="mt-4 rounded-xl border border-line bg-card/50">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium text-fg-2 transition-colors hover:text-fg"
      >
        <Music4 size={13} className="text-accent" />
        효과툰 설정 (배경음악·모션·분위기)
        <span className="ml-auto text-[0.7rem] text-fg-3">{summary.length ? summary.join(" · ") : "효과 없음"}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-line px-3.5 py-3">
          <p className="rounded-lg border border-line bg-panel/40 px-2.5 py-2 text-[0.7rem] leading-relaxed text-fg-3">
            <Settings2 size={11} className="mr-1 inline text-accent" />
            정적인 만화에 동적인 느낌을 더해요. 독자가 스크롤하면 컷이 등장하고, 화면 위로 분위기 효과가
            흐르며, 배경음악을 켤 수 있어요. (배경음악은 독자가 재생 버튼을 눌러야 들려요.)
          </p>

          <label className="flex flex-col gap-1 text-xs text-fg-2">
            배경음악
            <select
              value={fx.bgmMood}
              onChange={(e) => patch({ bgmMood: e.target.value })}
              className="h-9 rounded-lg border border-line bg-canvas px-2 text-sm text-fg outline-none focus:border-accent/50"
            >
              <option value="">사용 안 함</option>
              {BGM_MOODS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — {m.description}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-2">
            또는 내 오디오 URL (있으면 우선)
            <input
              type="url"
              value={fx.bgmUrl}
              onChange={(e) => patch({ bgmUrl: e.target.value.trim() })}
              placeholder="https://… .mp3 / .ogg"
              className="h-9 rounded-lg border border-line bg-canvas px-2 text-sm text-fg outline-none focus:border-accent/50"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-fg-2">
            스크롤 등장 효과
            <select
              value={fx.reveal}
              onChange={(e) => patch({ reveal: e.target.value })}
              className="h-9 rounded-lg border border-line bg-canvas px-2 text-sm text-fg outline-none focus:border-accent/50"
            >
              {REVEAL_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} — {p.description}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-2">
            분위기 오버레이
            <select
              value={fx.ambient}
              onChange={(e) => patch({ ambient: e.target.value })}
              className="h-9 rounded-lg border border-line bg-canvas px-2 text-sm text-fg outline-none focus:border-accent/50"
            >
              {AMBIENT_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} — {p.description}
                </option>
              ))}
            </select>
          </label>

          {(fx.bgmMood || fx.bgmUrl) && (
            <label className="flex items-center gap-2 text-xs text-fg-2">
              기본 음량
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={fx.bgmVolume}
                onChange={(e) => patch({ bgmVolume: Number(e.target.value) })}
                className="h-1 flex-1 cursor-pointer accent-[var(--color-accent)]"
              />
              <span className="numeral w-9 text-right text-fg-3">{Math.round(fx.bgmVolume * 100)}%</span>
            </label>
          )}

          {error && <p className="text-xs text-bad">{error}</p>}
          {savedMsg && !error && <p className="text-xs text-good">효과 설정을 저장했어요.</p>}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className={buttonClass({ size: "sm", variant: "solid" })}
            >
              효과 설정 저장
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
