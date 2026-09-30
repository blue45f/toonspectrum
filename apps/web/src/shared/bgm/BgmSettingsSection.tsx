import { Music } from "lucide-react";
import { useState } from "react";

import { Switch } from "@/shared/components/ui/switch";
import { useI18n } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import {
  BGM_LABELS_KO,
  getBgmLabels,
  type BgmLabels,
} from "./bgm-labels";
import {
  BGM_MAX_VOLUME,
  BGM_MIN_VOLUME,
  BGM_MOODS,
  bgmEngine,
  isBgmSupported,
  readBgmPreferences,
  writeBgmEnabled,
  writeBgmVolume,
  type BgmMood,
} from "./bgm-engine";

/**
 * 설정 페이지용 배경음악(BGM) 섹션.
 * - 배경음악 on/off (마스터, localStorage 저장)
 * - 음량 조절 + 미리 듣기/끄기
 * - 페이지 분위기별 무드 설명
 *
 * 주의: 브라우저 자동재생 정책상 "미리 듣기"는 반드시 클릭 제스처에서 시작한다.
 */
export function BgmSettingsSection() {
  const lang = useI18n((state) => state.lang);
  const ko = lang.startsWith("ko");
  const labels = getBgmLabels(lang);
  const [prefs, setPrefs] = useState(readBgmPreferences);
  const [previewing, setPreviewing] = useState(false);
  const supported = isBgmSupported();

  if (!supported) {
    return (
      <section
        className="rounded-2xl border border-line bg-panel/40 p-5"
        aria-label={ko ? "배경음악" : "Background music"}
      >
        <h2 className="text-base font-semibold">{ko ? "배경음악" : "Background music"}</h2>
        <p className="mt-2 text-sm text-fg-3">
          {ko
            ? "이 브라우저는 배경음악을 지원하지 않습니다."
            : "This browser does not support background music."}
        </p>
      </section>
    );
  }

  const preview = () => {
    if (previewing) {
      bgmEngine.stop();
      setPreviewing(false);
      return;
    }
    // 클릭 제스처 안에서 시작 → 자동재생 정책 준수.
    if (bgmEngine.start("home")) {
      bgmEngine.setVolume(prefs.volume);
      setPreviewing(true);
    }
  };

  return (
    <section
      className="rounded-2xl border border-line bg-panel/40 px-5"
      aria-label={ko ? "배경음악 설정" : "Background music settings"}
    >
      <div className="flex items-center gap-3 border-b border-line py-4">
        <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent" aria-hidden="true">
          <Music className="size-5" />
        </span>
        <div>
          <h2 className="text-base font-semibold">{ko ? "배경음악" : "Background music"}</h2>
          <p className="text-xs text-fg-3">
            {ko ? "페이지 분위기에 맞는 음악이 흘러나옵니다." : "Music matching each page's mood plays."}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 py-4">
        <div>
          <p className="text-sm font-semibold text-fg">{ko ? "배경음악 사용" : "Enable background music"}</p>
          <p className="mt-0.5 text-xs text-fg-3">
            {ko
              ? "켜면 화면 우하단의 🎵 버튼으로 음악을 시작할 수 있습니다."
              : "When on, start music with the 🎵 button at the bottom-right."}
          </p>
        </div>
        <Switch
          checked={prefs.enabled}
          aria-label={ko ? "배경음악 사용" : "Enable background music"}
          onCheckedChange={(next) => {
            writeBgmEnabled(next);
            if (!next) {
              bgmEngine.stop();
              setPreviewing(false);
            }
            setPrefs(readBgmPreferences());
          }}
        />
      </div>

      <div className={cn("border-t border-line py-4", !prefs.enabled && "opacity-50")}>
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="bgm-volume" className="text-sm font-semibold text-fg">
            {labels.volume}
          </label>
          <span className="text-xs tabular-nums text-fg-3" aria-live="polite">
            {Math.round(prefs.volume * 100)}%
          </span>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <input
            id="bgm-volume"
            type="range"
            min={BGM_MIN_VOLUME}
            max={BGM_MAX_VOLUME}
            step={0.05}
            value={prefs.volume}
            disabled={!prefs.enabled}
            onChange={(event) => {
              writeBgmVolume(Number(event.target.value));
              setPrefs(readBgmPreferences());
            }}
            className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-line accent-[var(--color-accent)]"
          />
          <button
            type="button"
            onClick={preview}
            disabled={!prefs.enabled}
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-semibold text-fg-2 transition-colors hover:text-fg disabled:opacity-50"
          >
            <Music className="size-4" aria-hidden="true" />
            {previewing
              ? ko ? "끄기" : "Stop"
              : ko ? "미리 듣기" : "Preview"}
          </button>
        </div>
      </div>

      <div className={cn("border-t border-line py-4", !prefs.enabled && "opacity-50")} aria-label={ko ? "페이지 분위기별 음악" : "Music by page mood"}>
        <p className="text-sm font-semibold text-fg">{ko ? "페이지 분위기별 음악" : "Music by page mood"}</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {BGM_MOODS.map((mood: BgmMood) => (
            <li
              key={mood}
              className="flex items-center gap-2.5 rounded-xl border border-line/60 bg-card/40 px-3 py-2"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent" aria-hidden="true">
                <Music className="size-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-fg">{labels.moodName(mood)}</span>
                <span className="block truncate text-xs text-fg-3">{labels.moodDescription(mood)}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-fg-3">{labels.reducedMotionHint}</p>
      </div>
    </section>
  );
}

/** 테스트용 라벨 (i18n store 없이 사용). */
export { BGM_LABELS_KO };
export type { BgmLabels };
