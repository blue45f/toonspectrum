import { createServer } from "node:http";
import { Writable } from "node:stream";

import pinoHttp from "pino-http";
import { describe, expect, it, vi } from "vitest";

import {
  SAFE_HTTP_LOG_REDACT_PATHS,
  SAFE_HTTP_LOG_SERIALIZERS,
  serializeSafeHttpRequest,
  serializeSafeHttpResponse,
} from "./logging/http-log-serializers";

describe("application logging credential boundary", () => {
  it("allowlists request method and query-free path only", () => {
    const serialized = serializeSafeHttpRequest({
      id: "request-id-with-private-metadata",
      method: "get",
      originalUrl: "/api/health/ready?ticket=never-log-this#fragment",
      headers: {
        authorization: "Bearer never-log-this",
        cookie: "session=never-log-this",
        "x-api-key": "never-log-this",
        "x-vercel-oidc-token": "never-log-this",
        "x-vercel-proxy-signature": "never-log-this",
        "sec-websocket-protocol": "never-log-this",
      },
      query: { ticket: "never-log-this" },
      params: { resetToken: "never-log-this" },
      remoteAddress: "203.0.113.10",
      remotePort: 65_535,
      socket: { remoteAddress: "203.0.113.10" },
    });

    expect(serialized).toEqual({
      method: "GET",
      url: "/api/health/ready",
    });
    expect(JSON.stringify(serialized)).not.toContain("never-log-this");
    expect(JSON.stringify(serialized)).not.toContain("203.0.113.10");
  });

  it("does not inherit arbitrary fields from hostile request objects", () => {
    const prototype = {
      headers: { authorization: "prototype-secret" },
      remoteAddress: "198.51.100.2",
    };
    const request = Object.assign(Object.create(prototype), {
      method: "POST",
      url: "https://www.toonstudio.cloud/api/auth/session?code=secret",
      body: { apiKey: "body-secret" },
    });

    expect(serializeSafeHttpRequest(request)).toEqual({
      method: "POST",
      url: "/api/auth/session",
    });
  });

  it("allowlists only a valid response status code", () => {
    expect(
      serializeSafeHttpResponse({
        statusCode: 200,
        headers: {
          "set-cookie": "session=never-log-this",
          authorization: "Bearer never-log-this",
        },
        socket: { remoteAddress: "192.0.2.5" },
      }),
    ).toEqual({ statusCode: 200 });
    expect(serializeSafeHttpResponse({ statusCode: 99 })).toEqual({});
  });

  it("keeps injected credentials and network metadata out of real pino-http output", async () => {
    const logLines: string[] = [];
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        logLines.push(String(chunk));
        callback();
      },
    });
    const logger = pinoHttp(
      {
        wrapSerializers: false,
        serializers: SAFE_HTTP_LOG_SERIALIZERS,
        redact: [...SAFE_HTTP_LOG_REDACT_PATHS],
      },
      destination,
    );
    const server = createServer((request, response) => {
      logger(request, response);
      response.statusCode = 204;
      response.setHeader("set-cookie", "session=response-secret");
      response.end();
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });

    try {
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("HTTP test server did not expose a TCP address.");
      }
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/health/ready?ticket=query-secret`,
        {
          headers: {
            authorization: "Bearer authorization-secret",
            cookie: "session=request-secret",
            "x-api-key": "api-key-secret",
            "x-forwarded-for": "203.0.113.50",
            "x-vercel-oidc-token": "oidc-secret",
            "x-vercel-proxy-signature": "proxy-signature-secret",
          },
        },
      );
      expect(response.status).toBe(204);
      await vi.waitFor(() => expect(logLines.length).toBeGreaterThan(0));

      const output = logLines.join("");
      const record = JSON.parse(logLines.at(-1) ?? "{}") as {
        req?: unknown;
        res?: unknown;
      };
      expect(record.req).toEqual({
        method: "GET",
        url: "/api/health/ready",
      });
      expect(record.res).toEqual({ statusCode: 204 });
      expect(output).not.toContain("secret");
      expect(output).not.toContain("203.0.113.50");
      expect(output).not.toContain("127.0.0.1");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      destination.destroy();
    }
  });
});
