#!/usr/bin/env node

const command = process.argv[2] ?? "legacy deployment";
console.error(
  `${command} is disabled by the free-strict infrastructure policy. `
  + "Use the reviewed manual Cloudflare deployment path documented in docs/FREE_INFRASTRUCTURE.md.",
);
process.exit(1);
