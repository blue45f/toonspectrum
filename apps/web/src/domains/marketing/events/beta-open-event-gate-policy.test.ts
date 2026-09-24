import { describe, expect, it } from "vitest";

import { betaOpenEventGateEligible } from "./beta-open-event-gate-policy";

describe("betaOpenEventGateEligible", () => {
  it("keeps the public product orientation screen unobstructed", () => {
    expect(betaOpenEventGateEligible("/")).toBe(false);
  });

  it("does not cover the event directory or event detail itself", () => {
    expect(betaOpenEventGateEligible("/events")).toBe(false);
    expect(betaOpenEventGateEligible("/events/beta-open")).toBe(false);
  });

  it("can still surface the campaign from a public discovery page", () => {
    expect(betaOpenEventGateEligible("/discover")).toBe(true);
  });

  it("never interrupts private creation workflows", () => {
    expect(betaOpenEventGateEligible("/home")).toBe(false);
    expect(betaOpenEventGateEligible("/studio/space")).toBe(false);
  });
});
