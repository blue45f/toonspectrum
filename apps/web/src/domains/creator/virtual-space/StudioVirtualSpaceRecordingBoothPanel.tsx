import { CircleStop, Disc3, Mic, Square, X } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  STUDIO_REVERB_PRESET_SPECS,
  STUDIO_REVERB_PRESETS,
  type StudioProjectAudioAssetDescriptor,
  type StudioRecordingBoothConfig,
  type StudioRecordingBoothDriver,
} from "./studio-virtual-space-recording-booth";
import type { StudioSpaceBooking } from "./studio-virtual-space-space-booking";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import { StudioVirtualSpaceSilentZoneBadge } from "./StudioVirtualSpaceSilentZoneBadge";
import { useStudioVirtualSpaceRecordingBooth } from "./use-studio-virtual-space-recording-booth";

export interface StudioVirtualSpaceRecordingBoothPanelProps {
  readonly config: StudioRecordingBoothConfig;
  readonly bookings: readonly StudioSpaceBooking[];
  readonly position: StudioVirtualSpacePoint | null;
  readonly userName?: string | null;
  readonly micMutedByUser: boolean;
  readonly projectId?: string | null;
  readonly isGuest?: boolean;
  readonly driver?: StudioRecordingBoothDriver;
  readonly nowMs?: number;
  readonly onRequireLogin?: () => void;
  readonly onProjectAsset?: (descriptor: StudioProjectAudioAssetDescriptor, blob: Blob | null) => void;
  readonly onEffectiveMicMuted?: (muted: boolean) => void;
}

/** 오류 코드를 사용자 문구로 바꾼다. 모르는 코드는 상태 코드로 함께 보여 준다. */
function errorCopy(code: string, bt: (ko: string, en: string) => string): string {
  switch (code) {
    case "mic-permission-denied":
      return bt("마이크 권한이 거부되었어요. 브라우저 사이트 설정에서 마이크를 허용해 주세요.", "Microphone permission was denied. Allow the microphone in your browser site settings.");
    case "mic-unavailable":
      return bt("마이크를 시작하지 못했어요. 입력 장치를 확인해 주세요.", "Couldn't start the microphone. Check your input device.");
    case "recorder-unsupported":
      return bt("이 브라우저는 WebM 녹음을 지원하지 않아요.", "This browser doesn't support WebM recording.");
    case "empty-recording":
      return bt("녹음된 소리가 없어요. 마이크 입력이 들어오는지 확인해 주세요.", "No audio was captured. Check that your microphone is picking up sound.");
    case "already-recording":
      return bt("이미 녹음 중이에요.", "A recording is already in progress.");
    case "session-not-found":
      return bt("녹음 세션을 찾을 수 없어요. 다시 시작해 주세요.", "The recording session is gone. Please start again.");
    case "project-required":
      return bt("프로젝트가 정해져 있지 않아 에셋으로 넣을 수 없어요.", "No project is selected, so the take can't be added as an asset.");
    case "outside":
      return bt("부스 안에 들어가야 녹음할 수 있어요.", "Step inside the booth to record.");
    case "booking-required":
      return bt("지금은 예약된 시간이 아니에요. 먼저 부스를 예약해 주세요.", "This isn't a booked time slot. Book the booth first.");
    case "booked-by-other":
      return bt("다른 팀원이 예약한 시간이에요.", "Another teammate has this slot booked.");
    default:
      return bt(`녹음을 진행할 수 없어요. (${code})`, `Recording couldn't proceed. (${code})`);
  }
}

function formatClock(totalSec: number): string {
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * 녹음부스 패널: 예약 게이트 상태, 반향 프리셋, WebM 녹음, 프로젝트 에셋 편입.
 * 마이크 장치 적용의 소유자는 페이지의 조용한 구역 중재 훅이다(부스 구역 포함).
 * 이 패널은 뱃지 표시와 상태 계산만 맡고, onEffectiveMicMuted는 선택적 알림이다.
 */
export function StudioVirtualSpaceRecordingBoothPanel({
  config,
  bookings,
  position,
  userName,
  micMutedByUser,
  projectId,
  isGuest = false,
  driver,
  nowMs,
  onRequireLogin,
  onProjectAsset,
  onEffectiveMicMuted,
}: StudioVirtualSpaceRecordingBoothPanelProps) {
  const bt = useBilingual("StudioVirtualSpaceRecordingBoothPanel");
  const booth = useStudioVirtualSpaceRecordingBooth({
    config, bookings, position, userName, micMutedByUser, projectId, isGuest,
    driver, nowMs, onRequireLogin, onProjectAsset, onEffectiveMicMuted,
  });
  const { access } = booth;
  const activeBooking = access.activeBooking;

  return (
    <section aria-label={bt("녹음부스", "Recording booth")}>
      <h2>{bt("녹음부스", "Recording booth")}</h2>
      <p className="space-panel-note">
        {bt(
          "부스 안에서는 대화 마이크가 자동으로 꺼지고, 녹음은 부스 마이크로 따로 담아요. 녹음한 테이크는 지금 프로젝트 에셋으로 바로 넣을 수 있어요.",
          "Inside the booth your chat mic mutes automatically while the booth mic records separately. Takes can go straight into the current project as assets.",
        )}
      </p>

      {access.inside ? (
        <StudioVirtualSpaceSilentZoneBadge zone={booth.silentZone} mutedByZone={booth.mutedByZone} />
      ) : null}

      <p role="status">
        {access.state === "outside"
          ? bt("부스 안에 들어가면 녹음할 수 있어요.", "Step inside the booth to record.")
          : access.state === "booking-required"
            ? bt("부스 안이에요. 지금은 예약된 시간이 아니라 녹음할 수 없어요.", "You're in the booth, but this isn't a booked slot yet.")
            : access.state === "booked-by-other" && activeBooking
              ? bt(
                `${activeBooking.bookerNames.join(", ")} 님이 ${new Date(activeBooking.endsAt).toLocaleTimeString()}까지 예약했어요.`,
                `${activeBooking.bookerNames.join(", ")} has the booth until ${new Date(activeBooking.endsAt).toLocaleTimeString()}.`,
              )
              : access.state === "booked"
                ? bt("예약 시간이에요. 녹음할 수 있어요.", "This is your booked slot. You can record.")
                : bt("자유롭게 녹음할 수 있는 부스예요.", "This booth is free to use.")}
      </p>

      <fieldset disabled={booth.recording}>
        <legend>{bt("반향 프리셋", "Reverb preset")}</legend>
        {STUDIO_REVERB_PRESETS.map((preset) => {
          const spec = STUDIO_REVERB_PRESET_SPECS[preset];
          return (
            <label key={preset}>
              <input
                type="radio"
                name="booth-reverb"
                value={preset}
                checked={booth.reverb === preset}
                onChange={() => booth.setReverb(preset)}
              />
              {bt(spec.labelKo, spec.labelEn)}
              <small> · {bt(spec.descriptionKo, spec.descriptionEn)}</small>
            </label>
          );
        })}
      </fieldset>

      <div>
        {!booth.recording ? (
          <button type="button" disabled={!access.canRecord} onClick={() => { void booth.startRecording(); }}>
            <Disc3 size={15} aria-hidden />{bt("녹음 시작", "Start recording")}
          </button>
        ) : (
          <>
            <button type="button" onClick={() => { void booth.stopRecording(); }}>
              <Square size={15} aria-hidden />{bt("녹음 종료", "Stop recording")}
            </button>
            <button type="button" onClick={() => { void booth.cancelRecording(); }}>
              <X size={15} aria-hidden />{bt("취소", "Cancel")}
            </button>
          </>
        )}
        {booth.recording ? (
          <span role="timer" aria-label={bt("녹음 경과 시간", "Recording time")}>
            <CircleStop size={14} aria-hidden />
            {formatClock(booth.elapsedSec)} / {formatClock(config.maxDurationSec)}
          </span>
        ) : null}
      </div>

      {booth.error ? <p role="alert">{errorCopy(booth.error, bt)}</p> : null}

      {isGuest ? (
        <p className="space-panel-note">
          {bt(
            "게스트도 부스를 둘러보고 녹음해 볼 수 있어요. 프로젝트 에셋으로 넣을 때만 로그인이 필요해요.",
            "Guests can look around and record. Signing in is only needed to add a take to a project.",
          )}
        </p>
      ) : null}
      {booth.loginNudge ? (
        <p role="status">
          <Mic size={14} aria-hidden />
          {bt("테이크를 프로젝트에 넣으려면 로그인해 주세요.", "Sign in to add this take to your project.")}
        </p>
      ) : null}

      <h3>{bt("녹음 테이크", "Recorded takes")}</h3>
      {booth.takes.length === 0 ? (
        <p className="space-panel-note">{bt("아직 녹음한 테이크가 없어요.", "No takes recorded yet.")}</p>
      ) : (
        <ul>
          {booth.takes.map(({ take, blob, addedToProject }) => (
            <li key={take.id}>
              <span>
                {new Date(take.recordedAtMs).toLocaleTimeString()} · {formatClock(take.durationSec)}
                {blob ? ` · ${Math.max(1, Math.round(blob.size / 1024))}KB` : ""}
              </span>
              {addedToProject ? (
                <span>{bt("프로젝트 에셋에 넣었어요", "Added to project assets")}</span>
              ) : (
                <button type="button" onClick={() => booth.addTakeToProject(take.id)}>
                  {bt("프로젝트 에셋으로 넣기", "Add to project assets")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default StudioVirtualSpaceRecordingBoothPanel;
