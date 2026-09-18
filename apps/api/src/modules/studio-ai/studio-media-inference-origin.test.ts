import { describe, expect, it } from "vitest";

import { allowedInferenceOrigin } from "./studio-media-inference.service";

describe("managed cloud media inference origin", () => {
  it("accepts only a public HTTPS origin", () => {
    expect(allowedInferenceOrigin("https://gpu-runtime.example.com/"))
      .toBe("https://gpu-runtime.example.com");
    for (const value of [
      "http://gpu-runtime.example.com/",
      "http://127.0.0.1:8188/",
      "https://localhost:8188/",
      "https://192.168.1.50/",
      "https://runtime.local/",
      // secretlint-disable-next-line @secretlint/secretlint-rule-basicauth -- synthetic URL-userinfo rejection fixture
      "https://user:secret@gpu-runtime.example.com/",
      "https://gpu-runtime.example.com/path",
      "https://gpu-runtime.example.com/?token=secret",
    ]) {
      expect(() => allowedInferenceOrigin(value)).toThrow(/managed-cloud HTTPS origin/u);
    }
  });
});
