import { describe, expect, it } from "vitest";

import { CANONICAL_ORIGIN, canonicalRedirect } from "./index";

describe("toonstudio apex canonical redirect", () => {
  it("preserves path and query while forcing the canonical origin", async () => {
    const response = canonicalRedirect(
      new Request(
        "https://toonstudio.cloud/production/projects/demo%20one?tab=review&mode=full",
      ),
    );

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://www.toonstudio.cloud/production/projects/demo%20one?tab=review&mode=full",
    );
    expect(response.headers.get("x-toonspectrum-canonical-origin")).toBe(
      CANONICAL_ORIGIN,
    );
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=3600",
    );
    expect(response.headers.get("strict-transport-security")).toContain(
      "includeSubDomains",
    );
    expect(await response.text()).toBe("");
  });

  it.each(["GET", "HEAD", "POST"])(
    "uses method-preserving 308 for %s requests",
    (method) => {
      const response = canonicalRedirect(
        new Request("https://toonstudio.cloud/studio", {
          method,
          body: method === "POST" ? "payload" : undefined,
        }),
      );
      expect(response.status).toBe(308);
      expect(response.headers.get("location")).toBe(
        "https://www.toonstudio.cloud/studio",
      );
    },
  );

  it("never reflects an untrusted host into the redirect target", () => {
    const response = canonicalRedirect(
      new Request("https://attacker.invalid/path?next=https://evil.invalid"),
    );
    const location = response.headers.get("location");
    expect(location).toBe(
      "https://www.toonstudio.cloud/path?next=https://evil.invalid",
    );
    expect(new URL(location ?? "").origin).toBe(CANONICAL_ORIGIN);
  });
});
