import { HttpException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LegalController } from "./legal.controller";

const policy = {
  body: "QA fixture policy",
  contentHash: "qa-fixture",
  versionLabel: "qa-fixture-v1",
};

function mockFetch(implementation: typeof fetch) {
  const mock = vi.fn(implementation);
  vi.stubGlobal("fetch", mock);
  return mock;
}

async function expectHttpError(promise: Promise<unknown>, status: number, error: string) {
  await expect(promise).rejects.toBeInstanceOf(HttpException);
  await expect(promise).rejects.toMatchObject({
    status,
    response: { error },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("LegalController upstream response handling", () => {
  it.each(["terms-of-service", "privacy-policy"])("returns valid %s JSON", async (slug) => {
    const fetchMock = mockFetch(async () => Response.json(policy));
    await expect(new LegalController().getPolicy(slug)).resolves.toEqual(policy);
    expect(fetchMock).toHaveBeenCalledWith(
      `https://termsdesk.vercel.app/api/public/toonspectrum/policies/${slug}`,
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
  });

  it("rejects unknown slugs without fetching upstream", async () => {
    const fetchMock = mockFetch(async () => Response.json(policy));
    await expectHttpError(new LegalController().getPolicy("../../private"), 404, "policy_not_found");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([404, 503])("maps upstream HTTP %s to 502", async (status) => {
    mockFetch(async () => new Response("upstream failure", { status }));
    await expectHttpError(new LegalController().getPolicy("terms-of-service"), 502, `policy_fetch_failed:${status}`);
  });

  it("maps fetch network failure to 502", async () => {
    mockFetch(async () => { throw new TypeError("Network unavailable"); });
    await expectHttpError(new LegalController().getPolicy("terms-of-service"), 502, "policy_fetch_failed");
  });

  it("maps timeout before headers to 502", async () => {
    mockFetch(async () => { throw new DOMException("Timeout", "TimeoutError"); });
    await expectHttpError(new LegalController().getPolicy("terms-of-service"), 502, "policy_fetch_failed");
  });

  it("maps JSON parsing failure after successful headers to 502", async () => {
    mockFetch(async () => new Response("<html>upstream error</html>", { status: 200 }));
    await expectHttpError(new LegalController().getPolicy("terms-of-service"), 502, "policy_fetch_failed");
  });

  it("maps interrupted response body to 502", async () => {
    const response = Response.json(policy);
    vi.spyOn(response, "json").mockRejectedValue(new DOMException("Aborted body", "AbortError"));
    mockFetch(async () => response);
    await expectHttpError(new LegalController().getPolicy("terms-of-service"), 502, "policy_fetch_failed");
  });
});
