import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";

import {
  TOOLCHAIN_CATALOG,
  operationById,
  probeTool,
  toolById,
} from "../catalog.mjs";

const FAKE_TESSERACT = resolve("tools/toonbridge/test/fixtures/fake-tesseract.mjs");

test("tool catalog keeps the 25 designed engines and unique operations", () => {
  assert.equal(TOOLCHAIN_CATALOG.tools.length, 25);
  assert.equal(new Set(TOOLCHAIN_CATALOG.tools.map(({ id }) => id)).size, 25);
  for (const tool of TOOLCHAIN_CATALOG.tools) {
    assert.equal(
      new Set(tool.operations.map(({ id }) => id)).size,
      tool.operations.length,
      `${tool.id} operation ids must be unique`,
    );
  }
});

test("noncommercial and connector tools never become executable by catalog accident", () => {
  for (const tool of TOOLCHAIN_CATALOG.tools) {
    if (tool.licenseClass === "noncommercial" || tool.deployment === "connector") {
      assert.equal(tool.operations.some(({ executable }) => executable), false, tool.id);
    }
  }
});

test("a pinned binary override is probed without invoking a shell", () => {
  const tool = toolById("tesseract");
  assert.ok(tool);
  const probe = probeTool(tool, {
    PATH: process.env.PATH,
    TOONBRIDGE_TOOL_TESSERACT_BIN: FAKE_TESSERACT,
  });
  assert.equal(probe.state, "available");
  assert.equal(probe.executable, true);
  assert.match(probe.version, /99\.0\.0-toonbridge-test/u);
});

test("lookups fail closed for unknown tools and operations", () => {
  assert.equal(toolById("unknown"), null);
  assert.equal(operationById("tesseract", "unknown"), null);
  assert.equal(operationById("tesseract", "ocr-text")?.executable, true);
});
