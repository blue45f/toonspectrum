// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  createScriptedRecordingBoothDriver,
  type StudioRecordingBoothConfig,
  type StudioRecordingTake,
} from "./studio-virtual-space-recording-booth";
import type { StudioRecordingBoothMediaDriver } from "./studio-virtual-space-recording-booth-media-driver";
import type { StudioSpaceBooking } from "./studio-virtual-space-space-booking";
import {
  useStudioVirtualSpaceRecordingBooth,
  type UseStudioVirtualSpaceRecordingBoothInput,
} from "./use-studio-virtual-space-recording-booth";

const NOW = 1_700_000_000_000;

function config(overrides: Partial<StudioRecordingBoothConfig> = {}): StudioRecordingBoothConfig {
  return {
    boothId: "booth-a",
    roomId: "recording-booth",
    zone: { x: 100, y: 100, width: 200, height: 160 },
    reverb: "room",
    maxDurationSec: 300,
    exclusive: false,
    ...overrides,
  };
}

const INSIDE = { x: 150, y: 150 };
const OUTSIDE = { x: 20, y: 20 };

function setup(overrides: Partial<UseStudioVirtualSpaceRecordingBoothInput> = {}) {
  const input: UseStudioVirtualSpaceRecordingBoothInput = {
    config: config(),
    bookings: [],
    position: INSIDE,
    userName: "김작가",
    micMutedByUser: false,
    projectId: "project-1",
    nowMs: NOW,
    driver: createScriptedRecordingBoothDriver(),
    ...overrides,
  };
  return renderHook((props: UseStudioVirtualSpaceRecordingBoothInput) => (
    useStudioVirtualSpaceRecordingBooth(props)
  ), { initialProps: input });
}

describe("useStudioVirtualSpaceRecordingBooth", () => {
  it("부스 안에서는 채팅 마이크 자동 음소가 켜지고 나가면 복원 콜백이 온다", () => {
    const onEffectiveMicMuted = vi.fn();
    const { result, rerender } = setup({ onEffectiveMicMuted });
    expect(result.current.mutedByZone).toBe(true);
    expect(result.current.effectiveMuted).toBe(true);
    expect(onEffectiveMicMuted).toHaveBeenCalledWith(true);
    rerender({
      config: config(), bookings: [], position: OUTSIDE, micMutedByUser: false,
      projectId: "project-1", nowMs: NOW, driver: createScriptedRecordingBoothDriver(),
      onEffectiveMicMuted,
    });
    expect(result.current.effectiveMuted).toBe(false);
    expect(onEffectiveMicMuted).toHaveBeenLastCalledWith(false);
  });

  it("녹음을 시작하고 중지하면 테이크가 쌓인다", async () => {
    const { result } = setup();
    await act(async () => { await result.current.startRecording(); });
    expect(result.current.recording).toBe(true);
    await act(async () => { await result.current.stopRecording(); });
    expect(result.current.recording).toBe(false);
    expect(result.current.takes).toHaveLength(1);
    expect(result.current.takes[0]?.take.boothId).toBe("booth-a");
    expect(result.current.takes[0]?.blob).toBeNull();
  });

  it("반향 프리셋을 바꾼 뒤 녹음을 시작하면 세션에 반영된다", async () => {
    const { result } = setup();
    act(() => { result.current.setReverb("hall"); });
    await act(async () => { await result.current.startRecording(); });
    expect(result.current.recording).toBe(true);
    await act(async () => { await result.current.stopRecording(); });
    expect(result.current.reverb).toBe("hall");
  });

  it("예약이 필요한 독점 부스에서는 시작이 막히고 오류 코드를 남긴다", async () => {
    const { result } = setup({ config: config({ exclusive: true }) });
    await act(async () => { await result.current.startRecording(); });
    expect(result.current.recording).toBe(false);
    expect(result.current.error).toBe("booking-required");
    expect(result.current.access.state).toBe("booking-required");
  });

  it("구역 밖에서는 시작이 막힌다", async () => {
    const { result } = setup({ position: OUTSIDE });
    await act(async () => { await result.current.startRecording(); });
    expect(result.current.recording).toBe(false);
    expect(result.current.error).toBe("outside");
  });

  it("게스트가 에셋 편입을 누르면 로그인 nudge가 켜진다", async () => {
    const onRequireLogin = vi.fn();
    const { result } = setup({ isGuest: true, onRequireLogin });
    await act(async () => { await result.current.startRecording(); });
    await act(async () => { await result.current.stopRecording(); });
    const takeId = result.current.takes[0]?.take.id ?? "";
    act(() => { result.current.addTakeToProject(takeId); });
    expect(result.current.loginNudge).toBe(true);
    expect(onRequireLogin).toHaveBeenCalledTimes(1);
    expect(result.current.takes[0]?.addedToProject).toBe(false);
  });

  it("로그인 사용자는 테이크를 프로젝트 에셋으로 편입할 수 있다", async () => {
    const onProjectAsset = vi.fn();
    const { result } = setup({ onProjectAsset });
    await act(async () => { await result.current.startRecording(); });
    await act(async () => { await result.current.stopRecording(); });
    const takeId = result.current.takes[0]?.take.id ?? "";
    act(() => { result.current.addTakeToProject(takeId); });
    expect(onProjectAsset).toHaveBeenCalledTimes(1);
    expect(onProjectAsset.mock.calls[0]?.[0]).toMatchObject({
      kind: "audio", projectId: "project-1", takeId, source: "recording-booth",
    });
    expect(result.current.takes[0]?.addedToProject).toBe(true);
  });

  it("프로젝트가 없으면 project-required 오류를 남긴다", async () => {
    const { result } = setup({ projectId: null });
    await act(async () => { await result.current.startRecording(); });
    await act(async () => { await result.current.stopRecording(); });
    act(() => { result.current.addTakeToProject(result.current.takes[0]?.take.id ?? ""); });
    expect(result.current.error).toBe("project-required");
  });

  it("미디어 드라이버면 Blob이 테이크와 함께 보관된다", async () => {
    const take: StudioRecordingTake = {
      id: "take-1", sessionId: "s1", boothId: "booth-a", durationSec: 5,
      mimeType: "audio/webm", recordedAtMs: NOW, estimatedBytes: 3,
    };
    const mediaDriver: StudioRecordingBoothMediaDriver = {
      id: "media-recorder",
      capture: true,
      startBoothSession: (cfg) => ({
        id: "s1", boothId: cfg.boothId, reverb: cfg.reverb, startedAtMs: Date.now(), maxDurationSec: cfg.maxDurationSec,
      }),
      stopBoothSession: () => take,
      stopBoothSessionWithBlob: () => Promise.resolve({ take, blob: new Blob(["abc"]) }),
      cancelBoothSession: () => undefined,
    };
    const { result } = setup({ driver: mediaDriver });
    await act(async () => { await result.current.startRecording(); });
    await act(async () => { await result.current.stopRecording(); });
    expect(result.current.takes[0]?.blob?.size).toBe(3);
  });

  it("취소하면 테이크가 남지 않는다", async () => {
    const { result } = setup();
    await act(async () => { await result.current.startRecording(); });
    await act(async () => { await result.current.cancelRecording(); });
    expect(result.current.recording).toBe(false);
    expect(result.current.takes).toHaveLength(0);
  });
});

describe("예약 명단 대조", () => {
  const booking: StudioSpaceBooking = {
    id: "booking-1",
    spaceId: "recording-booth",
    spaceName: "녹음부스",
    capacity: 2,
    equipmentTags: ["마이크"],
    startsAt: NOW - 1_000,
    endsAt: NOW + 60_000,
    bookerNames: ["김작가"],
    note: "",
    status: "confirmed",
  };

  it("내 예약이면 녹음 가능, 남의 예약이면 차단된다", () => {
    const mine = setup({ config: config({ exclusive: true }), bookings: [booking], userName: "김작가" });
    expect(mine.result.current.access.state).toBe("booked");
    expect(mine.result.current.access.canRecord).toBe(true);
    const other = setup({ config: config({ exclusive: true }), bookings: [booking], userName: "이작가" });
    expect(other.result.current.access.state).toBe("booked-by-other");
    expect(other.result.current.access.canRecord).toBe(false);
  });
});
