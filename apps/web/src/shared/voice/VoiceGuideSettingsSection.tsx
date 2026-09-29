import { Volume2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Switch } from "@/shared/components/ui/switch";
import { useI18n } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import {
  VOICE_GUIDE_MAX_RATE,
  VOICE_GUIDE_MIN_RATE,
  isVoiceGuideSupported,
  readVoiceGuidePreferences,
  voiceGuideEngine,
  writeVoiceGuideAutoGuide,
  writeVoiceGuideEnabled,
  writeVoiceGuideRate,
} from "./voice-guide";
import { wireVoiceBgmDucking } from "./voice-bgm-ducking";

/**
 * 설정 페이지용 음성 안내 섹션.
 * - 음성 안내 on/off (마스터)
 * - 페이지 진입 시 자동 안내 on/off (기본 off)
 * - 읽기 속도 조절 + 미리 듣기
 */
export function VoiceGuideSettingsSection() {
  const lang = useI18n((state) => state.lang);
  const ko = lang.startsWith("ko");
  const [prefs, setPrefs] = useState(readVoiceGuidePreferences);
  const supported = isVoiceGuideSupported();

  // 미리 듣기 중에도 BGM 볼륨을 자동으로 낮춘다.
  useEffect(() => {
    wireVoiceBgmDucking();
  }, []);

  if (!supported) {
    return (
      <section
        className="rounded-2xl border border-line bg-panel/40 p-5"
        aria-label={ko ? "음성 안내" : "Voice guide"}
      >
        <h2 className="text-base font-semibold">{ko ? "음성 안내" : "Voice guide"}</h2>
        <p className="mt-2 text-sm text-fg-3">
          {ko
            ? "이 브라우저는 음성 안내를 지원하지 않습니다."
            : "This browser does not support voice guidance."}
        </p>
      </section>
    );
  }

  const preview = () => {
    voiceGuideEngine.speak(
      ko ? "음성 안내 미리 듣기입니다. 이 속도로 안내해 드립니다." : "This is a voice guide preview at the current speed.",
      { lang: ko ? "ko-KR" : "en-US", rate: prefs.rate },
    );
  };

  return (
    <section
      className="rounded-2xl border border-line bg-panel/40 px-5"
      aria-label={ko ? "음성 안내 설정" : "Voice guide settings"}
    >
      <div className="flex items-center gap-3 border-b border-line py-4">
        <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent" aria-hidden="true">
          <Volume2 className="size-5" />
        </span>
        <div>
          <h2 className="text-base font-semibold">{ko ? "음성 안내" : "Voice guide"}</h2>
          <p className="text-xs text-fg-3">
            {ko ? "페이지 핵심 내용을 음성으로 안내합니다." : "Hear spoken overviews of each page."}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 py-4">
        <div>
          <p className="text-sm font-semibold text-fg">{ko ? "음성 안내 사용" : "Enable voice guide"}</p>
          <p className="mt-0.5 text-xs text-fg-3">
            {ko ? "안내 듣기 버튼으로 음성 안내를 재생합니다." : "Play voice guides with the listen button."}
          </p>
        </div>
        <Switch
          checked={prefs.enabled}
          aria-label={ko ? "음성 안내 사용" : "Enable voice guide"}
          onCheckedChange={(next) => {
            writeVoiceGuideEnabled(next);
            if (!next) voiceGuideEngine.stop();
            setPrefs(readVoiceGuidePreferences());
          }}
        />
      </div>

      <div className={cn("flex items-center justify-between gap-4 border-t border-line py-4", !prefs.enabled && "opacity-50")}>
        <div>
          <p className="text-sm font-semibold text-fg">{ko ? "페이지 진입 시 자동 안내" : "Auto-play on page entry"}</p>
          <p className="mt-0.5 text-xs text-fg-3">
            {ko ? "페이지를 열면 안내를 자동으로 재생합니다." : "Automatically play the guide when a page opens."}
          </p>
        </div>
        <Switch
          checked={prefs.autoGuide}
          disabled={!prefs.enabled}
          aria-label={ko ? "페이지 진입 시 자동 안내" : "Auto-play on page entry"}
          onCheckedChange={(next) => {
            writeVoiceGuideAutoGuide(next);
            setPrefs(readVoiceGuidePreferences());
          }}
        />
      </div>

      <div className={cn("border-t border-line py-4", !prefs.enabled && "opacity-50")}>
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="voice-guide-rate" className="text-sm font-semibold text-fg">
            {ko ? "읽기 속도" : "Speech rate"}
          </label>
          <span className="text-xs tabular-nums text-fg-3" aria-live="polite">
            {prefs.rate.toFixed(2)}×
          </span>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <input
            id="voice-guide-rate"
            type="range"
            min={VOICE_GUIDE_MIN_RATE}
            max={VOICE_GUIDE_MAX_RATE}
            step={0.05}
            value={prefs.rate}
            disabled={!prefs.enabled}
            onChange={(event) => {
              writeVoiceGuideRate(Number(event.target.value));
              setPrefs(readVoiceGuidePreferences());
            }}
            className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-line accent-[var(--color-accent)]"
          />
          <button
            type="button"
            onClick={preview}
            disabled={!prefs.enabled}
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-semibold text-fg-2 transition-colors hover:text-fg disabled:opacity-50"
          >
            <Volume2 className="size-4" aria-hidden="true" />
            {ko ? "미리 듣기" : "Preview"}
          </button>
        </div>
      </div>
    </section>
  );
}
