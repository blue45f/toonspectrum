import { describe, expect, it } from "vitest";

import {
  createStudioAiComicDirectorId,
  type StudioAiComicDirectorCrypto,
} from "./studio-ai-comic-director-id";

function secureBytes(
  fill: (bytes: Uint8Array) => void,
): Crypto["getRandomValues"] {
  return ((view: ArrayBufferView) => {
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    fill(bytes);
    return view;
  }) as Crypto["getRandomValues"];
}

describe("createStudioAiComicDirectorId", () => {
  it("prefers a secure random UUID", () => {
    const cryptoApi: StudioAiComicDirectorCrypto = {
      randomUUID: () => "00000000-0000-4000-8000-000000000001",
    };
    expect(createStudioAiComicDirectorId("comic", cryptoApi)).toBe(
      "00000000-0000-4000-8000-000000000001",
    );
  });

  it("uses secure random bytes when randomUUID is unavailable", () => {
    const cryptoApi: StudioAiComicDirectorCrypto = {
      getRandomValues: secureBytes((bytes) => {
        bytes.forEach((_, index) => {
          bytes[index] = index;
        });
      }),
    };
    expect(createStudioAiComicDirectorId("comic session", cryptoApi)).toBe(
      "comic-session-000102030405060708090a0b0c0d0e0f",
    );
  });

  it("uses secure random bytes when an embedded randomUUID call fails", () => {
    const cryptoApi: StudioAiComicDirectorCrypto = {
      randomUUID: () => {
        throw new Error("embedded browser rejection");
      },
      getRandomValues: secureBytes((bytes) => bytes.fill(255)),
    };
    expect(createStudioAiComicDirectorId("comic", cryptoApi)).toBe(
      `comic-${"ff".repeat(16)}`,
    );
  });

  it("fails closed when no secure randomness exists", () => {
    expect(() => createStudioAiComicDirectorId("comic", {})).toThrow(
      "Web Crypto randomness is required",
    );
  });
});
