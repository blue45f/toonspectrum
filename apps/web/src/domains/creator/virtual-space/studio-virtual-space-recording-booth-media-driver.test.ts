/**
 * 녹음부스 MediaRecorder 드라이버 테스트 (트랙 B)
 *
 * getUserMedia·MediaRecorder·AudioContext를 가짜로 주입해 실제 캡처 흐름을 검증한다.
 */
import { describe, expect, it } from "vitest";

import type { StudioRecordingBoothConfig } from "./studio-virtual-space-recording-booth";
import {
  createMediaRecorderBoothDriver,
  createReverbImpulseBuffer,
  pickBoothRecordingMimeType,
  StudioBoothMediaError,
  type StudioMediaRecorderBoothDriverOptions,
} from "./studio-virtual-space-recording-booth-media-driver";

function config(overrides: Partial<StudioRecordingBoothConfig> = {}): StudioRecordingBoothConfig {
  return {
    boothId: "booth-a",
    roomId: "recording-booth",
    zone: { x: 100, y: 100, width: 200, height: 160 },
    reverb: "dry",
    maxDurationSec: 300,
    exclusive: true,
    ...overrides,
  };
}

class FakeTrack {
  stopped = false;
  stop(): void { this.stopped = true; }
}

class FakeMediaStream {
  readonly tracks = [new FakeTrack(), new FakeTrack()];
  getTracks(): FakeTrack[] { return this.tracks; }
}

class FakeMediaRecorder {
  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(
    readonly stream: unknown,
    readonly mimeType: string,
  ) {}

  start(): void {
    this.state = "recording";
  }

  stop(): void {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["x".repeat(320)]) });
    this.onstop?.();
  }
}

class FakeBuffer {
  readonly numberOfChannels = 2;
  private readonly data: Float32Array[];

  constructor(length: number) {
    this.data = [new Float32Array(length), new Float32Array(length)];
  }

  getChannelData(channel: number): Float32Array {
    return this.data[channel] ?? new Float32Array(0);
  }
}

class FakeAudioContext {
  readonly sampleRate = 48_000;
  convolverCount = 0;
  destinationStream = new FakeMediaStream();
  closed = false;

  createBuffer(_channels: number, length: number): FakeBuffer {
    return new FakeBuffer(length);
  }

  createMediaStreamSource(_stream: unknown): { connect: (node: unknown) => void } {
    return { connect: () => undefined };
  }

  createGain(): { gain: { value: number }; connect: (node: unknown) => void } {
    return { gain: { value: 1 }, connect: () => undefined };
  }

  createConvolver(): { buffer: unknown; connect: (node: unknown) => void } {
    this.convolverCount += 1;
    return { buffer: null, connect: () => undefined };
  }

  createMediaStreamDestination(): { stream: FakeMediaStream } {
    return { stream: this.destinationStream };
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }
}

function makeDriver(overrides: Partial<StudioMediaRecorderBoothDriverOptions> = {}) {
  const micStream = new FakeMediaStream();
  const recorders: FakeMediaRecorder[] = [];
  let now = 1_000_000;
  const contexts: FakeAudioContext[] = [];
  const driver = createMediaRecorderBoothDriver({
    now: () => now,
    getUserMedia: () => Promise.resolve(micStream as unknown as MediaStream),
    isTypeSupported: (mime) => mime.includes("webm"),
    createRecorder: (stream, mimeType) => {
      const recorder = new FakeMediaRecorder(stream, mimeType);
      recorders.push(recorder);
      return recorder as unknown as MediaRecorder;
    },
    createAudioContext: () => {
      const context = new FakeAudioContext();
      contexts.push(context);
      return context as unknown as AudioContext;
    },
    ...overrides,
  });
  return {
    driver,
    micStream,
    recorders,
    contexts,
    advance: (ms: number) => { now += ms; },
  };
}

describe("MIME 선택", () => {
  it("opus webm을 우선하고, 없으면 webm, 둘 다 없으면 null", () => {
    expect(pickBoothRecordingMimeType(() => true)).toBe("audio/webm;codecs=opus");
    expect(pickBoothRecordingMimeType((mime) => mime === "audio/webm")).toBe("audio/webm");
    expect(pickBoothRecordingMimeType(() => false)).toBeNull();
  });
});

describe("반향 임펄스", () => {
  it("감쇠 시간만큼의 스테레오 버퍼를 만들고 끝으로 갈수록 작아진다", () => {
    const context = new FakeAudioContext();
    const buffer = createReverbImpulseBuffer(context as unknown as BaseAudioContext, 2.2);
    expect(buffer.numberOfChannels).toBe(2);
    const data = buffer.getChannelData(0);
    expect(data.length).toBe(Math.floor(48_000 * 2.2));
    const headMax = Math.max(...[...data.slice(0, 200)].map(Math.abs));
    const tailMax = Math.max(...[...data.slice(-200)].map(Math.abs));
    expect(headMax).toBeGreaterThan(tailMax);
    expect(tailMax).toBeLessThan(0.05);
  });
});

describe("MediaRecorder 드라이버", () => {
  it("시작→중지로 WebM 테이크와 Blob을 만든다", async () => {
    const { driver, advance } = makeDriver();
    const session = await driver.startBoothSession(config());
    expect(session.boothId).toBe("booth-a");
    advance(30_000);
    const { take, blob } = await driver.stopBoothSessionWithBlob(session.id);
    expect(take.mimeType).toBe("audio/webm");
    expect(take.durationSec).toBe(30);
    expect(blob.size).toBeGreaterThan(0);
    expect(take.estimatedBytes).toBe(blob.size);
  });

  it("최대 시간을 넘기면 길이를 잘라낸다", async () => {
    const { driver, advance } = makeDriver();
    const session = await driver.startBoothSession(config({ maxDurationSec: 60 }));
    advance(600_000);
    const take = await driver.stopBoothSession(session.id);
    expect(take.durationSec).toBe(60);
  });

  it("없는 세션 중지는 예외를 던진다", async () => {
    const { driver } = makeDriver();
    await expect(driver.stopBoothSession("nope")).rejects.toThrow("세션을 찾을 수 없다");
  });

  it("녹음 중 중복 시작은 already-recording 코드로 실패한다", async () => {
    const { driver } = makeDriver();
    await driver.startBoothSession(config());
    let failure: unknown;
    try {
      await driver.startBoothSession(config());
    } catch (reason: unknown) {
      failure = reason;
    }
    expect(failure).toBeInstanceOf(StudioBoothMediaError);
    expect((failure as StudioBoothMediaError).code).toBe("already-recording");
  });

  it("마이크 권한 거부는 mic-permission-denied 코드로 실패한다", async () => {
    const { driver } = makeDriver({
      getUserMedia: () => Promise.reject(new DOMException("denied", "NotAllowedError")),
    });
    let failure: unknown;
    try {
      await driver.startBoothSession(config());
    } catch (reason: unknown) {
      failure = reason;
    }
    expect(failure).toBeInstanceOf(StudioBoothMediaError);
    expect((failure as StudioBoothMediaError).code).toBe("mic-permission-denied");
  });

  it("WebM 미지원이면 recorder-unsupported이고 마이크 트랙을 정리한다", async () => {
    const { driver, micStream } = makeDriver({ isTypeSupported: () => false });
    let failure: unknown;
    try {
      await driver.startBoothSession(config());
    } catch (reason: unknown) {
      failure = reason;
    }
    expect(failure).toBeInstanceOf(StudioBoothMediaError);
    expect((failure as StudioBoothMediaError).code).toBe("recorder-unsupported");
    expect(micStream.tracks.every((track) => track.stopped)).toBe(true);
  });

  it("취소하면 마이크가 정리되고 세션을 중지할 수 없다", async () => {
    const { driver, micStream } = makeDriver();
    const session = await driver.startBoothSession(config());
    await driver.cancelBoothSession(session.id);
    expect(micStream.tracks.every((track) => track.stopped)).toBe(true);
    await expect(driver.stopBoothSession(session.id)).rejects.toThrow("세션을 찾을 수 없다");
  });

  it("드라이 프리셋은 AudioContext 없이 원본 스트림으로 녹음한다", async () => {
    const { driver, micStream, recorders, contexts } = makeDriver();
    await driver.startBoothSession(config({ reverb: "dry" }));
    expect(contexts).toHaveLength(0);
    expect(recorders[0]?.stream).toBe(micStream);
  });

  it("홀 프리셋은 컨볼버를 거친 스트림으로 녹음하고 종료 시 컨텍스트를 닫는다", async () => {
    const { driver, recorders, contexts } = makeDriver();
    const session = await driver.startBoothSession(config({ reverb: "hall" }));
    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.convolverCount).toBe(1);
    expect(recorders[0]?.stream).toBe(contexts[0]?.destinationStream);
    await driver.stopBoothSession(session.id);
    expect(contexts[0]?.closed).toBe(true);
  });
});
