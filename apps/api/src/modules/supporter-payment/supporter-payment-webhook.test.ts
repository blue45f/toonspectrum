import { describe, expect, it } from "vitest";

import { parseSupporterWebhookIdentity } from "./supporter-payment-webhook";

describe("supporter Toss webhook identity", () => {
  it("reads PAYMENT_STATUS_CHANGED payment identity from data", () => {
    expect(parseSupporterWebhookIdentity({
      eventType: "PAYMENT_STATUS_CHANGED",
      data: {
        orderId: "TS_SUPPORT_abcdef123456",
        paymentKey: "payment-key-1",
      },
    })).toEqual({
      orderId: "TS_SUPPORT_abcdef123456",
      paymentKey: "payment-key-1",
    });
  });

  it("reads DEPOSIT_CALLBACK order id from the top-level payload", () => {
    expect(parseSupporterWebhookIdentity({
      status: "DONE",
      transactionKey: "transaction-key",
      orderId: "TS_SUPPORT_abcdef123456",
    })).toEqual({
      orderId: "TS_SUPPORT_abcdef123456",
      paymentKey: "",
    });
  });

  it("rejects malformed or unrelated webhook bodies", () => {
    expect(parseSupporterWebhookIdentity({ eventType: "UNKNOWN" })).toBeNull();
    expect(parseSupporterWebhookIdentity({ orderId: "../../bad order" })).toBeNull();
  });
});
