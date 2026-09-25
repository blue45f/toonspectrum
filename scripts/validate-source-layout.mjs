import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, "config/architecture-source-ratchet.json");

function normalize(value) {
  return value.split(path.sep).join("/").replace(/^\.\//u, "");
}

function trackedRepositoryFiles(root = ROOT) {
  const result = spawnSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`git ls-files failed: ${result.stderr.trim()}`);
  }
  return result.stdout.split("\0").filter(Boolean).map(normalize);
}

function filesUnder(files, directory) {
  const prefix = `${normalize(directory).replace(/\/$/u, "")}/`;
  return files.filter((file) => file.startsWith(prefix)).length;
}

function directFilesUnder(files, directory) {
  const prefix = `${normalize(directory).replace(/\/$/u, "")}/`;
  return files.filter((file) => {
    if (!file.startsWith(prefix)) return false;
    return !file.slice(prefix.length).includes("/");
  }).length;
}

export function measureSourceLayout(files) {
  return {
    creatorRootFiles: directFilesUnder(files, "apps/web/src/domains/creator"),
    webAdminFiles: filesUnder(files, "apps/web/src/domains/admin"),
    apiServerFiles: filesUnder(files, "apps/api/src/server"),
    apiCommonFiles: filesUnder(files, "apps/api/src/common"),
    apiInfrastructureFiles: filesUnder(files, "apps/api/src/infrastructure"),
    apiDbFiles: filesUnder(files, "apps/api/src/db"),
    packagesCoreFiles: filesUnder(files, "packages/core"),
    desktopSyncAgentFiles: filesUnder(files, "apps/desktop-sync-agent"),
    trackedQaFiles: filesUnder(files, ".qa"),
    trackedArtifactFiles: filesUnder(files, "artifacts"),
    webCompatFiles: filesUnder(files, "apps/web/src/compat"),
    webComponentsFiles: filesUnder(files, "apps/web/src/components"),
    webHooksFiles: filesUnder(files, "apps/web/src/hooks"),
    webInfrastructureFiles: filesUnder(files, "apps/web/src/infrastructure"),
    webGeneratedFiles: filesUnder(files, "apps/web/src/generated"),
    webStylesFiles: filesUnder(files, "apps/web/src/styles"),
    webTypesFiles: filesUnder(files, "apps/web/src/types"),
    rootAndroidFiles: filesUnder(files, "android"),
    rootIosFiles: filesUnder(files, "ios"),
    rootMobileShellFiles: filesUnder(files, "mobile-shell"),
    rootMobileResourcesFiles: filesUnder(files, "resources"),
    rootCapacitorConfigFiles: files.includes("capacitor.config.ts") ? 1 : 0,
    rootMediaFiles: filesUnder(files, "media"),
    rootAutomationFiles: filesUnder(files, "automation"),
    rootMarketplaceBenchmarkFiles: filesUnder(files, "marketplace-benchmark"),
  };
}

export function validateSourceLayout({ files, budgets }) {
  const counts = measureSourceLayout(files);
  const failures = [];
  for (const [key, value] of Object.entries(counts)) {
    const budget = budgets[key];
    if (!Number.isInteger(budget) || budget < 0) {
      failures.push(`${key} has no valid non-negative integer budget`);
      continue;
    }
    console.log(`${key}: ${value}/${budget}`);
    if (value > budget) failures.push(`${key} increased to ${value} (budget ${budget})`);
  }
  return { counts, failures };
}

function main() {
  const files = trackedRepositoryFiles();
  const budgets = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  const { counts, failures } = validateSourceLayout({ files, budgets });
  if (process.argv.includes("--write-baseline")) {
    fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(counts, null, 2)}\n`);
    console.log(`source layout baseline written to ${path.relative(ROOT, CONFIG_PATH)}`);
    return;
  }
  if (failures.length > 0) {
    console.error(`source layout validation failed: ${failures.length} issue(s)`);
    for (const failure of failures) console.error(` - ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log("source layout validation passed");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
