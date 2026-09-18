import { describe, expect, it } from "vitest";

import {
  SUPPORTER_PAYMENT_MAX_WON,
  SUPPORTER_PAYMENT_MIN_WON,
  validateSupporterGoalAmount,
  validateSupporterPaymentCreateInput,
} from "./supporter-payment";

describe("supporter payment input", () => {
  it("accepts voluntary operating-cost support with granular public opt-in", () => {
    const result = validateSupporterPaymentCreateInput({
      amount: 10_000,
      supporterName: "희준",
      message: "무료 운영 응원합니다.",
      visibility: "name",
      showAmount: true,
      showMessage: true,
      acceptedTerms: true,
      website: "",
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.spam || !result.value) return;
    expect(result.value).toMatchObject({
      amount: 10_000,
      visibility: "name",
      showAmount: true,
      showMessage: true,
    });
  });
  it("forces anonymous support to keep name, amount, and message off the public wall", () => {
    const result = validateSupporterPaymentCreateInput({
      amount: 5_000,
      supporterName: "Should not persist",
      message: "private message",
      visibility: "anonymous",
      showAmount: true,
      showMessage: true,
      acceptedTerms: true,
      website: "",
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.spam || !result.value) return;
    expect(result.value.supporterName).toBe("");
    expect(result.value.showAmount).toBe(false);
    expect(result.value.showMessage).toBe(false);
    expect(result.value.message).toBe("private message");
  });

  it("rejects amounts outside the bounded KRW range and missing consent", () => {
    for (const amount of [
      SUPPORTER_PAYMENT_MIN_WON - 1,
      SUPPORTER_PAYMENT_MAX_WON + 1,
    ]) {
      expect(validateSupporterPaymentCreateInput({
        amount,
        visibility: "anonymous",
        acceptedTerms: true,
        website: "",
      }).ok).toBe(false);
    }
    expect(validateSupporterPaymentCreateInput({
      amount: 5_000,
      visibility: "anonymous",
      acceptedTerms: false,
      website: "",
    }).ok).toBe(false);
  });

  it("treats the hidden website field as a bot honeypot", () => {
    expect(validateSupporterPaymentCreateInput({
      amount: 5_000,
      visibility: "anonymous",
      acceptedTerms: true,
      website: "https://spam.invalid",
    })).toEqual({ ok: true, spam: true, value: null });
  });

  it("keeps the public monthly goal bounded and allows zero to hide it", () => {
    expect(validateSupporterGoalAmount(0)).toBe(0);
    expect(validateSupporterGoalAmount(300_000)).toBe(300_000);
    expect(validateSupporterGoalAmount(-1)).toBeNull();
    expect(validateSupporterGoalAmount(100_000_001)).toBeNull();
  });
});
