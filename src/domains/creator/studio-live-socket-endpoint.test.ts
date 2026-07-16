import { describe, expect, it } from "vitest";

import { resolveStudioLiveSocketEndpoint } from "./studio-live-socket-endpoint";

describe("Studio live Socket.IO endpoint resolver", () => {
  it("keeps the same-origin namespace when no API base is configured", () => {
    expect(resolveStudioLiveSocketEndpoint({})).toBe("/studio-live");
    expect(
      resolveStudioLiveSocketEndpoint({ viteApiBase: "  ", runtimeApiBase: "" })
    ).toBe("/studio-live");
  });

  it("reuses only the Vite API origin for a cross-origin long-running Nest endpoint", () => {
    expect(
      resolveStudioLiveSocketEndpoint({
        viteApiBase: "https://api.toonspectrum.example/base/api?token=never#fragment",
        runtimeApiBase: "https://runtime-ignored.example",
      })
    ).toBe("https://api.toonspectrum.example/studio-live");
  });

  it("prioritizes the explicit long-running realtime origin over every HTTP API base", () => {
    expect(
      resolveStudioLiveSocketEndpoint({
        explicitOrigin: "https://realtime.toonspectrum.example/socket-host?ignored=yes",
        viteApiBase: "https://serverless.toonspectrum.example/api",
        runtimeApiBase: "https://runtime-api.toonspectrum.example/api",
      })
    ).toBe("https://realtime.toonspectrum.example/studio-live");
  });

  it("falls back to the runtime API base and resolves a relative shell base safely", () => {
    expect(
      resolveStudioLiveSocketEndpoint({
        runtimeApiBase: "https://runtime.toonspectrum.example/api",
      })
    ).toBe("https://runtime.toonspectrum.example/studio-live");
    expect(
      resolveStudioLiveSocketEndpoint({
        runtimeApiBase: "/api",
        locationOrigin: "https://shell.toonspectrum.example",
      })
    ).toBe("https://shell.toonspectrum.example/studio-live");
  });

  it("allows insecure Socket.IO only on loopback in development", () => {
    expect(
      resolveStudioLiveSocketEndpoint({
        explicitOrigin: "http://127.0.0.1:4001",
        allowInsecureLoopback: true,
      })
    ).toBe("http://127.0.0.1:4001/studio-live");
    expect(
      resolveStudioLiveSocketEndpoint({
        explicitOrigin: "http://localhost:4001",
        allowInsecureLoopback: false,
      })
    ).toBe("/studio-live");
    expect(
      resolveStudioLiveSocketEndpoint({
        explicitOrigin: "http://realtime.toonspectrum.example",
        allowInsecureLoopback: true,
      })
    ).toBe("/studio-live");
  });

  it.each([
    "javascript:alert(1)",
    "file:///tmp/socket",
    "http://api.toonspectrum.example",
    "https://user:secret@api.toonspectrum.example/api",
    "not a valid URL",
  ])("rejects an unsafe or malformed configured base: %s", (viteApiBase) => {
    expect(resolveStudioLiveSocketEndpoint({ viteApiBase })).toBe("/studio-live");
  });

  it("fails closed instead of falling through when the explicit override is unsafe", () => {
    expect(
      resolveStudioLiveSocketEndpoint({
        explicitOrigin: "https://artist:secret@realtime.example",
        viteApiBase: "https://api-fallback.example",
      })
    ).toBe("/studio-live");
  });
});
