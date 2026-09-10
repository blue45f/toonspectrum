import { afterEach, describe, expect, it, vi } from "vitest";

import { createSecureRandomUuid } from "./secure-random-id";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("createSecureRandomUuid", () => {
  it("prefers the platform randomUUID implementation", () => {
    const randomUUID = vi.fn(() => "123e4567-e89b-42d3-a456-426614174000");
    const getRandomValues = vi.fn();
    vi.stubGlobal("crypto", { randomUUID, getRandomValues });
    expect(createSecureRandomUuid()).toBe(
      "123e4567-e89b-42d3-a456-426614174000",
    );
    expect(randomUUID).toHaveBeenCalledOnce();
    expect(getRandomValues).not.toHaveBeenCalled();
  });

  it.each(["missing", "throws"] as const)(
    "uses secure bytes when randomUUID %s",
    (mode) => {
      const random = vi.spyOn(Math, "random").mockImplementation(() => {
        throw new Error("insecure randomness must not issue IDs");
      });
      const getRandomValues = vi.fn((bytes: Uint8Array) => {
        bytes.fill(0xab);
        return bytes;
      });
      vi.stubGlobal("crypto", {
        ...(mode === "throws"
          ? { randomUUID: () => { throw new Error("UUID unavailable"); } }
          : {}),
        getRandomValues,
      });
      expect(createSecureRandomUuid()).toBe(
        "abababab-abab-4bab-abab-abababababab",
      );
      expect(getRandomValues).toHaveBeenCalledOnce();
      expect(random).not.toHaveBeenCalled();
    },
  );

  it("fails closed without secure entropy", () => {
    const random = vi.spyOn(Math, "random");
    vi.stubGlobal("crypto", undefined);
    expect(() => createSecureRandomUuid("secure ID unavailable")).toThrow(
      "secure ID unavailable",
    );
    expect(random).not.toHaveBeenCalled();
  });

  it("fails closed when the secure byte provider throws", () => {
    vi.stubGlobal("crypto", {
      randomUUID: () => { throw new Error("UUID unavailable"); },
      getRandomValues: () => { throw new Error("entropy unavailable"); },
    });
    expect(() => createSecureRandomUuid("secure ID unavailable")).toThrow(
      "secure ID unavailable",
    );
  });
});
