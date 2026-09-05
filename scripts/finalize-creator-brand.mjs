import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

// Temporary bounded integration helper. Removed after the validated feature commit.
const replace = (path, before, after) => {
  const source = readFileSync(path, "utf8");
  assert(source.includes(before), `Integration anchor missing in ${path}`);
  writeFileSync(path, source.replace(before, after));
};
const jsonLdHash = (html) => {
  const scripts = [...html.matchAll(/<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1, "Expected the single existing JSON-LD block");
  return `'sha256-${createHash("sha256").update(scripts[0][1]).digest("base64")}'`;
};
const oldHash = jsonLdHash(execFileSync("git", ["show", "HEAD:index.html"], { encoding: "utf8" }));
const newHash = jsonLdHash(readFileSync("index.html", "utf8"));
assert.notEqual(oldHash, newHash);
replace("vercel.json", oldHash, newHash);

for (const filename of readdirSync("public/i18n/app")) {
  if (!filename.endsWith(".json")) continue;
  const path = `public/i18n/app/${filename}`;
  const dictionary = JSON.parse(readFileSync(path, "utf8"));
  const ko = filename === "ko.json";
  dictionary["footer.brand"] = ko ? "툰스튜디오" : "ToonStudio";
  dictionary["footer.description.primary"] = ko ? "아이디어를 첫 장면으로. 드로잉, 컷과 말풍선, 3D 장면을 만나는 브라우저 창작 공간." : "From an idea to your first scene. Explore drawing, comics and 3D scenes in your browser.";
  dictionary["footer.description.secondary"] = ko ? "나만의 이야기를 만들고, 다른 창작자의 작품에서 영감을 발견하세요." : "Create your own story and discover inspiration from other creators.";
  dictionary["footer.copyrightLine"] = (dictionary["footer.copyrightLine"] || "© {year} ToonStudio.").replaceAll("툰스펙트럼", "툰스튜디오").replaceAll("ToonSpectrum", "ToonStudio");
  dictionary["footer.logoTag"] = "CREATE YOUR NEXT STORY";
  writeFileSync(path, JSON.stringify(dictionary, null, 2) + "\n");
}
const footerPath = "components/site-footer.tsx";
let footer = readFileSync(footerPath, "utf8");
const createStart = footer.indexOf("  {\n    // 창작 표면");
const createEnd = footer.indexOf('\n  {\n    titleKey: "footer.section.brand"', createStart);
assert(createStart >= 0 && createEnd > createStart);
const createBlock = footer.slice(createStart, createEnd);
footer = footer.replace(createBlock + "\n", "");
assert(footer.includes("[] = [\n"));
footer = footer.replace("[] = [\n", "[] = [\n" + createBlock + "\n");
writeFileSync(footerPath, footer);

replace("scripts/creator-film-automation.test.mjs", 'import { test } from "node:test";\n', "");
replace("scripts/creator-film-automation.test.mjs", 'const workflow = JSON.parse', 'const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");\n\nconst workflow = JSON.parse');
replace("media/brand-film/src/ToonStudioFilm.tsx", "portrait ? width - 100 : 650", "portrait ? width - 100 : 600");
replace("docs/marketing/creator-first-home.md", "https://www.remotion.dev/docs/render", "https://www.remotion.dev/docs/cli/render");
replace("scripts/verify-creator-home.mjs", 'const browser = await chromium.launch', 'for (let attempt = 0; attempt < 60; attempt += 1) {\n  try { const response = await fetch(origin); if (response.ok) break; } catch { /* Preview server is starting. */ }\n  if (attempt === 59) throw new Error("Preview server did not become ready");\n  await new Promise((resolve) => setTimeout(resolve, 500));\n}\nconst browser = await chromium.launch');
console.log(`Updated exact JSON-LD CSP hash ${oldHash} -> ${newHash}; finalized creator-first footer and test compatibility.`);
