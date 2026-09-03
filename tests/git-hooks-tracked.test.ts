import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const HOOKS = ["pre-commit", "pre-push", "commit-msg"] as const;

/**
 * The git hooks are run straight from the tracked .husky/ directory (core.hooksPath=.husky, set
 * by `pnpm run prepare`), not from the husky-generated .husky/_ shim. That shim is gitignored and
 * only appears after `pnpm install`, so a worktree created with `git worktree add` had no hooks at
 * all and pushed unverified code to main four times in one day. Running the tracked scripts
 * directly means every worktree gets the same gate. These checks pin the two things that make
 * that work: the scripts must be executable and must carry a shebang, because git execs them
 * itself now instead of handing them to husky's `sh -e` runner.
 */
describe("tracked git hooks", () => {
  it("are executable in the index, so a fresh worktree can run them", () => {
    const index = execFileSync("git", ["ls-files", "-s", ".husky"], { cwd: root, encoding: "utf8" });
    for (const hook of HOOKS) {
      const line = index.split("\n").find((l) => l.endsWith(`.husky/${hook}`));
      expect(line, `${hook} is tracked`).toBeDefined();
      expect(line!.startsWith("100755"), `${hook} is mode 100755`).toBe(true);
    }
  });

  it("start with a POSIX shebang, because git execs them directly", () => {
    for (const hook of HOOKS) {
      const first = readFileSync(path.join(root, ".husky", hook), "utf8").split("\n")[0];
      expect(first, hook).toBe("#!/usr/bin/env sh");
    }
  });

  it("are what prepare points core.hooksPath at", () => {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    // husky still runs first so its own bookkeeping stays intact; the override is the point.
    expect(pkg.scripts.prepare).toBe("husky && git config core.hooksPath .husky");
  });
});
