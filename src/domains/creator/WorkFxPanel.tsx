/**
 * WorkFxPanel — 작성자 전용 "효과툰" 설정 패널. 작품에 배경음악·스크롤 모션·분위기
 * 오버레이, 그리고 컷별 SE 스팅어·BGM 무드 전환(코미포식)을 붙인다. 설정은 작품 doc의
 * `fx` 키에 저장되므로 백엔드 스키마 변경이 없다.
 * StudioPage는 건드리지 않고, 상세 페이지에서 추가 게시 설정으로 동작한다.
 */
import { Music4, Settings2 } from "lucide-react";
import { useState } from "react";

import { BGM_MOODS } from "./studio-bgm";
import {
  AMBIENT_PRESETS,
  CUT_BGM_SILENCE,
  EMPHASIS_PRESETS,
  REVEAL_PRESETS,
  SFX_STINGER_PRESETS,
  readWorkFx,
  type WorkCutFx,
  type WorkFxSettings,
} from "./studio-motion-fx";

import { buttonClass } from "@/components/ui/button-utils";
import { updateWork, type WorkDetail } from "@/src/infrastructure/creator-client";

// 컷별 효과 셀렉트 공통 클래스 — 4개(등장·강조·효과음·BGM 전환)가 같은 룩을 공유한다.
const CUT_SELECT_CLASS =
  "h-8 min-w-0 rounded-md border border-line bg-canvas px-1.5 text-[0.72rem] text-fg outline-none focus:border-accent/50";

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

  const cutCount = work.pages.length;
  const cutAt = (index: number): WorkCutFx => fx.cuts[index] ?? { reveal: "", emphasis: "none" };
  // 컷별 효과 갱신 — cuts 배열을 페이지 수만큼 채워두고 해당 인덱스만 바꾼다.
  const patchCut = (index: number, p: Partial<WorkCutFx>) =>
    setFx((prev) => {
      const cuts: WorkCutFx[] = Array.from({ length: cutCount }, (_, i) => prev.cuts[i] ?? { reveal: "", emphasis: "none" });
      cuts[index] = { ...cuts[index], ...p };
      return { ...prev, cuts };
    });

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

  const cutFxCount = fx.cuts.filter(
    (c) => (c.reveal && c.reveal !== "none") || c.emphasis !== "none" || c.sfx != null || c.bgmShift != null
  ).length;
  const summary = [
    fx.bgmMood || fx.bgmUrl ? "BGM" : null,
    fx.reveal !== "none" ? "모션" : null,
    fx.ambient !== "none" ? "분위기" : null,
    cutFxCount > 0 ? `컷효과 ${cutFxCount}` : null,
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
        효과툰 설정 (배경음악·모션·분위기·컷 효과음)
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

          {cutCount > 0 && (
            <div className="rounded-lg border border-line bg-panel/40 px-2.5 py-2">
              <p className="mb-1.5 text-[0.72rem] font-semibold text-fg-2">컷별 효과 (선택)</p>
              <p className="mb-2 text-[0.72rem] leading-snug text-fg-3">
                특정 컷만 다르게 연출해요. 등장은 비워두면 작품 기본을 따르고, 강조·효과음은 그 컷이
                보일 때 한 번 재생돼요. BGM 전환은 그 컷부터 배경음악 분위기를 바꿔요(자동 생성 무드
                BGM 전용 — 내 오디오 URL을 쓰면 적용되지 않아요). 컷 효과음·BGM 전환은 독자 감상
                화면에서 들리고, 모션툰 영상(WebM) 내보내기에는 아직 담기지 않아요.
              </p>
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {Array.from({ length: cutCount }, (_, i) => {
                  const c = cutAt(i);
                  return (
                    <div key={i} className="flex items-start gap-1.5">
                      <span className="numeral w-9 shrink-0 pt-1.5 text-[0.72rem] text-fg-3">{i + 1}컷</span>
                      <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5">
                        <select
                          value={c.reveal}
                          onChange={(e) => patchCut(i, { reveal: e.target.value })}
                          className={CUT_SELECT_CLASS}
                          aria-label={`${i + 1}컷 등장 효과`}
                        >
                          <option value="">등장: 기본</option>
                          {REVEAL_PRESETS.filter((p) => p.id !== "none").map((p) => (
                            <option key={p.id} value={p.id}>
                              등장: {p.label}
                            </option>
                          ))}
                        </select>
                        <select
                          value={c.emphasis}
                          onChange={(e) => patchCut(i, { emphasis: e.target.value })}
                          className={CUT_SELECT_CLASS}
                          aria-label={`${i + 1}컷 강조 효과`}
                        >
                          {EMPHASIS_PRESETS.map((p) => (
                            <option key={p.id} value={p.id}>
                              강조: {p.label}
                            </option>
                          ))}
                        </select>
                        <select
                          value={c.sfx?.preset ?? ""}
                          onChange={(e) =>
                            patchCut(i, { sfx: e.target.value ? { preset: e.target.value } : undefined })
                          }
                          className={CUT_SELECT_CLASS}
                          aria-label={`${i + 1}컷 효과음`}
                        >
                          <option value="">효과음: 없음</option>
                          {SFX_STINGER_PRESETS.map((p) => (
                            <option key={p.id} value={p.id}>
                              효과음: {p.label}
                            </option>
                          ))}
                        </select>
                        <select
                          value={c.bgmShift?.mood ?? ""}
                          onChange={(e) =>
                            patchCut(i, { bgmShift: e.target.value ? { mood: e.target.value } : undefined })
                          }
                          className={CUT_SELECT_CLASS}
                          aria-label={`${i + 1}컷 BGM 전환`}
                        >
                          <option value="">BGM 전환: 없음</option>
                          <option value={CUT_BGM_SILENCE}>BGM 전환: 음악 멈춤</option>
                          {BGM_MOODS.map((m) => (
                            <option key={m.id} value={m.id}>
                              BGM 전환: {m.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
          {savedMsg && !error && (
            <p className="text-xs text-good">
              효과 설정을 저장했어요. 저장한 연출은 아래 모션툰 영상 내보내기 패널에서 영상(WebM)
              한 편으로 만들 수 있어요.
            </p>
          )}
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
