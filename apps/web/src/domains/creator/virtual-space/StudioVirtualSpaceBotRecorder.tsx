import { useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  buildBotRecordingManifest,
  createBotRecorder,
  formatBotRecordingDuration,
  pauseBotRecording,
  resumeBotRecording,
  startBotRecording,
  stopBotRecording,
  type StudioBotRecording,
  type StudioBotRecordingQuality,
  type StudioBotRecordingState,
  type StudioBotRecordingZone,
} from "./studio-virtual-space-bot-recording";

/**
 * Bot 시점 녹화 패널. 회의실·검수실 등 구역에 Bot을 배치하고
 * 그 시점의 녹화를 시작/일시정지/중지한다.
 *
 * 1차 범위는 "클라이언트 녹화 준비"(상태+UI)까지이며, MediaRecorder 기반 실제
 * 캡처 스트림 연결은 후속 작업에서 연동한다. 따라서 다운로드 버튼은 실제
 * 캡처 연동이 될 때까지 비활성화하고, 녹화물 자산화는 `onAssetize` 콜백으로
 * 프로젝트 에셋 편입 의도를 호출자에게 전달한다.
 */
export function StudioVirtualSpaceBotRecorder({
  zones,
  defaultZoneId = null,
  onAssetize = null,
}: {
  readonly zones: readonly StudioBotRecordingZone[];
  readonly defaultZoneId?: string | null;
  readonly onAssetize?: ((recording: StudioBotRecording) => void) | null;
}) {
  const bt = useBilingual("StudioVirtualSpaceBotRecorder");
  const initialZone = zones.find((zone) => zone.id === defaultZoneId) ?? zones[0];
  const [zoneId, setZoneId] = useState(initialZone?.id ?? "");
  const [quality, setQuality] = useState<StudioBotRecordingQuality>("medium");
  const [participants, setParticipants] = useState("0");
  const [recorder, setRecorder] = useState<StudioBotRecordingState | null>(() =>
    initialZone ? createBotRecorder({ zoneId: initialZone.id, zoneName: initialZone.name, quality: "medium" }) : null,
  );
  const [recordings, setRecordings] = useState<readonly StudioBotRecording[]>([]);

  const idle = recorder === null || recorder.status === "idle";

  const handleZoneChange = (nextZoneId: string) => {
    const zone = zones.find((candidate) => candidate.id === nextZoneId);
    if (!zone) return;
    setZoneId(zone.id);
    setRecorder(createBotRecorder({ zoneId: zone.id, zoneName: zone.name, quality }));
  };

  const handleQualityChange = (nextQuality: StudioBotRecordingQuality) => {
    setQuality(nextQuality);
    const zone = zones.find((candidate) => candidate.id === zoneId);
    if (!zone) return;
    setRecorder(createBotRecorder({ zoneId: zone.id, zoneName: zone.name, quality: nextQuality }));
  };

  const zoneLabel = recorder?.zoneName ?? "";
  const handleStart = () => {
    if (!recorder) return;
    setRecorder(
      startBotRecording(recorder, {
        startedAt: Date.now(),
        participantCount: Number.parseInt(participants, 10),
      }),
    );
  };
  const handlePause = () => {
    if (!recorder) return;
    setRecorder(pauseBotRecording(recorder, { pausedAt: Date.now() }));
  };
  const handleResume = () => {
    if (!recorder) return;
    setRecorder(resumeBotRecording(recorder, { resumedAt: Date.now() }));
  };
  const handleStop = () => {
    if (!recorder) return;
    const result = stopBotRecording(recorder, {
      stoppedAt: Date.now(),
      title: bt(`Bot 녹화 · ${zoneLabel}`, `Bot recording · ${zoneLabel}`),
    });
    setRecorder(result.state);
    const session = result.session;
    if (session !== null) setRecordings((prev) => [...prev, session]);
  };

  const statusCopy =
    recorder?.status === "recording"
      ? bt("녹화 중", "Recording")
      : recorder?.status === "paused"
        ? bt("일시정지됨", "Paused")
        : bt("대기 중", "Idle");

  const qualityCopy: Record<StudioBotRecordingQuality, string> = {
    low: bt("저화질", "Low"),
    medium: bt("표준", "Medium"),
    high: bt("고화질", "High"),
  };

  const manifest = buildBotRecordingManifest(recordings);

  return (
    <section className="vs2-panel studio-vspace-bot-recorder" aria-label={bt("Bot 시점 녹화", "Bot POV recording")} data-space-interactive="true">
      <header>
        <div>
          <p>BOT RECORDER</p>
          <h2>{bt("Bot 시점 녹화", "Bot POV recording")}</h2>
        </div>
        <span aria-live="polite">{statusCopy}</span>
      </header>
      <p>
        {bt(
          "회의실·검수실에 Bot을 고정 배치해 그 시점의 논의·검수 과정을 기록합니다. 검수 회의 기록을 프로젝트 에셋으로 남길 수 있습니다. 이 패널은 클라이언트 녹화 준비 상태이며, 실제 캡처(MediaRecorder) 스트림 연결은 후속 작업에서 연동됩니다.",
          "Pin a Bot in a meeting or review room to record the discussion and review process from its point of view. Review session recordings can be kept as project assets. This panel is client-recording ready only; the actual capture (MediaRecorder) stream wiring is a follow-up.",
        )}
      </p>

      <div className="studio-vspace-bot-recorder-controls">
        <label>
          {bt("Bot 배치 구역", "Bot placement zone")}
          <select
            value={zoneId}
            disabled={!idle}
            onChange={(event) => handleZoneChange(event.target.value)}
            aria-label={bt("Bot 배치 구역", "Bot placement zone")}
          >
            {zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {bt("녹화 품질", "Recording quality")}
          <select
            value={quality}
            disabled={!idle}
            onChange={(event) => handleQualityChange(event.target.value as StudioBotRecordingQuality)}
            aria-label={bt("녹화 품질", "Recording quality")}
          >
            {(Object.keys(qualityCopy) as StudioBotRecordingQuality[]).map((value) => (
              <option key={value} value={value}>
                {qualityCopy[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {bt("참가자 수", "Participants")}
          <input
            type="number"
            min={0}
            step={1}
            value={participants}
            disabled={!idle}
            onChange={(event) => setParticipants(event.target.value)}
            aria-label={bt("참가자 수", "Participants")}
          />
        </label>
      </div>

      <div className="studio-vspace-bot-recorder-actions">
        {recorder?.status === "idle" || recorder === null ? (
          <button type="button" onClick={handleStart} disabled={recorder === null}>
            {bt("녹화 시작", "Start recording")}
          </button>
        ) : null}
        {recorder?.status === "recording" ? (
          <>
            <button type="button" onClick={handlePause}>
              {bt("일시정지", "Pause")}
            </button>
            <button type="button" onClick={handleStop}>
              {bt("녹화 중지", "Stop recording")}
            </button>
          </>
        ) : null}
        {recorder?.status === "paused" ? (
          <>
            <button type="button" onClick={handleResume}>
              {bt("다시 녹화", "Resume")}
            </button>
            <button type="button" onClick={handleStop}>
              {bt("녹화 중지", "Stop recording")}
            </button>
          </>
        ) : null}
      </div>

      <h3>{bt("녹화물 목록", "Recordings")}</h3>
      {recordings.length === 0 ? (
        <p>{bt("아직 녹화물이 없습니다. 녹화를 시작하면 여기에 목록이 쌓입니다.", "No recordings yet. Start a recording and they will be listed here.")}</p>
      ) : (
        <ul>
          {recordings.map((recording, index) => {
            const entry = manifest[index];
            if (!entry) return null;
            return (
              <li key={recording.id}>
                <div>
                  <strong>{entry.title}</strong>
                  <span>
                    {entry.zoneName} · {formatBotRecordingDuration(entry.durationMs)} ·{" "}
                    {new Date(entry.createdAt).toLocaleString()}
                  </span>
                </div>
                <div>
                  <button
                    type="button"
                    disabled
                    title={bt(
                      "클라이언트 캡처 연동이 완료되면 사용할 수 있습니다.",
                      "Available once the client capture integration is complete.",
                    )}
                  >
                    {bt("다운로드", "Download")}
                  </button>
                  {onAssetize ? (
                    <button type="button" onClick={() => onAssetize(recording)}>
                      {bt("에셋으로 편입", "Add to assets")}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
