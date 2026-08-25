import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const authPath = fileURLToPath(new URL("./studio-live-socket-auth.service.ts", import.meta.url));
const gatewayPath = fileURLToPath(new URL("./studio-live.gateway.ts", import.meta.url));
const joinPath = fileURLToPath(new URL("./studio-live-gateway-join.ts", import.meta.url));
const creatorModulePath = fileURLToPath(new URL("./creator.module.ts", import.meta.url));

describe("studio live socket authentication boundary", () => {
  it("keeps private principal lifecycle in one bounded provider leaf", () => {
    const authSource = readFileSync(authPath, "utf8");

    expect(authSource.split(/\r?\n/u).length).toBeLessThanOrEqual(180);
    expect(authSource).toContain("class StudioLiveSocketAuthService");
    expect(authSource).toContain("new Map<StudioLiveSocket, StudioLiveAuthPrincipal>()");
    expect(authSource).toContain("@Inject(STUDIO_LIVE_SESSION_AUTHENTICATOR)");
    expect(authSource).toContain("@Inject(STUDIO_LIVE_SESSION_REVALIDATOR)");
    expect(authSource).not.toMatch(/(?:client|socket)\.data\s*(?:=|\.|\[)/u);
    expect(authSource).not.toContain("CreatorService");
    expect(authSource).not.toContain("StudioLiveGateway");
    expect(authSource).not.toContain("Namespace");
    expect(authSource).not.toContain(".emit(");
    expect(authSource).not.toContain(".disconnect(");
  });

  it("makes the gateway consume the auth facade without owning provider tokens or storage", () => {
    const gatewaySource = readFileSync(gatewayPath, "utf8");
    const moduleSource = readFileSync(creatorModulePath, "utf8");

    expect(gatewaySource).toContain('from "./studio-live-socket-auth.service"');
    expect(gatewaySource).toContain("private readonly socketAuthentication: StudioLiveSocketAuthService");
    expect(gatewaySource).not.toContain("authPrincipalsBySocket");
    expect(gatewaySource).not.toContain("private async authenticateSocket(");
    expect(gatewaySource).not.toContain("private async revalidateSocketSession(");
    expect(gatewaySource).not.toContain("private readonly authenticateSession");
    expect(gatewaySource).not.toContain("private readonly revalidateSession");
    expect(moduleSource).toMatch(/StudioLiveSocketAuthService[\s\S]*from\s+["']\.\/studio-live-socket-auth\.service["']/u);
    expect(moduleSource).toMatch(/providers:\s*\[[\s\S]*StudioLiveSocketAuthService[\s\S]*StudioLiveGateway/u);
  });

  it("preserves authenticate-before-admission and revalidate-before-work-ACL order", () => {
    const gatewaySource = readFileSync(gatewayPath, "utf8");
    const joinSource = readFileSync(joinPath, "utf8");
    const afterInitStart = gatewaySource.indexOf("afterInit(server: Namespace)");
    const connectionStart = gatewaySource.indexOf("async handleConnection(", afterInitStart);
    const middleware = gatewaySource.slice(afterInitStart, connectionStart);
    const joinStart = joinSource.indexOf("export async function performJoin(");
    const disconnectStart = joinSource.indexOf(
      "export function disconnectInvalidJoinSession(",
      joinStart
    );
    const join = joinSource.slice(joinStart, disconnectStart);

    expect(afterInitStart).toBeGreaterThan(-1);
    expect(connectionStart).toBeGreaterThan(afterInitStart);
    expect(middleware.indexOf("this.socketAuthentication.authenticate"))
      .toBeLessThan(middleware.indexOf("next();"));
    expect(join.indexOf("await this.socketAuthentication.revalidate(client)"))
      .toBeLessThan(join.indexOf("await this.creatorService.getWorkTeam"));
  });

  it("clears private authentication before disconnect cleanup can publish a leave", () => {
    const gatewaySource = readFileSync(gatewayPath, "utf8");
    const disconnectStart = gatewaySource.indexOf("handleDisconnect(client: StudioLiveSocket)");
    const joinStart = gatewaySource.indexOf('@SubscribeMessage("studio:join")', disconnectStart);
    const disconnect = gatewaySource.slice(disconnectStart, joinStart);

    expect(disconnectStart).toBeGreaterThan(-1);
    expect(joinStart).toBeGreaterThan(disconnectStart);
    expect(disconnect.indexOf("this.socketAuthentication.clear(client)"))
      .toBeLessThan(disconnect.indexOf('this.removeParticipant(client.id, "disconnect")'));
  });
});
