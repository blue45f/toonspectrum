import { Accessibility, BatteryCharging, Camera, Gauge, MousePointer2, Sparkles, Type, Volume2 } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  STUDIO_VIRTUAL_CAMERA_MODES,
  STUDIO_VIRTUAL_CONTROL_MODES,
  STUDIO_VIRTUAL_DIALOGUE_SCALES,
  STUDIO_VIRTUAL_EFFECT_LEVELS,
  STUDIO_VIRTUAL_HANDEDNESS,
  STUDIO_VIRTUAL_NAMEPLATE_MODES,
  STUDIO_VIRTUAL_QUALITY_PRESETS,
  STUDIO_VIRTUAL_START_LOCATIONS,
  patchStudioVirtualExperiencePreference,
  type StudioVirtualExperiencePreference,
} from "./studio-virtual-space-experience-preference";
import {
  EMPTY_STUDIO_VIRTUAL_RUNTIME_METRICS,
  studioVirtualRuntimeHealth,
  type StudioVirtualRuntimeMetrics,
} from "./studio-virtual-space-observability";

const LABELS = {
  controlMode: {
    fixed: ["고정 조이스틱", "Fixed joystick"], floating: ["플로팅 조이스틱", "Floating joystick"], tap: ["탭 이동", "Tap to move"],
  },
  handedness: { right: ["오른손", "Right hand"], left: ["왼손", "Left hand"] },
  qualityPreset: {
    auto: ["자동", "Auto"], ultra: ["울트라", "Ultra"], high: ["높음", "High"], balanced: ["균형", "Balanced"],
    battery: ["배터리 절약", "Battery saver"], accessibility: ["접근성", "Accessibility"],
  },
  cameraMode: { follow: ["따라가기", "Follow"], steady: ["안정적", "Steady"], cinematic: ["시네마틱", "Cinematic"] },
  nameplateMode: { auto: ["거리 자동", "Distance auto"], full: ["항상 전체", "Always full"], compact: ["간결", "Compact"], dot: ["상태 점", "Status dot"] },
  dialogueScale: { normal: ["보통", "Normal"], large: ["크게", "Large"], xlarge: ["매우 크게", "Extra large"] },
  startLocation: { last: ["마지막 위치", "Last position"], desk: ["내 작업대", "My desk"], lobby: ["로비", "Lobby"] },
  effectLevel: { low: ["차분하게", "Low"], balanced: ["균형", "Balanced"], high: ["역동적으로", "High"] },
} as const;

export function StudioVirtualSpaceExperiencePanel({
  value, metrics = EMPTY_STUDIO_VIRTUAL_RUNTIME_METRICS, onChange, onCapture,
}: {
  readonly value: StudioVirtualExperiencePreference;
  readonly metrics?: StudioVirtualRuntimeMetrics;
  readonly onChange: (next: StudioVirtualExperiencePreference) => void;
  readonly onCapture?: () => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceExperiencePanel");
  const patch = (next: Partial<Omit<StudioVirtualExperiencePreference, "version">>) =>
    onChange(patchStudioVirtualExperiencePreference(value, next));
  const group = <T extends string>(
    current: T,
    values: readonly T[],
    labels: Readonly<Record<T, readonly [string, string]>>,
    select: (next: T) => void,
  ) => <div className="studio-vspace-experience-options">
    {values.map((item) => <button key={item} type="button" aria-pressed={current === item} onClick={() => select(item)}>
      {bt(labels[item][0], labels[item][1])}
    </button>)}
  </div>;
  const health = studioVirtualRuntimeHealth(metrics);

  return <section className="vs2-panel studio-vspace-experience" data-space-interactive="true">
    <header><div><p>PLAY & ACCESS</p><h2>{bt("플레이·접근성 설정", "Play and accessibility")}</h2></div><Accessibility size={19} aria-hidden /></header>
    <fieldset><legend><MousePointer2 size={15} aria-hidden />{bt("모바일 조작", "Mobile controls")}</legend>
      {group(value.controlMode, STUDIO_VIRTUAL_CONTROL_MODES, LABELS.controlMode, (controlMode) => patch({ controlMode }))}{group(value.handedness, STUDIO_VIRTUAL_HANDEDNESS, LABELS.handedness, (handedness) => patch({ handedness }))}</fieldset>
    <fieldset><legend><Gauge size={15} aria-hidden />{bt("그래픽 품질", "Graphics quality")}</legend>
      {group(value.qualityPreset, STUDIO_VIRTUAL_QUALITY_PRESETS, LABELS.qualityPreset, (qualityPreset) => patch({ qualityPreset }))}
      <p>{bt("자동 모드는 프레임 속도와 기기 성능을 보고 단계적으로 조절합니다.", "Auto adjusts gradually using frame rate and device capability.")}</p></fieldset>
    <fieldset><legend><Camera size={15} aria-hidden />{bt("카메라", "Camera")}</legend>
      {group(value.cameraMode, STUDIO_VIRTUAL_CAMERA_MODES, LABELS.cameraMode, (cameraMode) => patch({ cameraMode }))}
      {onCapture ? <button type="button" className="studio-vspace-photo-capture" onClick={onCapture}>
        <Camera size={15} aria-hidden />{bt("현재 월드 PNG 저장", "Save current world as PNG")}
      </button> : null}</fieldset>
    <fieldset><legend><Type size={15} aria-hidden />{bt("이름표·대화 글자", "Nameplates and dialogue")}</legend>
      {group(value.nameplateMode, STUDIO_VIRTUAL_NAMEPLATE_MODES, LABELS.nameplateMode, (nameplateMode) => patch({ nameplateMode }))}{group(value.dialogueScale, STUDIO_VIRTUAL_DIALOGUE_SCALES, LABELS.dialogueScale, (dialogueScale) => patch({ dialogueScale }))}</fieldset>
    <fieldset><legend><Sparkles size={15} aria-hidden />{bt("환경 효과", "Environment effects")}</legend>
      {group(value.effectLevel, STUDIO_VIRTUAL_EFFECT_LEVELS, LABELS.effectLevel, (effectLevel) => patch({ effectLevel }))}
      <label><input type="checkbox" checked={value.interactionRings} onChange={(event) => patch({ interactionRings: event.target.checked })} />{bt("근처 상호작용 링 표시", "Show nearby interaction rings")}</label></fieldset>
    <fieldset><legend><Volume2 size={15} aria-hidden />{bt("NPC 읽기", "NPC reading")}</legend>
      <label><input type="checkbox" checked={value.ttsEnabled} onChange={(event) => patch({ ttsEnabled: event.target.checked })} />{bt("버튼으로 답변 읽기 허용", "Allow explicit read-aloud buttons")}</label></fieldset>
    <fieldset><legend><BatteryCharging size={15} aria-hidden />{bt("입장 위치", "Entry location")}</legend>{group(value.startLocation, STUDIO_VIRTUAL_START_LOCATIONS, LABELS.startLocation, (startLocation) => patch({ startLocation }))}</fieldset>
    <section className="studio-vspace-runtime-health" data-health={health} aria-label={bt("로컬 성능 상태", "Local performance status")}>
      <strong>{health === "good" ? bt("성능 양호", "Performance good") : health === "poor" ? bt("성능 제한", "Performance constrained") : bt("성능 조정 중", "Performance adapting")}</strong>
      <span>{metrics.fps ? `${metrics.fps.toFixed(1)} FPS · ${metrics.qualityTier}` : bt("월드 실행 후 측정됩니다.", "Measured after the world starts.")}</span>
      <small>{bt("닉네임·채팅·문서 내용은 성능 측정에 포함하지 않습니다.", "Performance metrics never include nicknames, chat or document content.")}</small>
    </section>
  </section>;
}
