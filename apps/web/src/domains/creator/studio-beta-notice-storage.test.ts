import { describe, expect, it } from "vitest";

import {
  acknowledgeStudioBetaNotice,
  hasAcknowledgedStudioBetaNotice,
  STUDIO_BETA_NOTICE_REVISION,
  STUDIO_BETA_NOTICE_STORAGE_KEY,
} from "./studio-beta-notice-storage";

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) {
    values.set(STUDIO_BETA_NOTICE_STORAGE_KEY, initial);
  }
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("studio beta notice storage", () => {
  it("acknowledges only the current notice revision", () => {
    const storage = memoryStorage();

    expect(hasAcknowledgedStudioBetaNotice(() => storage)).toBe(false);
    acknowledgeStudioBetaNotice(() => storage);

    expect(hasAcknowledgedStudioBetaNotice(() => storage)).toBe(true);
    expect(storage.getItem(STUDIO_BETA_NOTICE_STORAGE_KEY)).toBe(
      STUDIO_BETA_NOTICE_REVISION,
    );
  });

  it("shows a new revision after an older acknowledgement", () => {
    const storage = memoryStorage("2026-01-01-old-copy");
    expect(hasAcknowledgedStudioBetaNotice(() => storage)).toBe(false);
  });

  it("fails safely when browser storage is unavailable", () => {
    const blocked = () => {
      throw new DOMException("Denied", "SecurityError");
    };

    expect(hasAcknowledgedStudioBetaNotice(blocked)).toBe(false);
    expect(() => acknowledgeStudioBetaNotice(blocked)).not.toThrow();
  });
});
