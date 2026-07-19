import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const transportPath = fileURLToPath(
  new URL("./studio-live-inter-server-relay-transport.ts", import.meta.url)
);
const gatewayPath = fileURLToPath(new URL("./studio-live.gateway.ts", import.meta.url));
const creatorModulePath = fileURLToPath(new URL("./creator.module.ts", import.meta.url));

describe("studio live inter-server relay transport boundary", () => {
  it("keeps adapter listener, ACK and timeout mechanics in one bounded provider", () => {
    const source = readFileSync(transportPath, "utf8");

    expect(source.split(/\r?\n/u).length).toBeLessThanOrEqual(150);
    expect(source).toContain(
      "class StudioLiveInterServerRelayTransport implements OnModuleDestroy"
    );
    expect(source).toContain("namespace.on(STUDIO_LIVE_INTER_SERVER_RELAY_EVENT");
    expect(source).toContain("this.namespace?.off(STUDIO_LIVE_INTER_SERVER_RELAY_EVENT");
    expect(source).toContain("namespace.serverSideEmitWithAck(");
    expect(source).toContain("const responses = await Promise.race([");
    expect(source).toContain("return delivered === 1");
    expect(source).toContain("if (timeout) clearTimeout(timeout)");
    expect(source).not.toMatch(
      /StudioLiveGateway|CreatorService|participantsBySocket|voiceMembershipBySocket|candidateRelayAuthorizations/u
    );
    expect(source).not.toMatch(/setInterval|retryTimer|RETRY_DELAYS/u);
  });

  it("makes the gateway delegate transport mechanics while retaining relay policy", () => {
    const gateway = readFileSync(gatewayPath, "utf8");
    const module = readFileSync(creatorModulePath, "utf8");
    const sendStart = gateway.indexOf("private async sendInterServerRelay(");
    const receiveStart = gateway.indexOf("private async receiveInterServerRelay(", sendStart);
    const discoveryStart = gateway.indexOf("private async discoverVoiceRelayPeers(", receiveStart);
    const send = gateway.slice(sendStart, receiveStart);
    const receive = gateway.slice(receiveStart, discoveryStart);

    expect(gateway).toContain(
      "private readonly interServerRelayTransport: StudioLiveInterServerRelayTransport"
    );
    expect(gateway).not.toContain("private interServerNamespace");
    expect(gateway).not.toContain("private readonly interServerRelayListener");
    expect(gateway).not.toContain("serverSideEmitWithAck(");
    expect(send).toContain("StudioLiveInterServerRelayRequestSchema.parse({");
    expect(send).toContain("return this.interServerRelayTransport.send(request)");
    expect(send).not.toMatch(/setTimeout|clearTimeout/u);
    expect(receive).toContain("this.participantsBySocket.get(targetConnectionId)");
    expect(receive).toContain("this.authorizedParticipantWithMode(");
    expect(receive).toContain("this.voiceMembershipBySocket.get(target.connectionId)");
    expect(receive).toContain("this.isParticipantAuthorizationCurrent(");
    expect(receive).toContain("this.consumeInterServerVoiceSignal(");
    expect(module).toMatch(
      /providers:\s*\[[\s\S]*StudioLiveInterServerRelayTransport[\s\S]*StudioLiveGateway/u
    );
  });
});
