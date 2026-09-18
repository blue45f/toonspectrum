import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, "config/architecture-boundary-ratchet.json");
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);
const APP_ROOTS = ["apps/web/src", "apps/admin/src", "apps/api/src"];

function walk(relativeRoot) {
  const absoluteRoot = path.join(ROOT, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) return [];
  const files = [];
  for (const entry of fs.readdirSync(absoluteRoot, { withFileTypes: true })) {
    const relative = path.posix.join(relativeRoot, entry.name);
    if (entry.isDirectory()) files.push(...walk(relative));
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(relative);
  }
  return files;
}

function importsFrom(source) {
  const values = new Set();
  const patterns = [
    /(?:import|export)\s+(?:[^'\"]+?\s+from\s+)?["']([^"']+)["']/g,
    /import\(\s*["']([^"']+)["']\s*\)/g,
    /require\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) values.add(match[1]);
  }
  return [...values];
}

function normalizeTarget(file, specifier) {
  const clean = specifier.split(/[?#]/, 1)[0];
  if (clean.startsWith("@/")) return path.posix.join("apps/web/src", clean.slice(2));
  if (clean.startsWith("@admin/")) return path.posix.join("apps/admin/src", clean.slice(7));
  if (clean.startsWith("apps/")) return clean;
  if (!clean.startsWith(".")) return null;
  const absolute = path.resolve(ROOT, path.dirname(file), clean);
  return path.relative(ROOT, absolute).split(path.sep).join("/");
}

function domainOf(file, app) {
  const prefix = `apps/${app}/src/domains/`;
  if (!file.startsWith(prefix)) return null;
  return file.slice(prefix.length).split("/", 1)[0] || null;
}

const counts = {
  webToAdmin: 0,
  adminToWeb: 0,
  apiToWeb: 0,
  apiToAdmin: 0,
  adminSharedToDomain: 0,
  adminCrossDomainDeepImport: 0,
  webSharedToDomain: 0,
  webCrossDomainDeepImport: 0,
};
const examples = new Map(Object.keys(counts).map((key) => [key, []]));

function record(key, file, target) {
  counts[key] += 1;
  const bucket = examples.get(key);
  if (bucket.length < 5) bucket.push(`${file} -> ${target}`);
}

for (const file of APP_ROOTS.flatMap(walk)) {
  const source = fs.readFileSync(path.join(ROOT, file), "utf8");
  for (const specifier of importsFrom(source)) {
    const target = normalizeTarget(file, specifier);
    if (!target) continue;

    if (file.startsWith("apps/web/src/") && target.startsWith("apps/admin/")) record("webToAdmin", file, target);
    if (file.startsWith("apps/admin/src/") && target.startsWith("apps/web/")) record("adminToWeb", file, target);
    if (file.startsWith("apps/api/src/") && target.startsWith("apps/web/")) record("apiToWeb", file, target);
    if (file.startsWith("apps/api/src/") && target.startsWith("apps/admin/")) record("apiToAdmin", file, target);

    for (const app of ["web", "admin"]) {
      const sharedPrefix = `apps/${app}/src/shared/`;
      const domainPrefix = `apps/${app}/src/domains/`;
      if (file.startsWith(sharedPrefix) && target.startsWith(domainPrefix)) {
        record(`${app}SharedToDomain`, file, target);
      }

      const sourceDomain = domainOf(file, app);
      const targetDomain = domainOf(target, app);
      if (sourceDomain && targetDomain && sourceDomain !== targetDomain) {
        const publicBoundary = target.includes(`/domains/${targetDomain}/public`);
        const integrationBoundary = target.includes("/integrations/");
        if (!publicBoundary && !integrationBoundary) {
          record(`${app}CrossDomainDeepImport`, file, target);
        }
      }
    }
  }
}

const budgets = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
if (process.argv.includes("--write-baseline")) {
  for (const key of Object.keys(counts)) budgets[key] = counts[key];
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(budgets, null, 2)}\n`);
  console.log(`architecture boundary baseline written to ${path.relative(ROOT, CONFIG_PATH)}`);
  process.exit(0);
}

const failures = [];
for (const [key, value] of Object.entries(counts)) {
  const budget = budgets[key];
  const status = typeof budget === "number" ? `${value}/${budget}` : `${value}/observe`;
  console.log(`${key}: ${status}`);
  if (typeof budget === "number" && value > budget) {
    failures.push(`${key} increased to ${value} (budget ${budget})`);
    for (const example of examples.get(key)) console.error(`  ${example}`);
  }
}

if (failures.length > 0) {
  console.error(`architecture boundary validation failed: ${failures.length} ratchet(s) exceeded`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("architecture boundary validation passed");
