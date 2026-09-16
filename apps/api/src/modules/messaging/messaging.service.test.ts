import {
  ForbiddenException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import {
  MessagingForbiddenError,
  MessagingNotFoundError,
  MessagingRateLimitError,
  MessagingSchemaUnavailableError,
  MessagingVerificationError,
  type MessagingRepository,
} from "./messaging.repository";
import { MessagingService } from "./messaging.service";

const VALID_REQUEST = {
  recipientId: "member-b",
  category: "general" as const,
  text: "안녕하세요.",
  contextType: "profile" as const,
};

function createServiceRejecting(error: Error): MessagingService {
  const repository = {
    createRequest: vi.fn().mockRejectedValue(error),
  } as unknown as MessagingRepository;
  return new MessagingService(repository);
}

describe("MessagingService error boundaries", () => {
  it("maps request throttling to a structured 429 response", async () => {
    const service = createServiceRejecting(
      new MessagingRateLimitError("new_threads", 90),
    );

    const error = await service
      .createRequest("member-a", VALID_REQUEST)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect((error as HttpException).getResponse()).toMatchObject({
      retryAfterSeconds: 90,
      reason: "new_threads",
    });
  });

  it("maps blocked conversations to 403", async () => {
    const service = createServiceRejecting(
      new MessagingForbiddenError("blocked"),
    );

    await expect(
      service.createRequest("member-a", VALID_REQUEST),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("maps missing recipients to 404", async () => {
    const service = createServiceRejecting(
      new MessagingNotFoundError("user"),
    );

    await expect(
      service.createRequest("member-a", VALID_REQUEST),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("maps unavailable messaging tables to 503", async () => {
    const service = createServiceRejecting(
      new MessagingSchemaUnavailableError(),
    );

    await expect(
      service.createRequest("member-a", VALID_REQUEST),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("requires an email-verified or social account", async () => {
    const service = createServiceRejecting(
      new MessagingVerificationError(),
    );

    await expect(
      service.createRequest("member-a", VALID_REQUEST),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
