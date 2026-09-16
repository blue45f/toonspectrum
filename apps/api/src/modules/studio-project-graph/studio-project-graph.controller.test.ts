import {
  BadRequestException,
  ForbiddenException,
  HttpException,
} from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  parseStudioIfMatch,
  StudioProjectGraphController,
} from "./studio-project-graph.controller";
import type { StudioProjectGraphService } from "./studio-project-graph.service";

const service = {
  listExternalFileBindings: vi.fn(),
  createExternalFileBinding: vi.fn(),
  updateExternalFileBinding: vi.fn(),
  removeExternalFileBinding: vi.fn(),
};

function controller(): StudioProjectGraphController {
  return new StudioProjectGraphController(
    service as unknown as StudioProjectGraphService,
  );
}

describe("Studio ProjectGraph controller boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("accepts one strong quoted revision identifier", () => {
    expect(parseStudioIfMatch('"revision-17"')).toBe("revision-17");
    expect(parseStudioIfMatch("revision-17")).toBe("revision-17");
  });

  it("rejects missing, weak, wildcard and list preconditions", () => {
    expect(() => parseStudioIfMatch(undefined)).toThrow(HttpException);
    expect(() => parseStudioIfMatch("W/\"revision-17\"")).toThrow(
      BadRequestException,
    );
    expect(() => parseStudioIfMatch("*")).toThrow(BadRequestException);
    expect(() => parseStudioIfMatch("revision-1, revision-2")).toThrow(
      BadRequestException,
    );
  });

  it("rejects unauthenticated external binding access before dispatch", () => {
    expect(() => controller().listExternalFileBindings(
      undefined,
      { artifactId: "artifact-1" },
    )).toThrow(ForbiddenException);
    expect(service.listExternalFileBindings).not.toHaveBeenCalled();
  });

  it("forwards cloud binding creation with exact project scope", () => {
    const body = {
      id: "binding-1",
      provider: "dropbox" as const,
      providerAccountId: "account-1",
      remoteFileId: "remote-1",
      displayPath: "/작품/1화.psd",
      syncMode: "bidirectional" as const,
    };
    service.createExternalFileBinding.mockReturnValue(body);

    expect(controller().createExternalFileBinding(
      " user-1 ",
      { artifactId: "artifact-1" },
      body,
    )).toEqual(body);
    expect(service.createExternalFileBinding).toHaveBeenCalledExactlyOnceWith(
      "user-1",
      "artifact-1",
      body,
    );
  });

  it("forwards sync checkpoint updates and explicit disconnection", () => {
    const patch = {
      lastSyncedRevisionId: "revision-2",
      lastSyncedAt: "2026-09-17T00:00:00.000Z",
    };
    controller().updateExternalFileBinding(
      "user-1",
      { bindingId: "binding-1" },
      patch,
    );
    controller().removeExternalFileBinding(
      "user-1",
      { bindingId: "binding-1" },
    );
    expect(service.updateExternalFileBinding).toHaveBeenCalledWith(
      "user-1",
      "binding-1",
      patch,
    );
    expect(service.removeExternalFileBinding).toHaveBeenCalledWith(
      "user-1",
      "binding-1",
    );
  });
});
