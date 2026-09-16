import { beforeEach, describe, expect, it, vi } from "vitest";

import { messagingClient } from "./messaging-client";

const { apiDelete, apiGet, apiPatch, apiPost } = vi.hoisted(() => ({
  apiDelete: vi.fn(),
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
  apiPost: vi.fn(),
}));

vi.mock("@/infrastructure/api", () => ({
  api: {
    delete: apiDelete,
    get: apiGet,
    patch: apiPatch,
    post: apiPost,
  },
}));

describe("messagingClient", () => {
  beforeEach(() => {
    apiDelete.mockReset();
    apiGet.mockReset();
    apiPatch.mockReset();
    apiPost.mockReset();
  });

  it("encodes thread ids and pagination cursors", async () => {
    apiGet.mockResolvedValue({});
    await messagingClient.getThread("thread/한글", "message/1", 25);

    expect(apiGet).toHaveBeenCalledWith(
      "/messages/threads/thread%2F%ED%95%9C%EA%B8%80",
      { params: { before: "message/1", limit: 25 } },
    );
  });

  it("sends request-gated message payloads unchanged", async () => {
    apiPost.mockResolvedValue({});
    const input = {
      recipientId: "member-b",
      category: "collaboration" as const,
      text: "함께 작업하고 싶습니다.",
      contextType: "work" as const,
      contextId: "work-1",
      contextLabel: "작품",
    };

    await messagingClient.createRequest(input);

    expect(apiPost).toHaveBeenCalledWith("/messages/requests", input);
  });

  it("uses encoded paths for sending and reporting", async () => {
    apiPost.mockResolvedValue({});
    await messagingClient.sendMessage("thread/1", { text: "답장" });
    await messagingClient.reportMessage("message/1", "spam", "반복 발송");

    expect(apiPost).toHaveBeenNthCalledWith(
      1,
      "/messages/threads/thread%2F1/messages",
      { text: "답장" },
    );
    expect(apiPost).toHaveBeenNthCalledWith(
      2,
      "/messages/message%2F1/report",
      { reason: "spam", details: "반복 발송" },
    );
  });

  it("uses DELETE only for explicit unblock operations", async () => {
    apiDelete.mockResolvedValue({});
    await messagingClient.unblockUser("member/1");

    expect(apiDelete).toHaveBeenCalledWith(
      "/messages/blocks/member%2F1",
    );
  });
});
