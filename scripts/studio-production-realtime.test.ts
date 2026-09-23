import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

import { loadEnv } from "vite";
import { describe, expect, it } from "vitest";

import { resolveStudioLiveSocketRuntimeEndpoint } from "../apps/web/src/domains/creator/live/studio-live-socket-endpoint";

const root = fileURLToPath(new URL("../", import.meta.url));
const configuration = parseEnv(readFileSync(new URL("../.env.production", import.meta.url), "utf8"));

describe("production Studio browser configuration", () => {
  it("commits only the approved public browser settings, never a server credential", () => {
    expect(Object.keys(configuration).sort()).toEqual([
      "VITE_STUDIO_AUTOMERGE_OFFLINE_BRANCH", "VITE_STUDIO_LIVE_ORIGIN",
      "VITE_STUDIO_REALTIME_ORIGIN", "VITE_STUDIO_REALTIME_PROVIDER_ID",
    ]);
    expect(readFileSync(new URL("../.gitignore", import.meta.url), "utf8")).toMatch(/^!\.env\.production$/mu);
  });
  it("loads the explicit verified Render gateway into production Vite builds", () => {
    const environment = loadEnv("production", root, "VITE_STUDIO_");
    expect(environment.VITE_STUDIO_LIVE_ORIGIN).toBe("https://www.toonstudio.cloud");
    expect(resolveStudioLiveSocketRuntimeEndpoint({
      explicitOrigin: environment.VITE_STUDIO_LIVE_ORIGIN,
      locationOrigin: "https://www.toonstudio.cloud", development: false,
    })).toBe("https://www.toonstudio.cloud/studio-live");
  });
  it("enables the reviewed Automerge offline proposal branch in production builds", () => {
    const environment = loadEnv("production", root, "VITE_STUDIO_");
    expect(configuration.VITE_STUDIO_AUTOMERGE_OFFLINE_BRANCH).toBe("true");
    expect(environment.VITE_STUDIO_AUTOMERGE_OFFLINE_BRANCH).toBe("true");
  });
  it("keeps the custom Worker protocol separate from the Socket.IO gateway", () => {
    expect(configuration.VITE_STUDIO_REALTIME_ORIGIN).toBe("https://realtime.toonstudio.cloud");
    expect(configuration.VITE_STUDIO_REALTIME_PROVIDER_ID).toBe("cloudflare-realtime-v1");
    expect(configuration.VITE_STUDIO_REALTIME_ORIGIN).not.toBe(configuration.VITE_STUDIO_LIVE_ORIGIN);
    const config = JSON.parse(readFileSync(new URL("../deploy/cloudflare-static/wrangler.jsonc", import.meta.url), "utf8"));
    expect(config.assets.run_worker_first).toContain("/socket.io");
    expect(config.assets.run_worker_first).toContain("/socket.io/*");
  });
  it("does not infer production transport from an unconfigured development or test origin", () => {
    expect(resolveStudioLiveSocketRuntimeEndpoint({ locationOrigin: "http://127.0.0.1:5186", development: true })).toBeNull();
    expect(resolveStudioLiveSocketRuntimeEndpoint({ locationOrigin: "https://www.toonstudio.cloud", development: false })).toBeNull();
  });
});
