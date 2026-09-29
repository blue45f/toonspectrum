import { describe, expect, it } from "vitest";

import {
  buildBotRecordingManifest,
  createBotRecorder,
  formatBotRecordingDuration,
  pauseBotRecording,
  resumeBotRecording,
  startBotRecording,
  stopBotRecording,
} from "./studio-virtual-space-bot-recording";

function createMeetingRecorder() {
  return createBotRecorder({ zoneId: "zone:meeting", zoneName: "회의실", quality: "high" });
}

describe("Bot 시점 녹화 상태 기계", () => {
  it("구역 id/이름/녹화 품질로 녹화기를 생성한다", () => {
    const recorder = createMeetingRecorder();
    expect(recorder.status).toBe("idle");
    expect(recorder.zoneId).toBe("zone:meeting");
    expect(recorder.zoneName).toBe("회의실");
    expect(recorder.quality).toBe("high");
    expect(recorder.startedAt).toBeNull();
    expect(recorder.participantCount).toBe(0);
  });

  it("잘못된 구역 id/이름/품질로는 녹화기를 만들 수 없다", () => {
    expect(() => createBotRecorder({ zoneId: "not valid!!", zoneName: "회의실", quality: "high" })).toThrow(RangeError);
    expect(() => createBotRecorder({ zoneId: "zone:meeting", zoneName: "   ", quality: "high" })).toThrow(RangeError);
    expect(() => createBotRecorder({ zoneId: "zone:meeting", zoneName: "회의실", quality: "ultra" as never })).toThrow(RangeError);
  });

  it("idle에서 녹화를 시작하고 세션 메타를 기록한다", () => {
    const recording = startBotRecording(createMeetingRecorder(), { startedAt: 1000, participantCount: 4 });
    expect(recording.status).toBe("recording");
    expect(recording.startedAt).toBe(1000);
    expect(recording.participantCount).toBe(4);
    expect(recording.pausedMs).toBe(0);
  });

  it("잘못된 시작 시각이나 참가자 수는 거부하거나 보정한다", () => {
    const recorder = createMeetingRecorder();
    expect(startBotRecording(recorder, { startedAt: Number.NaN })).toBe(recorder);
    const negative = startBotRecording(recorder, { startedAt: 1000, participantCount: -3 });
    expect(negative.participantCount).toBe(0);
  });

  it("일시정지·재개·중지 전이를 수행하고 일시정지 시간을 길이에서 제외한다", () => {
    const recording = startBotRecording(createMeetingRecorder(), { startedAt: 1000, participantCount: 2 });
    const paused = pauseBotRecording(recording, { pausedAt: 3000 });
    expect(paused.status).toBe("paused");
    expect(paused.pausedAt).toBe(3000);
    const resumed = resumeBotRecording(paused, { resumedAt: 5000 });
    expect(resumed.status).toBe("recording");
    expect(resumed.pausedMs).toBe(2000);
    expect(resumed.pausedAt).toBeNull();
    const { state, session } = stopBotRecording(resumed, { stoppedAt: 9000, title: "  검수 회의 1  " });
    expect(state.status).toBe("idle");
    expect(state.startedAt).toBeNull();
    expect(state.pausedMs).toBe(0);
    expect(session).not.toBeNull();
    expect(session?.title).toBe("검수 회의 1");
    expect(session?.durationMs).toBe(6000);
    expect(session?.zoneName).toBe("회의실");
    expect(session?.participantCount).toBe(2);
    expect(session?.quality).toBe("high");
    expect(session?.startedAt).toBe(1000);
    expect(session?.createdAt).toBe(9000);
    expect(session?.id).toBe("bot-recording-zone:meeting-1000");
  });

  it("일시정지 상태에서 중지하면 마지막 일시정지 시점을 종료 시점으로 본다", () => {
    const recording = startBotRecording(createMeetingRecorder(), { startedAt: 1000 });
    const paused = pauseBotRecording(recording, { pausedAt: 4000 });
    const { session } = stopBotRecording(paused, { stoppedAt: 9000, title: "중간 종료" });
    expect(session?.durationMs).toBe(3000);
  });

  it("허용되지 않은 전이는 현재 상태를 그대로 반환한다", () => {
    const recorder = createMeetingRecorder();
    expect(pauseBotRecording(recorder, { pausedAt: 1000 })).toBe(recorder);
    expect(resumeBotRecording(recorder, { resumedAt: 1000 })).toBe(recorder);
    const recording = startBotRecording(recorder, { startedAt: 1000 });
    expect(startBotRecording(recording, { startedAt: 2000 })).toBe(recording);
    expect(resumeBotRecording(recording, { resumedAt: 2000 })).toBe(recording);
    const paused = pauseBotRecording(recording, { pausedAt: 3000 });
    expect(pauseBotRecording(paused, { pausedAt: 3500 })).toBe(paused);
    expect(startBotRecording(paused, { startedAt: 4000 })).toBe(paused);
  });

  it("idle에서 중지하면 세션이 생성되지 않는다", () => {
    const recorder = createMeetingRecorder();
    const result = stopBotRecording(recorder, { stoppedAt: 1000, title: "제목" });
    expect(result.state).toBe(recorder);
    expect(result.session).toBeNull();
  });

  it("중지 시각이 시작 시각보다 이르면 상태 유지·세션 미생성", () => {
    const recording = startBotRecording(createMeetingRecorder(), { startedAt: 5000 });
    const result = stopBotRecording(recording, { stoppedAt: 1000, title: "제목" });
    expect(result.state).toBe(recording);
    expect(result.session).toBeNull();
    expect(result.state.status).toBe("recording");
  });

  it("빈 제목으로 중지하면 구역 이름이 녹화물 제목이 된다", () => {
    const { session } = stopBotRecording(
      startBotRecording(createMeetingRecorder(), { startedAt: 1000 }),
      { stoppedAt: 61000, title: "   " },
    );
    expect(session?.title).toBe("회의실");
  });

  it("녹화물 매니페스트는 제목/구역/길이/생성 시각만 추린다", () => {
    const { session } = stopBotRecording(
      startBotRecording(createMeetingRecorder(), { startedAt: 1000 }),
      { stoppedAt: 61000, title: "주간 검수" },
    );
    const manifest = buildBotRecordingManifest(session === null ? [] : [session]);
    expect(manifest).toEqual([
      { title: "주간 검수", zoneName: "회의실", durationMs: 60000, createdAt: 61000 },
    ]);
  });

  it("녹화 길이를 mm:ss / h:mm:ss 형태로 포맷한다", () => {
    expect(formatBotRecordingDuration(0)).toBe("0:00");
    expect(formatBotRecordingDuration(83000)).toBe("1:23");
    expect(formatBotRecordingDuration(3723000)).toBe("1:02:03");
    expect(formatBotRecordingDuration(-5000)).toBe("0:00");
  });
});
