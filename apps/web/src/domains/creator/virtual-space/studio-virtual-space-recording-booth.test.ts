/**
 * 녹음부스 테스트 (Track 4 · 벤치마크 gap 2)
 */
import { describe, expect, it } from "vitest";

import {
  createScriptedRecordingBoothDriver,
  STUDIO_REVERB_PRESET_SPECS,
  STUDIO_REVERB_PRESETS,
  studioRecordingBoothContains,
  studioRecordingTakeToProjectAsset,
  validateStudioRecordingBoothConfig,
  type StudioRecordingBoothConfig,
} from "./studio-virtual-space-recording-booth";

function config(overrides: Partial<StudioRecordingBoothConfig> = {}): StudioRecordingBoothConfig {
  return {
    boothId: "booth-a",
    roomId: "recording-booth",
    zone: { x: 100, y: 100, width: 200, height: 160 },
    reverb: "room",
    maxDurationSec: 300,
    exclusive: true,
    ...overrides,
  };
}

describe("반향 프리셋", () => {
  it("3종 스펙이 정의되어 있다", () => {
    expect(STUDIO_REVERB_PRESETS).toEqual(["dry", "room", "hall"]);
    for (const preset of STUDIO_REVERB_PRESETS) {
      const spec = STUDIO_REVERB_PRESET_SPECS[preset];
      expect(spec.labelKo.trim().length).toBeGreaterThan(0);
      expect(spec.decaySec).toBeGreaterThan(0);
      expect(spec.wetLevel).toBeGreaterThanOrEqual(0);
      expect(spec.wetLevel).toBeLessThanOrEqual(1);
    }
  });

  it("드라이는 반향이 없고 홀은 가장 길다", () => {
    expect(STUDIO_REVERB_PRESET_SPECS.dry.wetLevel).toBe(0);
    expect(STUDIO_REVERB_PRESET_SPECS.hall.decaySec).toBeGreaterThan(STUDIO_REVERB_PRESET_SPECS.room.decaySec);
  });
});

describe("부스 설정 검증", () => {
  it("정상 설정은 통과한다", () => {
    expect(validateStudioRecordingBoothConfig(config())).toEqual([]);
  });

  it("빈 id·잘못된 zone·범위 밖 시간을 거부한다", () => {
    expect(validateStudioRecordingBoothConfig(config({ boothId: " " })).length).toBeGreaterThan(0);
    expect(validateStudioRecordingBoothConfig(config({ zone: { x: 0, y: 0, width: 0, height: 10 } }).length).toBeGreaterThan(0);
    expect(validateStudioRecordingBoothConfig(config({ maxDurationSec: 9999 }).length).toBeGreaterThan(0);
    expect(validateStudioRecordingBoothConfig(config({ reverb: "cave" as never }).length).toBeGreaterThan(0);
  });
});

describe("스크립트 드라이버", () => {
  it("세션 시작→중지로 테이크를 만든다", async () => {
    let now = 1_000_000;
    const driver = createScriptedRecordingBoothDriver(() => now);
    expect(driver.id).toBe("scripted");
    const session = await driver.startBoothSession(config());
    expect(session.boothId).toBe("booth-a");
    expect(session.reverb).toBe("room");
    now += 65_000;
    const take = await driver.stopBoothSession(session.id);
    expect(take.mimeType).toBe("audio/webm");
    expect(take.durationSec).toBe(65);
    expect(take.sessionId).toBe(session.id);
  });

  it("최대 시간을 초과하면 잘라낸다", async () => {
    let now = 1_000_000;
    const driver = createScriptedRecordingBoothDriver(() => now);
    const session = await driver.startBoothSession(config({ maxDurationSec: 60 }));
    now += 600_000;
    const take = await driver.stopBoothSession(session.id);
    expect(take.durationSec).toBe(60);
  });

  it("없는 세션 중지는 예외를 던진다", async () => {
    const driver = createScriptedRecordingBoothDriver();
    await expect(driver.stopBoothSession("nope")).rejects.toThrow();
  });

  it("취소한 세션은 중지할 수 없다", async () => {
    const driver = createScriptedRecordingBoothDriver();
    const session = await driver.startBoothSession(config());
    await driver.cancelBoothSession(session.id);
    await expect(driver.stopBoothSession(session.id)).rejects.toThrow();
  });

  it("잘못된 설정으로는 시작할 수 없다", async () => {
    const driver = createScriptedRecordingBoothDriver();
    await expect(driver.startBoothSession(config({ boothId: "" }))).rejects.toThrow();
  });
});

describe("테이크→프로젝트 에셋", () => {
  it("에셋 기술자를 만든다", async () => {
    const driver = createScriptedRecordingBoothDriver(() => 1_700_000_000_000);
    const session = await driver.startBoothSession(config());
    const take = await driver.stopBoothSession(session.id);
    const asset = studioRecordingTakeToProjectAsset(take, "project-1");
    expect(asset).toMatchObject({
      kind: "audio", projectId: "project-1", takeId: take.id,
      mimeType: "audio/webm", source: "recording-booth",
    });
    expect(asset.name).toContain("녹음부스 테이크");
  });

  it("빈 projectId는 예외를 던진다", () => {
    expect(() => studioRecordingTakeToProjectAsset({
      id: "t", sessionId: "s", boothId: "b", durationSec: 10,
      mimeType: "audio/webm", recordedAtMs: 0, estimatedBytes: 0,
    }, " ")).toThrow();
  });
});

describe("부스 구역 판정", () => {
  it("구역 안팎을 판정한다", () => {
    const booth = config();
    expect(studioRecordingBoothContains(booth, { x: 150, y: 150 })).toBe(true);
    expect(studioRecordingBoothContains(booth, { x: 50, y: 150 })).toBe(false);
  });
});
