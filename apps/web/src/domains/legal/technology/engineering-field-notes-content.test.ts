import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ENGINEERING_FIELD_CATEGORY_META,
  ENGINEERING_FIELD_NOTES,
  ENGINEERING_IMPLEMENTATION_INVENTORY,
  ENGINEERING_OPEN_APIS,
  ENGINEERING_REFERENCE_PRODUCTS,
  ENGINEERING_TROUBLESHOOTING_CASES,
} from "./engineering-field-notes-content";

const unique = (values: readonly string[]): boolean => new Set(values).size === values.length;
const repositoryPath = (value: string): string => value.split("#", 1)[0] ?? value;

function filesUnder(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

function expectEvidenceExists(
  owner: string,
  evidence: readonly { readonly path: string }[],
): void {
  expect(evidence.length, owner).toBeGreaterThan(0);
  for (const item of evidence) {
    expect(existsSync(repositoryPath(item.path)), `${owner}: missing ${item.path}`).toBe(true);
  }
}

describe("engineering field notes content", () => {
  it("covers every deep-dive category with uniquely addressable, evidenced notes", () => {
    expect(ENGINEERING_FIELD_NOTES.length).toBeGreaterThanOrEqual(12);
    expect(unique(ENGINEERING_FIELD_NOTES.map((note) => note.id))).toBe(true);

    for (const category of Object.keys(ENGINEERING_FIELD_CATEGORY_META)) {
      expect(
        ENGINEERING_FIELD_NOTES.some((note) => note.category === category),
        `missing category ${category}`,
      ).toBe(true);
    }

    for (const note of ENGINEERING_FIELD_NOTES) {
      expect(note.reuseSteps.length, note.id).toBeGreaterThanOrEqual(4);
      expect(note.technologies.length, note.id).toBeGreaterThan(3);
      expect(note.references.length, note.id).toBeGreaterThan(0);
      expectEvidenceExists(note.id, note.evidence);
      for (const reference of note.references) {
        expect(reference.url, reference.id).toMatch(/^https:\/\//u);
        expect(reference.reviewedAt, reference.id).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
      }
    }
  });

  it("keeps the public implementation inventory tied to repository reality", () => {
    const webSourceFiles = filesUnder("apps/web/src");
    const workerEntries = webSourceFiles.filter((file) => file.endsWith(".worker.ts"));
    const workerClients = webSourceFiles.filter((file) => file.endsWith("worker-client.ts"));
    const serviceWorkerFiles = readdirSync("apps/web/src/app/service-worker", { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts"));
    const blenderContracts = readFileSync("tools/blender/toonstudio_blender_kit/contracts.py", "utf8");
    const commandBlock = /MCP_ALLOWED_COMMANDS\s*=\s*frozenset\(\s*\{([\s\S]*?)\}\s*\)/u.exec(blenderContracts)?.[1] ?? "";
    const blenderCommands = [...commandBlock.matchAll(/"([^"]+)"/gu)].map((match) => match[1]);

    expect(ENGINEERING_IMPLEMENTATION_INVENTORY.workerEntries).toBe(workerEntries.length);
    expect(ENGINEERING_IMPLEMENTATION_INVENTORY.workerClients).toBe(workerClients.length);
    expect(ENGINEERING_IMPLEMENTATION_INVENTORY.serviceWorkerRuntimeFiles).toBe(serviceWorkerFiles.length);
    expect(ENGINEERING_IMPLEMENTATION_INVENTORY.blenderMcpCommands).toBe(blenderCommands.length);
    expect(ENGINEERING_IMPLEMENTATION_INVENTORY.openApiProviders).toBe(ENGINEERING_OPEN_APIS.length);
    expect(ENGINEERING_IMPLEMENTATION_INVENTORY.localInferenceRuntimes).toEqual([
      "ONNX Runtime Web",
      "MediaPipe Tasks Vision",
    ]);
  });

  it("keeps Open API entries explicit about access, rights, resilience and evidence", () => {
    expect(ENGINEERING_OPEN_APIS.length).toBeGreaterThanOrEqual(8);
    expect(unique(ENGINEERING_OPEN_APIS.map((api) => api.id))).toBe(true);
    for (const api of ENGINEERING_OPEN_APIS) {
      expect(api.officialUrl, api.id).toMatch(/^https:\/\//u);
      expect(api.access.ko.trim(), api.id).not.toBe("");
      expect(api.rightsGate.ko.trim(), api.id).not.toBe("");
      expect(api.resilience.ko.trim(), api.id).not.toBe("");
      expectEvidenceExists(api.id, api.evidence);
    }
  });

  it("documents troubleshooting as symptom, root cause, fix and prevention", () => {
    expect(ENGINEERING_TROUBLESHOOTING_CASES.length).toBeGreaterThanOrEqual(11);
    expect(unique(ENGINEERING_TROUBLESHOOTING_CASES.map((item) => item.id))).toBe(true);
    for (const item of ENGINEERING_TROUBLESHOOTING_CASES) {
      expect(item.symptom.ko.trim(), item.id).not.toBe("");
      expect(item.rootCause.ko.trim(), item.id).not.toBe("");
      expect(item.fix.ko.trim(), item.id).not.toBe("");
      expect(item.prevention.ko.trim(), item.id).not.toBe("");
      expectEvidenceExists(item.id, item.evidence);
    }
  });

  it("separates applied references, specialists and non-adopted products", () => {
    expect(ENGINEERING_REFERENCE_PRODUCTS.length).toBeGreaterThanOrEqual(16);
    expect(unique(ENGINEERING_REFERENCE_PRODUCTS.map((product) => product.id))).toBe(true);
    expect(ENGINEERING_REFERENCE_PRODUCTS.some((product) => product.role === "specialist")).toBe(true);
    expect(ENGINEERING_REFERENCE_PRODUCTS.some((product) => product.role === "not-adopted")).toBe(true);
    expect(ENGINEERING_REFERENCE_PRODUCTS.some((product) => product.role === "planned-evaluation")).toBe(true);
    for (const product of ENGINEERING_REFERENCE_PRODUCTS) {
      expect(product.url, product.id).toMatch(/^https:\/\//u);
      expect(product.boundary.ko.trim(), product.id).not.toBe("");
    }
  });

  it("contains no credential-shaped values in public technical content", () => {
    const serialized = JSON.stringify({
      notes: ENGINEERING_FIELD_NOTES,
      apis: ENGINEERING_OPEN_APIS,
      troubleshooting: ENGINEERING_TROUBLESHOOTING_CASES,
      products: ENGINEERING_REFERENCE_PRODUCTS,
    });
    expect(serialized).not.toMatch(/sk-[a-z0-9]{12,}/iu);
    expect(serialized).not.toMatch(/client_secret\s*[:=]\s*["'][^${]/iu);
    expect(serialized).not.toMatch(/api[_-]?key\s*[:=]\s*["'][^${]/iu);
  });
});
