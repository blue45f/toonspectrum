import { afterEach, describe, expect, it } from "vitest";

import {
  STUDIO_3D_INLINE_INPUT_MAX_BYTES,
  Studio3dGenerationService,
} from "./studio-3d-generation.service";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("Studio 3D inline request contract", () => {
  it("reports the same 10MB boundary enforced by the global JSON parser", () => {
    process.env.NODE_ENV = "test";
    delete process.env.DATABASE_URL;
    const status = new Studio3dGenerationService().status();
    expect(status).toMatchObject({
      inputTransport: "inline-json",
      maxInlineInputBytes: STUDIO_3D_INLINE_INPUT_MAX_BYTES,
      largerInputsRequireObjectStorage: true,
    });
  });

  it("rejects aggregate encoded input before provider dispatch", async () => {
    process.env.NODE_ENV = "test";
    delete process.env.DATABASE_URL;
    const service = new Studio3dGenerationService();
    const encoded = "A".repeat(
      Math.ceil(STUDIO_3D_INLINE_INPUT_MAX_BYTES * 4 / 3) + 129,
    );
    await expect(service.create(
      "user-1",
      "request-1",
      {
        mode: "image-to-3d",
        images: [{
          filename: "oversized.png",
          mimeType: "image/png",
          dataBase64: encoded,
        }],
        transport: "byok",
      },
      "fixture-provider-value",
    )).rejects.toThrow("10MB request budget");
  });
});
