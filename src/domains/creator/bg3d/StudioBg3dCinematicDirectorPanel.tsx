import { Camera, Clapperboard, Activity, BookmarkPlus, Play } from "lucide-react";
import React, { useState } from "react";

import {
  WEBTOON_SHOT_ANGLE_PRESETS,
  createShotBookmark,
  type WebtoonShotAngleKind,
  type CameraShakePreset,
  type CameraShakeConfig,
  type WebtoonShotBookmark,
} from "../scene-3d/studio-3d-camera-cinematic-director";

export interface StudioBg3dCinematicDirectorPanelProps {
  readonly onApplyShotBookmark?: (bookmark: WebtoonShotBookmark) => void;
  readonly onTriggerShake?: (config: CameraShakeConfig) => void;
}

let cinematicBookmarkCounter = 100;

export function StudioBg3dCinematicDirectorPanel({
  onApplyShotBookmark,
  onTriggerShake,
}: StudioBg3dCinematicDirectorPanelProps): React.JSX.Element {
  const [selectedAngle, setSelectedAngle] = useState<WebtoonShotAngleKind>("eye-level-dialogue");
  const [selectedShake, setSelectedShake] = useState<CameraShakePreset>("none");
  const [shakeIntensity, setShakeIntensity] = useState(1.0);
  const [bookmarks, setBookmarks] = useState<readonly WebtoonShotBookmark[]>([
    createShotBookmark("cut-1", "01화 오프닝 - 전경", 1, "wide-establishing"),
    createShotBookmark("cut-2", "01화 주인공 등장", 2, "low-angle-heroic"),
    createShotBookmark("cut-3", "01화 결투 대치", 3, "dutch-tilt-tension"),
  ]);

  const handleAddBookmark = () => {
    cinematicBookmarkCounter += 1;
    const nextCutIndex = bookmarks.length + 1;
    const newBm = createShotBookmark(
      `cut-${cinematicBookmarkCounter}`,
      `0${nextCutIndex}화 컷 ${nextCutIndex}`,
      nextCutIndex,
      selectedAngle,
    );
    setBookmarks([...bookmarks, newBm]);
    onApplyShotBookmark?.(newBm);
  };

  const handleTriggerShake = (preset: CameraShakePreset) => {
    setSelectedShake(preset);
    onTriggerShake?.({
      preset,
      intensity: shakeIntensity,
      frequency: 15,
      decayRate: 1.5,
    });
  };

  return (
    <div className="flex flex-col gap-3 p-3 text-xs text-fg">
      <div className="flex items-center justify-between border-b border-line pb-2">
        <div className="flex items-center gap-1.5 font-bold text-fg">
          <Clapperboard className="size-4 text-accent" />
          <span>시네마틱 카메라 & 컷 디렉터</span>
        </div>
        <button
          type="button"
          onClick={handleAddBookmark}
          className="flex items-center gap-1 rounded bg-accent/15 px-2 py-1 text-[0.68rem] font-bold text-accent transition-all hover:bg-accent/25"
        >
          <BookmarkPlus className="size-3" />
          <span>현재 뷰 북마크 저장</span>
        </button>
      </div>

      {/* Webtoon Angle Presets */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[0.68rem] font-medium text-fg-3">웹툰 연출 앵글 프리셋</span>
        <div className="grid grid-cols-2 gap-1.5">
          {WEBTOON_SHOT_ANGLE_PRESETS.map((preset) => (
            <button
              key={preset.kind}
              type="button"
              onClick={() => {
                setSelectedAngle(preset.kind);
                cinematicBookmarkCounter += 1;
                const bm = createShotBookmark(`preview-${cinematicBookmarkCounter}`, preset.label, 1, preset.kind);
                onApplyShotBookmark?.(bm);
              }}
              className={`flex flex-col items-start rounded-lg border p-2 text-left transition-all ${
                selectedAngle === preset.kind
                  ? "border-accent bg-accent/10 font-bold text-accent shadow-sm"
                  : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg"
              }`}
            >
              <div className="flex items-center gap-1">
                <Camera className="size-3 text-accent" />
                <span className="text-[0.72rem] leading-tight">{preset.label}</span>
              </div>
              <span className="mt-0.5 text-[0.62rem] text-fg-3 line-clamp-1">{preset.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Camera Shake VFX */}
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-card p-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 font-bold text-fg">
            <Activity className="size-3.5 text-accent" />
            <span className="text-[0.7rem]">카메라 셰이크 연출 (Camera Shake)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[0.65rem] text-fg-3">강도:</span>
            <input
              type="range"
              min="0.2"
              max="2.0"
              step="0.1"
              value={shakeIntensity}
              onChange={(e) => setShakeIntensity(parseFloat(e.target.value))}
              className="h-1.5 w-16 cursor-pointer accent-accent"
            />
            <span className="w-6 text-right font-mono text-[0.68rem] text-fg">{shakeIntensity}x</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1">
          {[
            { id: "handheld-subtle" as const, label: "일상 핸드헬드" },
            { id: "earthquake-rumble" as const, label: "지진/붕괴 진동" },
            { id: "explosive-shockwave" as const, label: "폭발 충격파" },
            { id: "heartbeat-throb" as const, label: "심박수 긴장 펄스" },
            { id: "running-footstep" as const, label: "질주 발걸음 바운스" },
            { id: "none" as const, label: "셰이크 멈춤" },
          ].map((shake) => (
            <button
              key={shake.id}
              type="button"
              onClick={() => handleTriggerShake(shake.id)}
              className={`rounded border px-1.5 py-1 text-[0.68rem] font-medium transition-all ${
                selectedShake === shake.id
                  ? "border-accent bg-accent text-accent-fg"
                  : "border-line bg-raised text-fg-2 hover:text-fg"
              }`}
            >
              {shake.label}
            </button>
          ))}
        </div>
      </div>

      {/* Saved Cut Bookmarks */}
      <div className="flex flex-col gap-1">
        <span className="text-[0.68rem] font-medium text-fg-3">저장된 웹툰 에피소드 컷 목록</span>
        <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
          {bookmarks.map((bm) => (
            <div
              key={bm.id}
              className="flex items-center justify-between rounded border border-line bg-card px-2 py-1.5 text-xs"
            >
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-raised px-1 py-0.5 font-mono text-[0.62rem] font-bold text-fg-2">
                  #{bm.episodePanelIndex}
                </span>
                <span className="font-medium text-fg">{bm.name}</span>
              </div>
              <button
                type="button"
                onClick={() => onApplyShotBookmark?.(bm)}
                className="flex items-center gap-1 rounded bg-raised px-2 py-0.5 text-[0.65rem] text-accent hover:bg-accent hover:text-accent-fg"
              >
                <Play className="size-2.5" />
                <span>카메라 이동</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
