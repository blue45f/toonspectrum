import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";

import { describe, expect, it } from "vitest";

import {
  createIsolatedMarketApiEnvironment,
  requireUnusedApiTarget,
  stopDetachedProcessTree,
  validateIsolatedMarketApiTarget,
} from "./isolated-market-api.mjs";

const DATABASE_URL =
  "postgresql://tester:secret@127.0.0.1:5432/toonspectrum_market_test";

describe("isolated market API target", () => {
  it("binds an explicit loopback API port to a named loopback test database", () => {
    expect(validateIsolatedMarketApiTarget({
      rawApiUrl: "http://127.0.0.1:43117",
      rawDatabaseUrl: DATABASE_URL,
      environment: { NODE_ENV: "test" },
    })).toMatchObject({
      apiOrigin: "http://127.0.0.1:43117",
      apiHost: "127.0.0.1",
      apiPort: 43117,
      databaseName: "toonspectrum_market_test",
      databaseUrl: DATABASE_URL,
    });
  });

  it("accepts an explicitly QA-scoped loopback database name", () => {
    expect(validateIsolatedMarketApiTarget({
      rawApiUrl: "http://127.0.0.1:43117",
      rawDatabaseUrl:
        "postgresql://tester:secret@127.0.0.1:5432/toonspectrum_market_qa_20260830",
      environment: { NODE_ENV: "test" },
    }).databaseName).toBe("toonspectrum_market_qa_20260830");
  });

  it("rejects implicit, privileged, credentialed, and non-loopback API origins", () => {
    for (const rawApiUrl of [
      "http://127.0.0.1",
      "http://127.0.0.1:80",
      "http://user:pass@127.0.0.1:43117",
      "http://localhost:43117",
      "http://[::1]:43117",
      "http://192.168.0.10:43117",
      "https://127.0.0.1:43117",
    ]) {
      expect(() => validateIsolatedMarketApiTarget({
        rawApiUrl,
        rawDatabaseUrl: DATABASE_URL,
        environment: { NODE_ENV: "test" },
      })).toThrow();
    }
  });

  it("rejects non-test, remote, or production database targets", () => {
    expect(() => validateIsolatedMarketApiTarget({
      rawApiUrl: "http://127.0.0.1:43117",
      rawDatabaseUrl: "postgresql://tester:secret@127.0.0.1:5432/toonspectrum",
      environment: { NODE_ENV: "test" },
    })).toThrow(/test- or QA-scoped/u);
    expect(() => validateIsolatedMarketApiTarget({
      rawApiUrl: "http://127.0.0.1:43117",
      rawDatabaseUrl: "postgresql://tester:secret@db.example.com:5432/toonspectrum_market_test",
      environment: { NODE_ENV: "test" },
    })).toThrow(/Remote PostgreSQL targets/u);
    expect(() => validateIsolatedMarketApiTarget({
      rawApiUrl: "http://127.0.0.1:43117",
      rawDatabaseUrl: DATABASE_URL,
      environment: { NODE_ENV: "production" },
    })).toThrow(/production runtime/u);
  });

  it("fails closed when any process already owns the selected TCP port", async () => {
    const server = createServer((socket) => socket.destroy());
    await new Promise((resolvePromise, rejectPromise) => {
      server.once("error", rejectPromise);
      server.listen(0, "127.0.0.1", resolvePromise);
    });

    try {
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("Expected a TCP address for the occupied-port fixture.");
      }
      await expect(requireUnusedApiTarget({
        apiOrigin: `http://127.0.0.1:${address.port}`,
        apiPort: address.port,
      })).rejects.toThrow(/already in use/u);
    } finally {
      await new Promise((resolvePromise, rejectPromise) => {
        server.close((error) => error ? rejectPromise(error) : resolvePromise());
      });
    }
  });

  it("forces external integrations off in the spawned QA API", () => {
    const target = validateIsolatedMarketApiTarget({
      rawApiUrl: "http://127.0.0.1:43117",
      rawDatabaseUrl: DATABASE_URL,
      environment: { NODE_ENV: "test" },
    });

    const isolatedEnvironment = createIsolatedMarketApiEnvironment(target, {
      API_RUNTIME_ROLE: "capability-worker",
      AUTH_DISTRIBUTED_RATE_LIMIT_ENABLED: "true",
      BACKEND_DISTRIBUTION_ENABLED: "true",
      DATABASE_URL: "postgresql://production.invalid/database",
      DEEPSEEK_API_KEY: "must-not-reach-child",
      GEMINI_API_KEY: "must-not-reach-child",
      OPENAI_API_KEY: "must-not-reach-child",
      OPENROUTER_API_KEY: "must-not-reach-child",
      PATH: "/safe/test/path",
      STUDIO_LIVE_CLUSTER_ADAPTER: "postgres",
      SUPABASE_OBJECT_STORAGE_ENABLED: "true",
      TOONSPECTRUM_MARKET_LIVE_PASSWORD: "must-not-reach-child",
      TOONSPECTRUM_MARKET_SEED_PASSWORD: "must-not-reach-child",
      UPSTASH_COORDINATION_ENABLED: "true",
      ZAI_API_KEY: "must-not-reach-child",
    });

    expect(isolatedEnvironment).toMatchObject({
      API_LOCAL_ENV_FILE_ENABLED: "false",
      API_RUNTIME_ROLE: "full",
      AUTH_SESSION_SECRET: "toonspectrum-isolated-market-qa-session-v1",
      AUTH_DISTRIBUTED_RATE_LIMIT_ENABLED: "false",
      AUTH_RATE_LIMIT_MODE: "single-instance-local",
      BACKEND_CAPABILITY_WORKER_ENABLED: "false",
      BACKEND_DISTRIBUTION_ENABLED: "false",
      DATABASE_URL,
      NEST_API_HOST: "127.0.0.1",
      NEST_API_PORT: "43117",
      NODE_ENV: "test",
      PATH: "/safe/test/path",
      PORT: "43117",
      STUDIO_LIVE_CLUSTER_ADAPTER: "memory",
      STUDIO_LIVE_VOICE_ENABLED: "false",
      STUDIO_REALTIME_REVOCATION_ENABLED: "false",
      STUDIO_REALTIME_TICKET_ENABLED: "false",
      SUPABASE_OBJECT_STORAGE_ENABLED: "false",
      TEST_DATABASE_URL: DATABASE_URL,
      UPSTASH_COORDINATION_ENABLED: "false",
    });
    for (const secretKey of [
      "DEEPSEEK_API_KEY",
      "GEMINI_API_KEY",
      "OPENAI_API_KEY",
      "OPENROUTER_API_KEY",
      "TOONSPECTRUM_MARKET_LIVE_PASSWORD",
      "TOONSPECTRUM_MARKET_SEED_PASSWORD",
      "ZAI_API_KEY",
    ]) {
      expect(isolatedEnvironment).not.toHaveProperty(secretKey);
    }
  });

  it.skipIf(process.platform === "win32")(
    "terminates a SIGTERM-ignoring child and grandchild as one detached process group",
    async () => {
      const grandchildScript = [
        'process.on("SIGTERM", () => {});',
        'process.send?.("ready");',
        "setInterval(() => {}, 1_000);",
      ].join(" ");
      const directChildScript = [
        'const { spawn } = require("node:child_process");',
        'process.on("SIGTERM", () => {});',
        `const grandchild = spawn(process.execPath, ["-e", ${JSON.stringify(grandchildScript)}],`,
        '{ stdio: ["ignore", "ignore", "inherit", "ipc"] });',
        'grandchild.once("message", () => process.stdout.write(`${grandchild.pid}\\n`));',
        "setInterval(() => {}, 1_000);",
      ].join(" ");
      const directChild = spawn(process.execPath, ["-e", directChildScript], {
        detached: true,
        stdio: ["ignore", "pipe", "inherit"],
      });
      let grandchildPid: number | null = null;

      try {
        const output = await Promise.race([
          once(directChild.stdout!, "data").then(([chunk]) => String(chunk).trim()),
          new Promise<never>((_resolvePromise, rejectPromise) => {
            setTimeout(
              () => rejectPromise(new Error("The detached-process fixture did not become ready.")),
              2_000,
            );
          }),
        ]);
        grandchildPid = Number(output);
        expect(Number.isSafeInteger(grandchildPid) && grandchildPid > 1).toBe(true);

        await stopDetachedProcessTree(directChild, {
          terminationGraceMs: 100,
          forceKillWaitMs: 2_000,
          pollIntervalMs: 10,
        });

        expect(() => process.kill(grandchildPid!, 0)).toThrow(
          expect.objectContaining({ code: "ESRCH" }),
        );
      } finally {
        if (Number.isSafeInteger(directChild.pid) && directChild.pid! > 1) {
          try {
            process.kill(-directChild.pid!, "SIGKILL");
          } catch {
            // The tested cleanup already removed the fixture group.
          }
        }
        if (grandchildPid !== null) {
          try {
            process.kill(grandchildPid, "SIGKILL");
          } catch {
            // The tested cleanup already removed the fixture grandchild.
          }
        }
      }
    },
  );
});
