import { describe, expect, it } from "vitest";

import {
  PRODUCT_TOUR_MAX_AUTOMATIC_RECOVERIES,
  canAutomaticallyRecoverProductTour,
  isExpectedMediaPlayRejection,
  productTourRecoveryLabel,
  productTourSourceForAttempt,
} from "./product-tour-media-recovery";

describe("product tour media recovery", () => {
  it("keeps the reviewed source stable until a recovery is required", () => {
    const source = "/brand/toonstudio-product-tour.mp4?v=release-hash";
    expect(productTourSourceForAttempt(source, 0)).toBe(source);
    expect(productTourSourceForAttempt(source, Number.NaN)).toBe(source);
    expect(productTourSourceForAttempt(source, 1)).toBe(
      "/brand/toonstudio-product-tour.mp4?v=release-hash&recovery=1",
    );
    expect(productTourSourceForAttempt(source, 2.9)).toContain("recovery=2");
  });

  it("caps automatic retries and waits for a network connection", () => {
    expect(canAutomaticallyRecoverProductTour(0, true)).toBe(true);
    expect(canAutomaticallyRecoverProductTour(PRODUCT_TOUR_MAX_AUTOMATIC_RECOVERIES - 1, true)).toBe(true);
    expect(canAutomaticallyRecoverProductTour(PRODUCT_TOUR_MAX_AUTOMATIC_RECOVERIES, true)).toBe(false);
    expect(canAutomaticallyRecoverProductTour(0, false)).toBe(false);
  });

  it("does not turn browser autoplay policy or an interrupted play promise into a video failure", () => {
    expect(isExpectedMediaPlayRejection(Object.assign(new Error(), { name: "AbortError" }))).toBe(true);
    expect(isExpectedMediaPlayRejection(Object.assign(new Error(), { name: "NotAllowedError" }))).toBe(true);
    expect(isExpectedMediaPlayRejection(new Error("decode"))).toBe(false);
  });

  it("provides localized recovery feedback", () => {
    expect(productTourRecoveryLabel("stall", "ko")).toContain("현재 위치");
    expect(productTourRecoveryLabel("network", "en")).toContain("stream");
  });
});
