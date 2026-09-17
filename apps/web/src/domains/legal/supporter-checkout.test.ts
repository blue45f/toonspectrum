import { describe, expect, it } from "vitest";

import { resolveSupporterCheckout } from "./supporter-checkout";

describe("resolveSupporterCheckout", () => {
  it("stays disabled unless checkout is explicitly enabled", () => {
    expect(resolveSupporterCheckout({
      VITE_SUPPORTER_HOSTED_CHECKOUT_URL: "https://checkout.example/supporter",
    })).toEqual({ mode: "disabled", reason: "disabled" });
  });

  it("requires a URL after the explicit enable switch", () => {
    expect(resolveSupporterCheckout({
      VITE_SUPPORTER_HOSTED_CHECKOUT_ENABLED: "true",
    })).toEqual({ mode: "disabled", reason: "missing-url" });
  });

  it("accepts an HTTPS provider-hosted checkout", () => {
    expect(resolveSupporterCheckout({
      VITE_SUPPORTER_HOSTED_CHECKOUT_ENABLED: "true",
      VITE_SUPPORTER_HOSTED_CHECKOUT_URL: " https://checkout.example/supporter?product=membership ",
    })).toEqual({
      mode: "hosted",
      url: "https://checkout.example/supporter?product=membership",
    });
  });

  it.each([
    "http://checkout.example/supporter",
    "javascript:alert(1)",
    "https://user:secret@checkout.example/supporter",
    "not-a-url",
  ])("rejects unsafe hosted checkout URL %s", (url) => {
    expect(resolveSupporterCheckout({
      VITE_SUPPORTER_HOSTED_CHECKOUT_ENABLED: "true",
      VITE_SUPPORTER_HOSTED_CHECKOUT_URL: url,
    })).toEqual({ mode: "disabled", reason: "invalid-url" });
  });
});
