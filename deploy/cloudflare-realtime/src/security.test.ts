import { describe, expect, it } from "vitest";

import {
  hasForbiddenCredentialQuery,
  isAllowedRealtimeOrigin,
  normalizeRealtimeRoomObjectName,
  parseRealtimeRoomPath,
  resolveAllowedOrigins,
} from "./security";

describe("realtime request security", () => {
  it("allows exact configured toonstudio.cloud HTTPS origins", () => {
    const allowed = resolveAllowedOrigins(
      "https://toonstudio.cloud,https://app.toonstudio.cloud",
    );

    expect(
      isAllowedRealtimeOrigin("https://toonstudio.cloud", allowed),
    ).toBe(true);
    expect(
      isAllowedRealtimeOrigin("https://app.toonstudio.cloud", allowed),
    ).toBe(true);
  });

  it("rejects lookalike, insecure, path-bearing and unlisted origins", () => {
    expect(() =>
      resolveAllowedOrigins("https://toonstudio.cloud.evil.example"),
    ).toThrow(/exact HTTPS/u);
    expect(() =>
      resolveAllowedOrigins("http://toonstudio.cloud"),
    ).toThrow(/exact HTTPS/u);
    expect(() =>
      resolveAllowedOrigins("https://toonstudio.cloud/path"),
    ).toThrow(/exact HTTPS/u);

    const allowed = resolveAllowedOrigins(undefined);
    expect(
      isAllowedRealtimeOrigin("https://preview.toonstudio.cloud", allowed),
    ).toBe(false);
  });

  it("rejects credentials in URLs and parses only exact room paths", () => {
    expect(
      hasForbiddenCredentialQuery(
        new URL(
          "https://realtime.example/v1/rooms/work-1/room-1?ticket=secret",
        ),
      ),
    ).toBe(true);
    expect(
      hasForbiddenCredentialQuery(
        new URL(
          "https://realtime.example/v1/rooms/work-1/room-1?resume=4",
        ),
      ),
    ).toBe(false);
    expect(parseRealtimeRoomPath("/v1/rooms/work-1/room-1")).toEqual({
      workId: "work-1",
      roomId: "room-1",
    });
    expect(parseRealtimeRoomPath("/v1/rooms/work-1")).toBeNull();
    expect(
      parseRealtimeRoomPath("/v1/rooms/work-1/room-1/extra"),
    ).toBeNull();
    expect(
      parseRealtimeRoomPath("/v1/rooms/%2Fescape/room-1"),
    ).toBeNull();
  });

  it("normalizes the compound work and room Durable Object identity", () => {
    expect(
      normalizeRealtimeRoomObjectName({
        workId: "work-1",
        roomId: "room-1",
      }),
    ).toBe("work:work-1:room:room-1");
    expect(
      normalizeRealtimeRoomObjectName({
        workId: "work:edition",
        roomId: "room:review",
      }),
    ).toBe("work:work%3Aedition:room:room%3Areview");
  });
});
