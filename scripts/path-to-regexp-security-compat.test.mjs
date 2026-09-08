import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const apiRequire = createRequire(join(repositoryRoot, "apps/api/package.json"));
const nestRequire = createRequire(apiRequire.resolve("@nestjs/platform-express"));
const vercelRequire = createRequire(
  realpathSync(join(repositoryRoot, "node_modules/vercel/package.json")),
);
const wranglerRequire = createRequire(
  realpathSync(join(repositoryRoot, "node_modules/wrangler/package.json")),
);

async function withExpressServer(express, run) {
  const app = express();
  app.set("query parser", "extended");
  app.use(express.json({ limit: "1kb" }));
  app.use(express.urlencoded({ extended: true, limit: "1kb" }));
  app.post("/pages/:pageId", (req, res) => {
    res.json({ pageId: req.params.pageId, query: req.query, body: req.body });
  });
  app.use((error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    res.status(error.status ?? 500).json({ type: error.type });
  });

  const server = await new Promise((resolve, reject) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    listening.once("error", reject);
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(url);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

describe.each([
  ["Express 4", apiRequire("express")],
  ["NestJS Express 5", nestRequire("express")],
])("security-patched %s HTTP dependencies", (_name, express) => {
  it("routes page parameters, nested queries and form bodies through the actual app", async () => {
    await withExpressServer(express, async (url) => {
      const response = await fetch(`${url}/pages/page-1?filter[layer]=ink&tags[]=draft&tags[]=color`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "title=Studio&layers[0][name]=Ink&layers[1][name]=Color",
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        pageId: "page-1",
        query: { filter: { layer: "ink" }, tags: ["draft", "color"] },
        body: { title: "Studio", layers: [{ name: "Ink" }, { name: "Color" }] },
      });
    });
  });

  it("accepts JSON while rejecting malformed and oversized bodies", async () => {
    await withExpressServer(express, async (url) => {
      const postJson = (body) => fetch(`${url}/pages/page-2`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      const accepted = await postJson(JSON.stringify({ title: "페이지", layers: [1, 2] }));
      expect(accepted.status).toBe(200);
      expect((await accepted.json()).body).toEqual({ title: "페이지", layers: [1, 2] });

      const malformed = await postJson('{"title":');
      expect(malformed.status).toBe(400);
      expect(await malformed.json()).toEqual({ type: "entity.parse.failed" });

      const oversized = await postJson(JSON.stringify({ text: "x".repeat(2048) }));
      expect(oversized.status).toBe(413);
      expect(await oversized.json()).toEqual({ type: "entity.too.large" });
    });
  });
});

describe("security-patched path-to-regexp consumer APIs", () => {
  it("retains the callable legacy API required by Express 4", () => {
    const expressRequire = createRequire(apiRequire.resolve("express"));
    const pathToRegexp = expressRequire("path-to-regexp");
    const keys = [];

    expect(typeof pathToRegexp).toBe("function");
    const route = pathToRegexp("/pages/:pageId", keys);
    expect(route.exec("/pages/page-1")?.[1]).toBe("page-1");
    expect(keys[0].name).toBe("pageId");
  });

  it.each([
    ["Vercel Node", createRequire(vercelRequire.resolve("@vercel/node"))],
    ["Vercel Remix", createRequire(vercelRequire.resolve("@vercel/remix-builder"))],
    ["Wrangler", wranglerRequire],
  ])("preserves %s's v6 RegExp and optional-parameter contract", (_name, consumerRequire) => {
    const { pathToRegexp, compile } = consumerRequire("path-to-regexp");
    const keys = [];
    const route = pathToRegexp("/api/:name/:version?", keys);

    expect(route).toBeInstanceOf(RegExp);
    expect(route.exec("/api/studio/v1")?.slice(1)).toEqual(["studio", "v1"]);
    expect(route.exec("/api/studio")?.slice(1)).toEqual(["studio", undefined]);
    expect(keys.map((key) => key.name)).toEqual(["name", "version"]);
    expect(compile("/api/:name/:version?")({ name: "studio" })).toBe("/api/studio");
  });
});
