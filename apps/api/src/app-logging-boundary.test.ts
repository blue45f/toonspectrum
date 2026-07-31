import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const appModuleSource = readFileSync(
  new URL("./app.module.ts", import.meta.url),
  "utf8"
);

describe("application logging credential boundary", () => {
  it.each([
    "req.headers.authorization",
    "req.headers.cookie",
    "req.headers['x-user-id']",
    "req.headers['sec-websocket-protocol']",
  ])("redacts %s before structured request logging", (path) => {
    expect(appModuleSource).toContain(`"${path}"`);
  });
});
