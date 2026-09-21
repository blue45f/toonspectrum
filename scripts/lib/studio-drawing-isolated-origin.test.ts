// @vitest-environment node
import http from "node:http";

import { afterEach, expect, it } from "vitest";

import { createStudioDrawingIsolatedOrigin } from "./studio-drawing-isolated-origin.mjs";

const close: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const stop of close.splice(0).reverse()) await stop(); });
it("rejects non-local, authenticated and non-HTTP upstreams", async () => {
  for (const url of ["https://example.com", "http://remote.example", "http://user:pass@localhost:8080", "file:///tmp/example"]) {
    await expect(createStudioDrawingIsolatedOrigin(url)).rejects.toThrow("loopback");
  }
});
it("assigns a fresh loopback port and forwards only to its fixed fixture upstream", async () => {
  const server = http.createServer((request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ path: request.url, host: request.headers.host }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  close.push(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address() as import("node:net").AddressInfo;
  const source = `http://127.0.0.1:${address.port}`;
  const isolated = await createStudioDrawingIsolatedOrigin(source); close.push(isolated.close);
  const other = await createStudioDrawingIsolatedOrigin(source); close.push(other.close);
  expect(isolated.origin).not.toBe(source); expect(isolated.origin).not.toBe(other.origin);
  const response = await fetch(`${isolated.origin}/tools/fixture.html?case=one`);
  expect(await response.json()).toEqual({ path: "/tools/fixture.html?case=one", host: `127.0.0.1:${address.port}` });
  expect((await fetch(`${isolated.origin}//external.example/path`)).status).toBe(400);
});
