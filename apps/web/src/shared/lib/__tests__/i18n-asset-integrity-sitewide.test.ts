import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const I18N_ROOT = path.resolve(process.cwd(), "apps/web/public/i18n");
const PLACEHOLDER_RE = /\{[\p{L}\p{N}_.-]+\}/gu;

type Dictionary = Record<string, string>;

function readDictionary(file: string): Dictionary {
  const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Invalid i18n dictionary: ${file}`);
  }
  const dictionary = parsed as Record<string, unknown>;
  for (const [key, value] of Object.entries(dictionary)) {
    if (typeof value !== "string") {
      throw new Error(`Non-string i18n value: ${file}#${key}`);
    }
  }
  return dictionary as Dictionary;
}

function collectEnglishAssets(dir: string, output: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      collectEnglishAssets(full, output);
    } else if (name === "en.json") {
      output.push(full);
    }
  }
  return output;
}

function placeholders(value: string): string[] {
  return [...value.matchAll(PLACEHOLDER_RE)].map((match) => match[0]).sort();
}

describe("sitewide locale asset integrity", () => {
  it("never ships a translation value that is literally its implementation key", () => {
    const findings: string[] = [];

    for (const englishFile of collectEnglishAssets(I18N_ROOT)) {
      const directory = path.dirname(englishFile);
      for (const name of readdirSync(directory).filter((entry) => entry.endsWith(".json"))) {
        const file = path.join(directory, name);
        const dictionary = readDictionary(file);
        for (const [key, value] of Object.entries(dictionary)) {
          if (value === key) findings.push(`${path.relative(I18N_ROOT, file)}#${key}`);
        }
      }
    }

    expect(findings).toEqual([]);
  });

  it("preserves English interpolation placeholders in every translated sibling value", () => {
    const findings: string[] = [];

    for (const englishFile of collectEnglishAssets(I18N_ROOT)) {
      const directory = path.dirname(englishFile);
      const source = readDictionary(englishFile);
      for (const name of readdirSync(directory).filter((entry) => entry.endsWith(".json"))) {
        if (name === "en.json") continue;
        const file = path.join(directory, name);
        const dictionary = readDictionary(file);
        for (const [key, sourceValue] of Object.entries(source)) {
          const translatedValue = dictionary[key];
          if (translatedValue === undefined) continue;
          const expected = placeholders(sourceValue);
          const actual = placeholders(translatedValue);
          if (expected.join("\u0000") !== actual.join("\u0000")) {
            findings.push(
              `${path.relative(I18N_ROOT, file)}#${key}: ${expected.join(",")} -> ${actual.join(",")}`,
            );
          }
        }
      }
    }

    expect(findings).toEqual([]);
  });
});
