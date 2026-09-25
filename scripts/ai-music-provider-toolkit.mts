#!/usr/bin/env tsx
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildMusicProviderHandoff,
  findMusicProvider,
  MUSIC_PROVIDER_CATALOG,
  type MusicProviderId,
} from "../apps/web/src/domains/creator/music/studio-music-provider-catalog";
import { buildMusicPrompt, parseMusicBrief } from "../packages/core/src/studio-music";

interface ParsedArguments {
  readonly command: string;
  readonly options: ReadonlyMap<string, string>;
}

function usage(): never {
  console.error(`Usage:
  pnpm music:providers
  pnpm music:handoff -- --provider <id> --brief <brief.json> [--prompt-file <prompt.txt>] [--out <handoff.json>]

The handoff command only creates a review manifest. It never calls a provider or spends credits.`);
  process.exit(1);
}

function parseArguments(argv: readonly string[]): ParsedArguments {
  const normalized = argv.filter((argument) => argument !== "--");
  const [command = "list", ...rest] = normalized;
  const options = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) usage();
    options.set(key.slice(2), value);
  }
  return { command, options };
}

function printProviders(): void {
  const rows = MUSIC_PROVIDER_CATALOG.map((provider) => ({
    id: provider.id,
    name: provider.name,
    free: provider.freeAccess,
    integration: provider.capabilities.join(","),
    publication: provider.publicationPolicy,
  }));
  console.table(rows);
  console.log("\nMCP / CLI details:");
  for (const provider of MUSIC_PROVIDER_CATALOG) {
    if (!provider.mcp && !provider.cli) continue;
    console.log(`- ${provider.name}`);
    if (provider.mcp) console.log(`  MCP: ${provider.mcp.serverUrl} (${provider.mcp.auth})`);
    if (provider.cli?.install) console.log(`  Install: ${provider.cli.install}`);
    if (provider.cli) console.log(`  CLI: ${provider.cli.command}`);
  }
}

function required(options: ReadonlyMap<string, string>, key: string): string {
  const value = options.get(key)?.trim();
  if (!value) usage();
  return value;
}
function createHandoff(options: ReadonlyMap<string, string>): void {
  const providerId = required(options, "provider");
  const provider = findMusicProvider(providerId);
  const briefPath = resolve(required(options, "brief"));
  const brief = parseMusicBrief(JSON.parse(readFileSync(briefPath, "utf8")));
  const promptPath = options.get("prompt-file");
  const prompt = promptPath
    ? readFileSync(resolve(promptPath), "utf8").trim()
    : buildMusicPrompt(brief);
  const handoff = buildMusicProviderHandoff(
    provider.id as MusicProviderId,
    brief,
    prompt,
  );
  const serialized = `${JSON.stringify(handoff, null, 2)}\n`;
  const outputPath = options.get("out");
  if (outputPath) {
    const resolvedOutput = resolve(outputPath);
    writeFileSync(resolvedOutput, serialized, { flag: "wx" });
    console.log(`Wrote review-only handoff: ${resolvedOutput}`);
    return;
  }
  process.stdout.write(serialized);
}

function main(): void {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (command === "list") {
    printProviders();
    return;
  }
  if (command === "handoff") {
    createHandoff(options);
    return;
  }
  usage();
}
try {
  main();
} catch (reason) {
  console.error(reason instanceof Error ? reason.message : "AI 음악 공급자 작업을 완료하지 못했습니다.");
  process.exitCode = 1;
}
