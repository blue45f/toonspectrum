import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const directory = fileURLToPath(new URL("./", import.meta.url));
const require = createRequire(import.meta.url);
const cpu = ["inkwash-parity", "ink-field", "painttube-ab"];
const args = process.argv.slice(2);
const help = "Usage: node --import tsx scripts/experiments/recovered-20260908/run.mts --run <cpu|inkwash-parity|ink-field|painttube-ab|bg3d-origin> [--output <directory>] [--allow-gpu]";

if (args.length === 0 || args.includes("--help")) {
  console.log(help);
} else {
  const take = (flag: string): string | undefined => {
    const index = args.indexOf(flag);
    return index < 0 ? undefined : args[index + 1];
  };
  const experiment = take("--run");
  if (!experiment || ![...cpu, "cpu", "bg3d-origin"].includes(experiment)) {
    throw new Error(help);
  }
  if (experiment === "bg3d-origin" && !args.includes("--allow-gpu")) {
    throw new Error("BG3D creates a separate browser and GPU context. Explicit --allow-gpu is required.");
  }
  const configuredOutput = take("--output");
  const output = configuredOutput
    ? resolve(configuredOutput)
    : mkdtempSync(join(tmpdir(), "toonspectrum-recovered-experiments-"));
  mkdirSync(output, { recursive: true });
  const receipt = {
    startedAt: new Date().toISOString(),
    experiment,
    output,
    backend: experiment === "bg3d-origin" ? "browser WebGPU probe" : "CPU only; no browser or GPU",
    runs: [] as { name: string; exitCode: number; log: string; report?: string }[],
  };
  let exitCode = 0;
  for (const name of experiment === "cpu" ? cpu : [experiment]) {
    const report = join(output, `${name}.vitest.json`);
    const command = name === "bg3d-origin"
      ? ["--import", "tsx", join(directory, "bg3d-origin-probe.mts")]
      : [join(dirname(require.resolve("vitest/package.json")), "vitest.mjs"), "run", "--config", join(directory, "vitest.config.mts"),
          "--reporter=default", "--reporter=json", `--outputFile.json=${report}`];
    const result = spawnSync(process.execPath, command, {
      cwd: root,
      env: {
        ...process.env,
        TOONSPECTRUM_RECOVERED_OPT_IN: "1",
        TOONSPECTRUM_RECOVERED_EXPERIMENT: name,
        TOONSPECTRUM_RECOVERED_OUTPUT: output,
        TOONSPECTRUM_RECOVERED_ALLOW_GPU: args.includes("--allow-gpu") ? "1" : "0",
      },
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    const log = join(output, `${name}.log`);
    writeFileSync(log, `${result.stdout ?? ""}${result.stderr ?? ""}${result.error?.message ?? ""}`);
    const status = result.status ?? 1;
    receipt.runs.push({ name, exitCode: status, log, ...(name === "bg3d-origin" ? {} : { report }) });
    console.log(`${name}: exit ${status}; ${log}`);
    if (status !== 0) exitCode = 1;
  }
  writeFileSync(join(output, "execution.json"), JSON.stringify({ ...receipt, completedAt: new Date().toISOString() }, null, 2));
  console.log(`Execution receipt: ${join(output, "execution.json")}`);
  process.exitCode = exitCode;
}
