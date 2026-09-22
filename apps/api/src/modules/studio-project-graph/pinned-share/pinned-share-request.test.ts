import { expect, it } from "vitest";
import type { Request } from "express";
import { TOONSPECTRUM_CSRF_HEADER, TOONSPECTRUM_CSRF_HEADER_VALUE } from "@toonspectrum/contracts/security/csrf";
import { requirePinnedShareBrowserOrigin, limitPinnedShareRequest } from "./pinned-share-request";

function request(headers: Record<string, string> = {}, ip = "192.0.2.1") { return { headers, ip } as unknown as Request; }
it("admits explicit same-origin proof without borrowing a user cookie", () => {
  expect(() => requirePinnedShareBrowserOrigin(request({ host: "www.toonstudio.cloud", origin: "https://www.toonstudio.cloud", [TOONSPECTRUM_CSRF_HEADER]: TOONSPECTRUM_CSRF_HEADER_VALUE }))).not.toThrow();
});
it("admits a same-origin fetch metadata proof only with the non-safelisted application header", () => {
  expect(() => requirePinnedShareBrowserOrigin(request({ "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", [TOONSPECTRUM_CSRF_HEADER]: TOONSPECTRUM_CSRF_HEADER_VALUE }))).not.toThrow();
});
it.each([{},{ origin: "https://hostile.invalid", host: "www.toonstudio.cloud", [TOONSPECTRUM_CSRF_HEADER]: TOONSPECTRUM_CSRF_HEADER_VALUE },
  { "sec-fetch-site": "cross-site", "sec-fetch-mode": "cors", [TOONSPECTRUM_CSRF_HEADER]: TOONSPECTRUM_CSRF_HEADER_VALUE },
  { host: "www.toonstudio.cloud", origin: "https://www.toonstudio.cloud" }])("rejects a missing or foreign browser proof", (headers) => {
  expect(() => requirePinnedShareBrowserOrigin(request(headers as Record<string, string>))).toThrow();
});
it("bounds guest image requests by both source and capability without retaining the raw token", () => {
  const req = request({}, "192.0.2.91"), key = "fixture-capability";
  for (let i=0; i<40; i++) limitPinnedShareRequest(req, "image", key);
  expect(() => limitPinnedShareRequest(req, "image", key)).toThrow();
  expect(() => limitPinnedShareRequest(request({}, "192.0.2.92"), "image", key)).toThrow();
});
