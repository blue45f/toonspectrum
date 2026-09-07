import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const ENTRY_PATH = fileURLToPath(
  new URL("../../../api/index.js", import.meta.url),
);

type ServerlessHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => unknown;

async function exerciseHandler(
  handler: ServerlessHandler,
  run: (origin: string) => Promise<void>,
): Promise<void> {
  const server = createServer((request, response) => {
    Promise.resolve(handler(request, response)).catch((error: unknown) => {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.message : "handler failed");
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("server did not expose a TCP address");
    }
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

describe("Vercel HTTP serverless bootstrap health boundary", () => {
  it("serves liveness and fail-closed readiness without DATABASE_URL", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    delete require.cache[ENTRY_PATH];

    try {
      const handler = require(ENTRY_PATH) as ServerlessHandler;
      await exerciseHandler(handler, async (origin) => {
        const live = await fetch(`${origin}/api/health/live`);
        expect(live.status).toBe(200);
        expect(live.headers.get("cache-control")).toBe("no-store, max-age=0");
        await expect(live.json()).resolves.toEqual({ status: "ok" });

        const legacyLive = await fetch(`${origin}/api/health`);
        expect(legacyLive.status).toBe(200);
        await expect(legacyLive.json()).resolves.toEqual({ status: "ok" });

        const rewrittenLive = await fetch(
          `${origin}/api/index?path=health%2Flive`,
        );
        expect(rewrittenLive.status).toBe(200);
        await expect(rewrittenLive.json()).resolves.toEqual({ status: "ok" });

        const ready = await fetch(`${origin}/api/index?path=health%2Fready`);
        expect(ready.status).toBe(503);
        await expect(ready.json()).resolves.toEqual({
          statusCode: 503,
          status: "not_ready",
          error: "service_not_ready",
          message: "Service is not ready",
        });
      });
    } finally {
      delete require.cache[ENTRY_PATH];
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
    }
  });
});
