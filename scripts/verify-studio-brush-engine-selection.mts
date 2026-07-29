import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  renderStudioBrushEngineSelectionMarkdown,
  runStudioBrushEngineSelectionBenchmark,
} from "./studio-brush-engine-selection-benchmark";

interface CliOptions {
  readonly outputDirectory: string;
  readonly sampleCount?: number;
  readonly longStrokeSampleCount?: number;
  readonly hokusaiSampleCount?: number;
  readonly timingRuns?: number;
}

function positiveInteger(value: string | undefined, flag: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} requires a positive integer`);
  }
  return parsed;
}

function parseArguments(argv: readonly string[]): CliOptions {
  let outputDirectory = resolve(
    process.cwd(),
    "artifacts/studio-brush-engine-selection",
  );
  let sampleCount: number | undefined;
  let longStrokeSampleCount: number | undefined;
  let hokusaiSampleCount: number | undefined;
  let timingRuns: number | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output-dir") {
      outputDirectory = resolve(argv[index + 1] ?? "");
      index += 1;
    } else if (argument === "--samples") {
      sampleCount = positiveInteger(argv[index + 1], argument);
      index += 1;
    } else if (argument === "--long-samples") {
      longStrokeSampleCount = positiveInteger(argv[index + 1], argument);
      index += 1;
    } else if (argument === "--hokusai-samples") {
      hokusaiSampleCount = positiveInteger(argv[index + 1], argument);
      index += 1;
    } else if (argument === "--timing-runs") {
      timingRuns = positiveInteger(argv[index + 1], argument);
      index += 1;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  return {
    outputDirectory,
    ...(sampleCount === undefined ? {} : { sampleCount }),
    ...(longStrokeSampleCount === undefined ? {} : { longStrokeSampleCount }),
    ...(hokusaiSampleCount === undefined ? {} : { hokusaiSampleCount }),
    ...(timingRuns === undefined ? {} : { timingRuns }),
  };
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const report = await runStudioBrushEngineSelectionBenchmark({
    sampleCount: options.sampleCount,
    longStrokeSampleCount: options.longStrokeSampleCount,
    hokusaiSampleCount: options.hokusaiSampleCount,
    timingRuns: options.timingRuns,
  });
  await mkdir(options.outputDirectory, { recursive: true });
  const jsonPath = resolve(
    options.outputDirectory,
    "studio-brush-engine-selection.json",
  );
  const markdownPath = resolve(
    options.outputDirectory,
    "studio-brush-engine-selection.md",
  );
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(
      markdownPath,
      renderStudioBrushEngineSelectionMarkdown(report),
      "utf8",
    ),
  ]);

  process.stdout.write(
    [
      `Studio brush-engine role gate: ${report.qualityGatePassed ? "PASS" : "FAIL"}`,
      `JSON: ${jsonPath}`,
      `Markdown: ${markdownPath}`,
      "Role selections:",
      ...report.roleDecisions.map(
        ({ role, selected, status }) => `- ${role}: ${selected} (${status})`,
      ),
      "",
    ].join("\n"),
  );
  if (!report.qualityGatePassed) process.exitCode = 1;
}

await main();
