import { describe, expect, it } from "vitest";

import { createDetectedRegionSettings, patchRegionSettings } from "@/shared/lib/region-settings";

import {
  planRegionSettingsSync,
  readLocalRegionSettings,
  writeLocalRegionSettings,
} from "./region-settings-client";

function memoryStorage() {
  let value: string | null = null;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => { value = next; },
  };
}

const base = createDetectedRegionSettings({
  language: "ko",
  locale: "ko-KR",
  timezone: "Asia/Seoul",
  now: new Date("2026-09-18T00:00:00.000Z"),
});

describe("region settings client sync", () => {
  it("round-trips valid local preferences", () => {
    const storage = memoryStorage();
    writeLocalRegionSettings(base, storage);
    expect(readLocalRegionSettings(storage)).toEqual(base);
  });

  it("pushes a newer guest preference after login", () => {
    const remote = patchRegionSettings(
      base,
      { currency: "USD" },
      new Date("2026-09-18T00:30:00.000Z"),
    );
    const local = patchRegionSettings(
      base,
      { timezone: "Asia/Tokyo" },
      new Date("2026-09-18T01:00:00.000Z"),
    );
    const plan = planRegionSettingsSync({ local, remote, detected: base });
    expect(plan.settings).toEqual(local);
    expect(plan.shouldWriteLocal).toBe(false);
    expect(plan.shouldPushRemote).toBe(true);
  });

  it("pulls a newer server preference onto the device", () => {
    const remote = patchRegionSettings(
      base,
      { language: "ja" },
      new Date("2026-09-18T02:00:00.000Z"),
    );
    const plan = planRegionSettingsSync({
      local: base,
      remote,
      detected: base,
    });
    expect(plan.settings).toEqual(remote);
    expect(plan.shouldWriteLocal).toBe(true);
    expect(plan.shouldPushRemote).toBe(false);
  });

  it("initializes a canonical profile from detected settings", () => {
    const plan = planRegionSettingsSync({
      local: null,
      remote: null,
      detected: base,
    });
    expect(plan.settings).toEqual(base);
    expect(plan.shouldWriteLocal).toBe(true);
    expect(plan.shouldPushRemote).toBe(true);
  });
});
