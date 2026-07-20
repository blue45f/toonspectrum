import "reflect-metadata";

import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ZodValidationPipe } from "../../common/zod-validation.pipe";

import {
  STUDIO_REMOTE_REFERENCE_MAX_ACTIVE_DELIVERIES,
  StudioRemoteReferenceImageDeliveryLimiter,
} from "./studio-remote-reference-image-delivery";
import { StudioRemoteReferenceImageController } from "./studio-remote-reference-image.controller";
import { StudioRemoteReferenceImageService } from "./studio-remote-reference-image.service";

import type { INestApplication } from "@nestjs/common";
import type { AddressInfo } from "node:net";

const importedImage = {
  version: 1 as const,
  mediaType: "image/png" as const,
  byteLength: 1,
  width: 1,
  height: 1,
  decodedRgbaBytes: 4,
  sha256: "a".repeat(64),
  dataUrl: "data:image/png;base64,AA==",
};

const service = {
  importRemoteImage: vi.fn().mockResolvedValue(importedImage),
};
const deliveryLimiter = new StudioRemoteReferenceImageDeliveryLimiter();

@Module({
  controllers: [StudioRemoteReferenceImageController],
  providers: [
    { provide: StudioRemoteReferenceImageService, useValue: service },
    { provide: StudioRemoteReferenceImageDeliveryLimiter, useValue: deliveryLimiter },
  ],
})
class StudioRemoteReferenceImageTestModule {}

describe("StudioRemoteReferenceImageController HTTP boundary", () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await NestFactory.create(StudioRemoteReferenceImageTestModule, { logger: false });
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ZodValidationPipe());
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    service.importRemoteImage.mockReset().mockResolvedValue(importedImage);
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires an authenticated session identity before invoking the importer", async () => {
    const result = await fetch(`${baseUrl}/api/creator/reference-images/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://images.example.org/reference.png" }),
    });
    expect(result.status).toBe(401);
    expect(service.importRemoteImage).not.toHaveBeenCalled();
  });

  it("validates the URL and emits private no-store privacy headers", async () => {
    service.importRemoteImage.mockImplementationOnce(async () => {
      expect(deliveryLimiter.activeCount).toBe(1);
      return importedImage;
    });
    const result = await fetch(`${baseUrl}/api/creator/reference-images/import`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": "verified-user",
      },
      body: JSON.stringify({ url: "https://images.example.org/reference.png" }),
    });
    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toEqual(importedImage);
    expect(result.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(result.headers.get("pragma")).toBe("no-cache");
    expect(result.headers.get("x-content-type-options")).toBe("nosniff");
    expect(result.headers.get("referrer-policy")).toBe("no-referrer");
    expect(service.importRemoteImage).toHaveBeenCalledWith(
      "verified-user",
      "https://images.example.org/reference.png",
      expect.any(AbortSignal)
    );
    await vi.waitFor(() => expect(deliveryLimiter.activeCount).toBe(0));
  });

  it("rejects nonstandard ports and foreign fields before service access", async () => {
    const result = await fetch(`${baseUrl}/api/creator/reference-images/import`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": "verified-user",
      },
      body: JSON.stringify({
        url: "https://images.example.org:8443/reference.png",
        cookie: "do-not-forward",
      }),
    });
    expect(result.status).toBe(400);
    expect(service.importRemoteImage).not.toHaveBeenCalled();
  });

  it("cancels a delivery-lease waiter when the HTTP client disconnects", async () => {
    const heldLeases = await Promise.all(Array.from(
      { length: STUDIO_REMOTE_REFERENCE_MAX_ACTIVE_DELIVERIES },
      () => deliveryLimiter.acquire(new AbortController().signal)
    ));
    const clientController = new AbortController();
    try {
      const request = fetch(`${baseUrl}/api/creator/reference-images/import`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "waiting-user",
        },
        body: JSON.stringify({ url: "https://images.example.org/reference.png" }),
        signal: clientController.signal,
      }).catch((error: unknown) => error);

      await vi.waitFor(() => expect(deliveryLimiter.pendingCount).toBe(1));
      clientController.abort();
      const error = await request;
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).name).toBe("AbortError");
      await vi.waitFor(() => expect(deliveryLimiter.pendingCount).toBe(0));
      expect(service.importRemoteImage).not.toHaveBeenCalled();
    } finally {
      for (const lease of heldLeases) lease.release();
    }
    expect(deliveryLimiter.activeCount).toBe(0);
  });
});
