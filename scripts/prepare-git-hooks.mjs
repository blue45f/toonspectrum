#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

function isGitWorktree() {
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

if (!isGitWorktree()) {
  console.log("Skipping Git hook setup: deployment archive has no Git worktree.");
  process.exit(0);
}

const huskyBinary = resolve(
  "node_modules/.bin",
  process.platform === "win32" ? "husky.cmd" : "husky",
);

if (!existsSync(huskyBinary)) {
  throw new Error(`Husky executable is missing: ${huskyBinary}`);
}

execFileSync(huskyBinary, [], { stdio: "inherit" });
execFileSync("git", ["config", "core.hooksPath", ".husky"], {
  stdio: "inherit",
});
