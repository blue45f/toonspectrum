import assert from "node:assert/strict";
import { appendFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { join, win32 } from "node:path";

import {
  packageDesktopSyncRelease,
  resolveReleaseCommand,
} from "./package-desktop-sync-release.mjs";
import { signDesktopSyncReleaseStage } from "./sign-desktop-sync-release.mjs";
import {
  resolveArchiveListingInvocation,
  verifyDesktopSyncRelease,
} from "./verify-desktop-sync-release.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

function packageOptions(outputDir, version, overrides = {}) {
  return {
    mode: "all",
    stageDir: join(outputDir, "stage"),
    outputDir,
    version,
    signingEvidence: "",
    ...overrides,
  };
}

function expectedSigningKind() {
  if (process.platform === "darwin") return "apple-codesign";
  if (process.platform === "win32") return "authenticode";
  return "gpg";
}

test("wraps Windows command shims through cmd.exe", () => {
  assert.deepEqual(
    resolveReleaseCommand(
      "npm.cmd",
      ["install", "--omit=dev"],
      "win32",
      { ComSpec: "C:\\Windows\\System32\\cmd.exe" },
    ),
    {
      command: "C:\\Windows\\System32\\cmd.exe",
      args: ["/d", "/s", "/c", "npm.cmd", "install", "--omit=dev"],
    },
  );
  assert.deepEqual(
    resolveReleaseCommand("npm", ["install"], "darwin", {}),
    { command: "npm", args: ["install"] },
  );
});

test("rejects Windows shell expansion and command injection", () => {
  for (const argument of ["x&whoami", "%PATH%", "!PATH!", "x|more", "x\nwhoami", 'x"']) {
    assert.throws(() => resolveReleaseCommand("npm.cmd", [argument], "win32", {}), /unsafe Windows/);
  }
  assert.deepEqual(resolveReleaseCommand("node.exe", ["a&b"], "win32", {}), {
    command: "node.exe", args: ["a&b"],
  });
});

test("lists Windows archives from their directory without a drive-letter argument", () => {
  assert.deepEqual(
    resolveArchiveListingInvocation(
      "D:\\a\\toonspectrum\\release\\toonstudio-sync-windows-x64.tar.gz",
      win32,
    ),
    {
      command: "tar",
      args: ["-tzf", "toonstudio-sync-windows-x64.tar.gz"],
      cwd: "D:\\a\\toonspectrum\\release",
    },
  );
});

test("packages a reproducible, self-contained desktop sync release", {
  timeout: 180_000,
}, async (context) => {
  const temporaryRoot = await mkdtemp(join(os.tmpdir(), "toonstudio-desktop-release-"));
  (context.onTestFinished ?? context.after.bind(context))(async () => rm(temporaryRoot, { recursive: true, force: true }));
  const firstRoot = join(temporaryRoot, "first");
  const secondRoot = join(temporaryRoot, "second");
  const version = "0.0.0-release-test";

  const first = await packageDesktopSyncRelease(packageOptions(firstRoot, version));
  const second = await packageDesktopSyncRelease(packageOptions(secondRoot, version));
  assert.ok(first.finalized);
  assert.ok(second.finalized);
  assert.equal(
    first.finalized.releaseReceipt.archiveSha256,
    second.finalized.releaseReceipt.archiveSha256,
  );
  assert.equal(
    first.finalized.releaseReceipt.manifestSha256,
    second.finalized.releaseReceipt.manifestSha256,
  );

  await assert.rejects(
    signDesktopSyncReleaseStage({
      stageDir: join(firstRoot, "stage"),
      output: join(firstRoot, "invalid-signing-output.json"),
      identity: "\n",
    }),
    /signing identity/u,
  );

  const verified = await verifyDesktopSyncRelease({
    releaseDir: firstRoot,
    requireSigned: false,
  });
  assert.equal(verified.signingStatus, "unsigned");
  assert.ok(verified.fileCount > 20);

  await assert.rejects(
    verifyDesktopSyncRelease({
      releaseDir: firstRoot,
      requireSigned: true,
      executeBundle: false,
    }),
    /signed release evidence is required/u,
  );

  const metadata = JSON.parse(await readFile(
    join(first.finalized.bundleRoot, ".release-stage.json"),
    "utf8",
  ));
  const invalidEvidencePath = join(temporaryRoot, "invalid-signing.json");
  await writeFile(invalidEvidencePath, `${JSON.stringify({
    schemaVersion: 1,
    platform: metadata.platform,
    arch: metadata.arch,
    status: "signed",
    artifacts: [{
      kind: expectedSigningKind(),
      path: "../outside",
      targetPath: metadata.runtime,
      verified: true,
      identity: "test identity",
      sha256: "0".repeat(64),
      targetSha256: "0".repeat(64),
    }],
  })}\n`, "utf8");
  await assert.rejects(
    packageDesktopSyncRelease(packageOptions(firstRoot, version, {
      mode: "finalize",
      signingEvidence: invalidEvidencePath,
    })),
    /unsafe bundle path/u,
  );

  const launcher = process.platform === "win32"
    ? "toonstudio-sync.cmd"
    : "toonstudio-sync";
  await appendFile(
    join(first.finalized.bundleRoot, launcher),
    process.platform === "win32" ? "\r\nREM tampered\r\n" : "\n# tampered\n",
    "utf8",
  );
  await assert.rejects(
    verifyDesktopSyncRelease({
      releaseDir: firstRoot,
      requireSigned: false,
      executeBundle: false,
    }),
    /release file metadata mismatch|release file checksum mismatch/u,
  );
});
