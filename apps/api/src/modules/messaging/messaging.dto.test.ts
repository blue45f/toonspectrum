import { describe, expect, it } from "vitest";

import {
  CreateMessageRequestSchema,
  SendMessageSchema,
} from "./messaging.dto";

describe("CreateMessageRequestSchema", () => {
  it("normalizes line endings and trims the first message", () => {
    const result = CreateMessageRequestSchema.parse({
      recipientId: "member-b",
      category: "feedback",
      text: "  첫 줄\r\n둘째 줄  ",
      contextType: "profile",
    });

    expect(result.text).toBe("첫 줄\n둘째 줄");
    expect(result.contextType).toBe("profile");
  });

  it.each(["HTTPS://example.com", "www.example.com"]) (
    "rejects external links in a first request: %s",
    (text) => {
      expect(() =>
        CreateMessageRequestSchema.parse({ recipientId: "member-b", text }),
      ).toThrow();
    },
  );

  it("rejects control characters", () => {
    expect(() =>
      CreateMessageRequestSchema.parse({
        recipientId: "member-b",
        text: "정상\u0000아님",
      }),
    ).toThrow();
  });

  it.each(["work", "project"] as const)(
    "requires a context id for %s requests",
    (contextType) => {
      expect(() =>
        CreateMessageRequestSchema.parse({
          recipientId: "member-b",
          text: "작품에 관해 문의드립니다.",
          contextType,
        }),
      ).toThrow();
    },
  );
});

describe("SendMessageSchema", () => {
  it("accepts a regular text message without a context id", () => {
    expect(
      SendMessageSchema.parse({ text: "안녕하세요." }),
    ).toMatchObject({ text: "안녕하세요.", type: "text" });
  });

  it.each(["work_card", "project_card"] as const)(
    "requires a context id for %s messages",
    (type) => {
      expect(() =>
        SendMessageSchema.parse({
          text: "관련 항목을 확인해 주세요.",
          type,
        }),
      ).toThrow();
    },
  );
});
