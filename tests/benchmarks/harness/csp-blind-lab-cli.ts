/**
 * File-oriented operator CLI for the human CSP lab.
 *
 * Packet and sealed-key outputs are exclusive-create by design. Accidentally reusing an output
 * path must never overwrite a locked study or put a source key where a participant packet lived.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  analyzeCspBlindResponses,
  createCspBlindPacket,
} from "./csp-blind-lab";

import type {
  CspBlindResponse,
  CspBlindSealedKey,
  CspBlindStudy,
} from "./csp-blind-lab";

export const CSP_BLIND_LAB_USAGE = `Usage:
  pnpm exec tsx tests/benchmarks/harness/csp-blind-lab-cli.ts packet \\
    --study study.json --evaluator artist-001 --packet-out packet.json --key-out sealed-key.json

  pnpm exec tsx tests/benchmarks/harness/csp-blind-lab-cli.ts analyze \\
    --study study.json --keys sealed-keys.json --responses responses.json --out analysis.json
`;

interface CspBlindCliIo {
  readonly readJson: (path: string) => unknown;
  readonly writePublicJson: (path: string, value: unknown) => void;
  readonly writeSecretJson: (path: string, value: unknown) => void;
  readonly stdout: (value: string) => void;
  readonly stderr: (value: string) => void;
}

const fileIo: CspBlindCliIo = Object.freeze({
  readJson(path) {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  },
  writePublicJson(path, value) {
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o644,
    });
  },
  writeSecretJson(path, value) {
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  },
  stdout(value) {
    process.stdout.write(value);
  },
  stderr(value) {
    process.stderr.write(value);
  },
});

function options(argv: readonly string[]): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`invalid option near ${name ?? "<end>"}`);
    }
    if (result.has(name)) throw new Error(`duplicate option: ${name}`);
    result.set(name, value);
  }
  return result;
}

function exactOptions(
  parsed: ReadonlyMap<string, string>,
  expected: readonly string[],
): Readonly<Record<string, string>> {
  const allowed = new Set(expected);
  for (const name of parsed.keys()) {
    if (!allowed.has(name)) throw new Error(`unknown option: ${name}`);
  }
  const result: Record<string, string> = {};
  for (const name of expected) {
    const value = parsed.get(name);
    if (!value) throw new Error(`missing required option: ${name}`);
    result[name] = value;
  }
  return Object.freeze(result);
}

function arrayInput<T>(value: unknown, label: string): readonly T[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be a JSON array`);
  return value as readonly T[];
}

export function runCspBlindLabCli(
  argv: readonly string[],
  io: CspBlindCliIo = fileIo,
): number {
  const [command, ...rest] = argv;
  if (command === undefined || command === "help" || command === "--help") {
    io.stdout(CSP_BLIND_LAB_USAGE);
    return 0;
  }
  try {
    const parsed = options(rest);
    if (command === "packet") {
      const values = exactOptions(parsed, [
        "--study",
        "--evaluator",
        "--packet-out",
        "--key-out",
      ]);
      const result = createCspBlindPacket(
        io.readJson(values["--study"]!) as CspBlindStudy,
        values["--evaluator"]!,
      );
      io.writePublicJson(values["--packet-out"]!, result.packet);
      io.writeSecretJson(values["--key-out"]!, result.sealedKey);
      io.stdout(`packet created for ${result.packet.evaluatorId}\n`);
      return 0;
    }
    if (command === "analyze") {
      const values = exactOptions(parsed, [
        "--study",
        "--keys",
        "--responses",
        "--out",
      ]);
      const targetStudy = io.readJson(values["--study"]!) as CspBlindStudy;
      const keys = arrayInput<CspBlindSealedKey>(io.readJson(values["--keys"]!), "keys");
      const responses = arrayInput<CspBlindResponse>(
        io.readJson(values["--responses"]!),
        "responses",
      );
      const analysis = analyzeCspBlindResponses(targetStudy, keys, responses);
      io.writePublicJson(values["--out"]!, analysis);
      io.stdout(`CSP blind gate: ${analysis.gate}\n`);
      return analysis.gate === "pass" ? 0 : analysis.gate === "fail" ? 1 : 2;
    }
    throw new Error(`unknown command: ${command}`);
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 64;
  }
}

const isDirectRun = process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) process.exitCode = runCspBlindLabCli(process.argv.slice(2));
