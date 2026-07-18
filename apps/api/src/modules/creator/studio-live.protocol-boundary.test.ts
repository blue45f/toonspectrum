import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const protocolPath = fileURLToPath(new URL("./studio-live.protocol.ts", import.meta.url));
const gatewayPath = fileURLToPath(new URL("./studio-live.gateway.ts", import.meta.url));
const creatorModulePath = fileURLToPath(new URL("./creator.module.ts", import.meta.url));

describe("studio live protocol boundary", () => {
  it("keeps protocol dependencies one-way and free of gateway runtime orchestration", () => {
    const protocolSource = readFileSync(protocolPath, "utf8");

    expect(protocolSource).not.toMatch(/from\s+["']\.\/studio-live\.gateway["']/u);
    expect(protocolSource).not.toContain("@nestjs/websockets");
    expect(protocolSource).not.toContain("CreatorService");
    expect(protocolSource).not.toContain("StudioLiveGateway");
  });

  it("keeps schemas and session verification outside the gateway while preserving re-exports", () => {
    const gatewaySource = readFileSync(gatewayPath, "utf8");

    expect(gatewaySource).toContain('from "./studio-live.protocol"');
    expect(gatewaySource).not.toContain('from "zod"');
    expect(gatewaySource).not.toContain("verifySessionToken");
    expect(gatewaySource).not.toContain("isSessionAllowed");
    expect(gatewaySource).not.toMatch(/(?:const|let|var)\s+StudioLive\w+Schema\s*=/u);
    expect(gatewaySource).toMatch(
      /export\s*\{[\s\S]*StudioLiveJoinSchema[\s\S]*\}\s*from\s+["']\.\/studio-live\.protocol["']/u
    );
    expect(gatewaySource).toMatch(
      /export\s+type\s*\{[\s\S]*StudioLiveParticipant[\s\S]*\}\s*from\s+["']\.\/studio-live\.protocol["']/u
    );
  });

  it("wires authentication providers from their protocol owner", () => {
    const creatorModuleSource = readFileSync(creatorModulePath, "utf8");

    expect(creatorModuleSource).toMatch(
      /studioLiveSessionAuthenticatorProvider[\s\S]*from\s+["']\.\/studio-live\.protocol["']/u
    );
    expect(creatorModuleSource).toMatch(
      /StudioLiveGateway\s*\}\s*from\s+["']\.\/studio-live\.gateway["']/u
    );
  });
});
