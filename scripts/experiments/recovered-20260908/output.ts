import { mkdirSync } from "node:fs";
import { join } from "node:path";

/** The opt-in launcher owns the output directory; experiments never rewrite benchmark baselines. */
export function resolveExperimentOutput(name: string): string {
  const root = process.env.TOONSPECTRUM_RECOVERED_OUTPUT;
  if (!root || process.env.TOONSPECTRUM_RECOVERED_OPT_IN !== "1") {
    throw new Error("Use run.mts --run <experiment> to explicitly enable recovered experiments.");
  }
  const directory = join(root, name);
  mkdirSync(directory, { recursive: true });
  return directory;
}
