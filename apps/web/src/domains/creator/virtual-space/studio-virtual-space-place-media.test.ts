import { describe, expect, it, vi } from "vitest";

import {
  PlaceMediaSession,
  placeMediaPermissionHint,
  placeMediaSeatLayout,
} from "./studio-virtual-space-place-media";

function track(kind: "audio" | "video") {
  return {
    kind,
    enabled: true,
    stop: vi.fn(),
    addEventListener: vi.fn(),
  } as unknown as MediaStreamTrack;
}

function stream(tracks: MediaStreamTrack[]) {
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((track) => track.kind === "audio"),
    getVideoTracks: () => tracks.filter((track) => track.kind === "video"),
  } as unknown as MediaStream;
}

describe("PlaceMediaSession.join", () => {
  it("getUserMedia로 마이크·카메라를 연다", async () => {
    const microphone = track("audio");
    const camera = track("video");
    const getUserMedia = vi.fn(async () => stream([microphone, camera]));
    const session = new PlaceMediaSession({ getUserMedia });
    await session.join("conference");
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: true });
    const snapshot = session.snapshot();
    expect(snapshot.active).toBe(true);
    expect(snapshot.kind).toBe("conference");
    expect(snapshot.microphone).toBe(true);
    expect(snapshot.camera).toBe(true);
    expect(snapshot.error).toBeNull();
    session.leave();
  });

  it("권한 거부 시 에러 스냅샷을 낸다", async () => {
    const getUserMedia = vi.fn(async () => {
      throw new DOMException("Permission denied", "NotAllowedError");
    });
    const session = new PlaceMediaSession({ getUserMedia });
    await session.join("conference");
    const snapshot = session.snapshot();
    expect(snapshot.active).toBe(false);
    expect(snapshot.error?.kind).toBe("permission-denied");
    expect(snapshot.error?.messageKo).toContain("권한");
  });

  it("getUserMedia가 없으면 not-supported다", async () => {
    const session = new PlaceMediaSession({ getUserMedia: undefined });
    // jsdom/node에는 navigator.mediaDevices가 없으므로 주입 없이는 미지원이다.
    await session.join("conference");
    expect(session.snapshot().error?.kind).toBe("not-supported");
  });

  it("장치 없이도 참여할 수 있다 (화면 공유 전용)", async () => {
    const getUserMedia = vi.fn();
    const session = new PlaceMediaSession({ getUserMedia });
    await session.join("conference", { microphone: false, camera: false });
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(session.snapshot().active).toBe(true);
    session.leave();
  });
});

describe("마이크·카메라 토글", () => {
  it("트랙 enabled를 바꾼다", async () => {
    const microphone = track("audio");
    const camera = track("video");
    const session = new PlaceMediaSession({
      getUserMedia: vi.fn(async () => stream([microphone, camera])),
    });
    await session.join("conference");
    session.setMicrophone(false);
    expect(microphone.enabled).toBe(false);
    expect(session.snapshot().microphone).toBe(false);
    session.setCamera(false);
    expect(camera.enabled).toBe(false);
    session.leave();
  });
});

describe("leave", () => {
  it("모든 트랙을 정지하고 상태를 리셋한다", async () => {
    const microphone = track("audio");
    const session = new PlaceMediaSession({
      getUserMedia: vi.fn(async () => stream([microphone])),
    });
    await session.join("lounge");
    session.leave();
    expect(microphone.stop).toHaveBeenCalled();
    const snapshot = session.snapshot();
    expect(snapshot.active).toBe(false);
    expect(snapshot.kind).toBeNull();
    expect(snapshot.localStream).toBeNull();
  });
});

describe("화면 공유", () => {
  it("getDisplayMedia로 화면 공유를 시작한다", async () => {
    const screenTrack = track("video");
    const getDisplayMedia = vi.fn(async () => stream([screenTrack]));
    const session = new PlaceMediaSession({
      getUserMedia: vi.fn(async () => stream([])),
      getDisplayMedia,
    });
    await session.join("conference", { microphone: false, camera: false });
    await session.startScreenShare();
    expect(getDisplayMedia).toHaveBeenCalled();
    expect(session.snapshot().screenSharing).toBe(true);
    // 기본값: 버블 경로·balanced 스로틀.
    expect(session.snapshot().screenShareScope).toBe("bubble");
    expect(session.snapshot().screenShareBandwidth).toBe("balanced");
    session.stopScreenShare();
    expect(screenTrack.stop).toHaveBeenCalled();
    expect(session.snapshot().screenSharing).toBe(false);
    expect(session.snapshot().screenShareScope).toBeNull();
    session.leave();
  });

  it("방송 경로·대역폭 스로틀을 지정할 수 있다", async () => {
    const screenTrack = track("video");
    const getDisplayMedia = vi.fn(async () => stream([screenTrack]));
    const session = new PlaceMediaSession({
      getUserMedia: vi.fn(async () => stream([])),
      getDisplayMedia,
    });
    await session.join("stage", { microphone: false, camera: false });
    await session.startScreenShare({ scope: "broadcast", bandwidth: "low" });
    // low 힌트(854px·8fps)가 getDisplayMedia 제약으로 반영된다.
    expect(getDisplayMedia).toHaveBeenCalledWith({
      video: { width: { max: 854 }, frameRate: { max: 8 } },
      audio: false,
    });
    expect(session.snapshot().screenShareScope).toBe("broadcast");
    expect(session.snapshot().screenShareBandwidth).toBe("low");
    session.leave();
    expect(session.snapshot().screenShareScope).toBeNull();
  });
});

describe("시뮬레이션 피어·스포트라이트", () => {
  it("피어를 추가하고 발언자를 스포트라이트한다", async () => {
    const session = new PlaceMediaSession({
      getUserMedia: vi.fn(async () => stream([])),
    });
    await session.join("stage", { microphone: false, camera: false });
    session.addSimulatedPeer("peer-1", "동료1");
    session.addSimulatedPeer("peer-2", "동료2");
    expect(session.snapshot().peers).toHaveLength(2);
    expect(session.snapshot().peers[0]!.simulated).toBe(true);
    session.markSpeaking("peer-2");
    expect(session.snapshot().spotlightSessionId).toBe("peer-2");
    expect(session.snapshot().peers.find((peer) => peer.sessionId === "peer-2")!.speaking).toBe(true);
    session.removeSimulatedPeer("peer-2");
    expect(session.snapshot().spotlightSessionId).toBeNull();
    session.leave();
  });
});

describe("시그널링 어댑터 확장점", () => {
  it("어댑터를 붙였다 뗄 수 있다", async () => {
    const session = new PlaceMediaSession({
      getUserMedia: vi.fn(async () => stream([])),
    });
    const join = vi.fn(async () => undefined);
    const leave = vi.fn(async () => undefined);
    session.attachSignaling({ name: "test-adapter", join, leave });
    await session.join("conference", { microphone: false, camera: false });
    expect(join).toHaveBeenCalledWith("conference", null);
    session.detachSignaling();
    session.leave();
    expect(leave).not.toHaveBeenCalled();
  });
});

describe("placeMediaSeatLayout", () => {
  const bounds = { x: 0, y: 0, width: 400, height: 300 };

  it("0명이면 빈 배열이다", () => {
    expect(placeMediaSeatLayout(bounds, 0)).toEqual([]);
  });

  it("참가자 수만큼 존 안에 좌석을 배치한다", () => {
    const seats = placeMediaSeatLayout(bounds, 4);
    expect(seats).toHaveLength(4);
    for (const seat of seats) {
      expect(seat.x).toBeGreaterThanOrEqual(bounds.x);
      expect(seat.x).toBeLessThanOrEqual(bounds.x + bounds.width);
      expect(seat.y).toBeGreaterThanOrEqual(bounds.y);
      expect(seat.y).toBeLessThanOrEqual(bounds.y + bounds.height);
    }
  });

  it("한 명이면 가운데다", () => {
    const [seat] = placeMediaSeatLayout(bounds, 1);
    expect(seat!.x).toBe(200);
    expect(seat!.y).toBe(150);
  });
});

describe("placeMediaPermissionHint", () => {
  it("한영 힌트를 낸다", () => {
    expect(placeMediaPermissionHint("ko")).toContain("권한");
    expect(placeMediaPermissionHint("en")).toContain("permission");
  });
});
