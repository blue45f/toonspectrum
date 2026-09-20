#!/usr/bin/env node
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Verify source ownership without following another checkout's workspace links. */
export function verifyWorkspacePackageLinks(root) {
  const canonicalRoot = realpathSync(root);
  const locations = [canonicalRoot];
  for (const folder of ["apps", "packages"]) {
    let entries;
    try { entries = readdirSync(join(canonicalRoot, folder), { withFileTypes: true }); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const location = join(canonicalRoot, folder, entry.name);
      try { lstatSync(join(location, "package.json")); locations.push(location); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
    }
  }
  const packages = locations.map((location) => ({ location,
    manifest: JSON.parse(readFileSync(join(location, "package.json"), "utf8")) }));
  const byName = new Map(packages.map(({ location, manifest }) => [manifest.name, location]));
  const failures = [];
  let checked = 0;
  for (const { location, manifest } of packages) {
    const dependencies = { ...manifest.dependencies, ...manifest.devDependencies, ...manifest.optionalDependencies };
    for (const [name, spec] of Object.entries(dependencies)) {
      if (typeof spec !== "string" || !spec.startsWith("workspace:")) continue;
      checked += 1;
      const expected = byName.get(name);
      if (!expected) { failures.push({ consumer: manifest.name, dependency: name, reason: "unknown-workspace-package" }); continue; }
      let cursor = location, actual = null, reason = "missing-link";
      for (;;) {
        const candidate = join(cursor, "node_modules", name);
        try {
          lstatSync(candidate);
          try { actual = realpathSync(candidate); } catch { reason = "broken-link"; }
          break;
        } catch (error) { if (error.code !== "ENOENT") throw error; }
        if (cursor === canonicalRoot) break;
        const parent = dirname(cursor);
        if (parent === cursor) break;
        cursor = parent;
      }
      if (actual !== realpathSync(expected)) failures.push({ consumer: manifest.name, dependency: name,
        reason: actual ? "wrong-worktree" : reason, expected, actual });
    }
  }
  return { root: canonicalRoot, packages: packages.length, checked, failures };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = verifyWorkspacePackageLinks(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
  if (result.failures.length) {
    console.error(JSON.stringify(result, null, 2));
    console.error("Workspace dependency ownership is invalid. Install dependencies in this checkout; do not relink a shared node_modules directory.");
    process.exitCode = 1;
  } else console.log(`Workspace links verified: ${result.checked} dependencies across ${result.packages} packages.`);
}
