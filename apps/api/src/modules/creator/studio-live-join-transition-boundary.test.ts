import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const sequencerPath = fileURLToPath(
  new URL("./studio-live-join-transition-sequencer.ts", import.meta.url)
);
const gatewayPath = fileURLToPath(new URL("./studio-live.gateway.ts", import.meta.url));
const creatorModulePath = fileURLToPath(new URL("./creator.module.ts", import.meta.url));

describe("studio live join transition boundary", () => {
  it("keeps the sequencer bounded and independent from room transaction policy", () => {
    const source = readFileSync(sequencerPath, "utf8");

    expect(source.split(/\r?\n/u).length).toBeLessThanOrEqual(140);
    expect(source).toContain("class StudioLiveJoinTransitionSequencer");
    expect(source).toContain("private readonly generations");
    expect(source).toContain("private readonly tails");
    expect(source).not.toContain("StudioLiveGateway");
    expect(source).not.toContain("CreatorService");
    expect(source).not.toContain("StudioLiveSocket");
    expect(source).not.toContain("client.join");
    expect(source).not.toContain("client.leave");
    expect(source).not.toContain("participant");
    expect(source).not.toContain("capabilities");
    expect(source).not.toContain("getWorkTeam");
  });

  it("makes the gateway consume the provider without retaining generation or tail maps", () => {
    const gatewaySource = readFileSync(gatewayPath, "utf8");
    const moduleSource = readFileSync(creatorModulePath, "utf8");

    expect(gatewaySource).toContain('from "./studio-live-join-transition-sequencer"');
    expect(gatewaySource).toContain(
      "private readonly joinTransitions: StudioLiveJoinTransitionSequencer"
    );
    expect(gatewaySource).not.toContain("joinTransitionSequences");
    expect(gatewaySource).not.toContain("joinTransitionTails");
    expect(gatewaySource).not.toContain("private nextJoinTransitionSequence(");
    expect(gatewaySource).not.toContain("private enqueueJoinTransition");
    expect(moduleSource).toMatch(/StudioLiveJoinTransitionSequencer[\s\S]*from\s+["']\.\/studio-live-join-transition-sequencer["']/u);
    expect(moduleSource).toMatch(/providers:\s*\[[\s\S]*StudioLiveJoinTransitionSequencer[\s\S]*StudioLiveGateway/u);
  });

  it("keeps latest-wins sequencing outside the adapter room transaction", () => {
    const gatewaySource = readFileSync(gatewayPath, "utf8");
    const joinStart = gatewaySource.indexOf("async join(");
    const performJoinStart = gatewaySource.indexOf("private async performJoin(", joinStart);
    const joinHandler = gatewaySource.slice(joinStart, performJoinStart);
    const currentStart = gatewaySource.indexOf("private isCurrentJoinTransition(");
    const rollbackStart = gatewaySource.indexOf("private async rollbackJoinedRoom(", currentStart);
    const currentCheck = gatewaySource.slice(currentStart, rollbackStart);

    expect(joinHandler).toContain("this.joinTransitions.runLatest(client.id");
    expect(joinHandler).toContain("this.performJoin(client, parsed.data, transitionSequence, ack)");
    expect(joinHandler.indexOf('this.consumeRateLimit(client.id, "join"'))
      .toBeLessThan(joinHandler.indexOf("this.joinTransitions.runLatest(client.id"));
    expect(currentCheck).toContain("this.isSocketCurrent(client)");
    expect(currentCheck).toContain(
      "this.joinTransitions.isCurrent(client.id, transitionSequence)"
    );
    expect(readFileSync(sequencerPath, "utf8")).not.toContain("isSocketCurrent");
  });

  it("preserves disconnect, revoke, and teardown invalidation ownership", () => {
    const gatewaySource = readFileSync(gatewayPath, "utf8");
    const disconnectStart = gatewaySource.indexOf("handleDisconnect(client: StudioLiveSocket)");
    const joinStart = gatewaySource.indexOf('@SubscribeMessage("studio:join")', disconnectStart);
    const disconnect = gatewaySource.slice(disconnectStart, joinStart);
    const revokeStart = gatewaySource.indexOf("private revokeParticipant(");
    const removeStart = gatewaySource.indexOf("private removeParticipant(", revokeStart);
    const revoke = gatewaySource.slice(revokeStart, removeStart);
    const destroyStart = gatewaySource.indexOf("onModuleDestroy(): void");
    const connectionStart = gatewaySource.indexOf("async handleConnection(", destroyStart);
    const destroy = gatewaySource.slice(destroyStart, connectionStart);

    expect(disconnect.indexOf("this.joinTransitions.invalidate(client.id)"))
      .toBeLessThan(disconnect.indexOf('this.removeParticipant(client.id, "disconnect")'));
    expect(revoke).toContain("this.joinTransitions.invalidate(socketId)");
    expect(destroy).toContain("this.joinTransitions.clearAll()");
  });
});
