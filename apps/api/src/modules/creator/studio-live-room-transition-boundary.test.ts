import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const coordinatorPath = fileURLToPath(
  new URL("./studio-live-room-transition-coordinator.ts", import.meta.url)
);
const gatewayPath = fileURLToPath(new URL("./studio-live.gateway.ts", import.meta.url));
const creatorModulePath = fileURLToPath(new URL("./creator.module.ts", import.meta.url));

describe("studio live room transition boundary", () => {
  it("keeps the coordinator bounded to adapter ordering and rollback", () => {
    const source = readFileSync(coordinatorPath, "utf8");

    expect(source.split(/\r?\n/u).length).toBeLessThanOrEqual(150);
    expect(source).toContain("class StudioLiveRoomTransitionCoordinator");
    expect(source).toContain("await input.socket.join(input.nextRoom)");
    expect(source).toContain("await input.socket.leave(input.previousRoom)");
    expect(source).toContain("await socket.leave(room)");
    expect(source).not.toContain("StudioLiveGateway");
    expect(source).not.toContain("CreatorService");
    expect(source).not.toContain("getWorkTeam");
    expect(source).not.toContain("StudioLiveAuthPrincipal");
    expect(source).not.toContain("participantsBySocket");
    expect(source).not.toContain("socketIdsByWork");
    expect(source).not.toContain("presence:update");
    expect(source).not.toContain("StudioLiveFailure");
  });

  it("wires the coordinator as a provider and removes room adapter I/O from performJoin", () => {
    const gatewaySource = readFileSync(gatewayPath, "utf8");
    const moduleSource = readFileSync(creatorModulePath, "utf8");
    const performStart = gatewaySource.indexOf("private async performJoin(");
    const presenceStart = gatewaySource.indexOf('@SubscribeMessage("studio:presence")', performStart);
    const performJoin = gatewaySource.slice(performStart, presenceStart);

    expect(gatewaySource).toContain('from "./studio-live-room-transition-coordinator"');
    expect(gatewaySource).toContain(
      "private readonly roomTransitions: StudioLiveRoomTransitionCoordinator"
    );
    expect(moduleSource).toMatch(/StudioLiveRoomTransitionCoordinator[\s\S]*from\s+["']\.\/studio-live-room-transition-coordinator["']/u);
    expect(moduleSource).toMatch(/providers:\s*\[[\s\S]*StudioLiveRoomTransitionCoordinator[\s\S]*StudioLiveGateway/u);
    expect(performJoin).toContain("this.roomTransitions.enterNextRoom({");
    expect(performJoin).toContain("this.roomTransitions.leavePreviousRoom({");
    expect(performJoin).not.toContain("await client.join(");
    expect(performJoin).not.toContain("await client.leave(");
    expect(gatewaySource).not.toContain("private async rollbackJoinedRoom(");
    expect(gatewaySource).not.toContain("private leaveRoomBestEffort(");
  });

  it("preserves authentication, ACL, adapter I/O, commit and fan-out order", () => {
    const source = readFileSync(gatewayPath, "utf8");
    const performStart = source.indexOf("private async performJoin(");
    const presenceStart = source.indexOf('@SubscribeMessage("studio:presence")', performStart);
    const performJoin = source.slice(performStart, presenceStart);
    const revalidate = performJoin.indexOf("await this.socketAuthentication.revalidate(client)");
    const acl = performJoin.indexOf("await this.creatorService.getWorkTeam");
    const enter = performJoin.indexOf("await this.roomTransitions.enterNextRoom({");
    const leave = performJoin.indexOf("await this.roomTransitions.leavePreviousRoom({");
    const removePrevious = performJoin.indexOf('this.removeParticipant(client.id, "switch")');
    const finalPrincipal = performJoin.lastIndexOf(
      "if (!this.isSocketPrincipalCurrent(client, principal, userId))"
    );
    const commit = performJoin.indexOf("this.participantsBySocket.set(client.id, participant)");
    const publish = performJoin.indexOf("this.publishParticipantToSocketData(client, participant)");
    const fanOut = performJoin.indexOf('.emit("studio:presence:update", safeParticipant)');

    expect(revalidate).toBeGreaterThan(-1);
    expect(revalidate).toBeLessThan(acl);
    expect(acl).toBeLessThan(enter);
    expect(enter).toBeLessThan(leave);
    expect(leave).toBeLessThan(removePrevious);
    expect(removePrevious).toBeLessThan(finalPrincipal);
    expect(finalPrincipal).toBeLessThan(commit);
    expect(commit).toBeLessThan(publish);
    expect(publish).toBeLessThan(fanOut);
  });

  it("checks replacement socket identity before latest-generation state", () => {
    const source = readFileSync(gatewayPath, "utf8");
    const stateStart = source.indexOf("private currentRoomTransitionState(");
    const disconnectStart = source.indexOf("private disconnectRoomIsolationFailure(", stateStart);
    const state = source.slice(stateStart, disconnectStart);

    expect(state).toContain('if (!this.isSocketCurrent(client)) return "socket_stale"');
    expect(state).toContain("this.joinTransitions.isCurrent(client.id, transitionSequence)");
    expect(state.indexOf("this.isSocketCurrent(client)"))
      .toBeLessThan(state.indexOf("this.joinTransitions.isCurrent"));
  });

  it("rechecks current state after each awaited coordinator result", () => {
    const source = readFileSync(gatewayPath, "utf8");
    const performStart = source.indexOf("private async performJoin(");
    const presenceStart = source.indexOf('@SubscribeMessage("studio:presence")', performStart);
    const performJoin = source.slice(performStart, presenceStart);

    expect(performJoin).toMatch(
      /let enteredRoomState = await this\.roomTransitions\.enterNextRoom\([\s\S]*if \(enteredRoomState === "current"\) \{[\s\S]*enteredRoomState = this\.currentRoomTransitionState/u
    );
    expect(performJoin).toMatch(
      /let leftPreviousRoomState = await this\.roomTransitions\.leavePreviousRoom\([\s\S]*if \(leftPreviousRoomState === "current"\) \{[\s\S]*leftPreviousRoomState = this\.currentRoomTransitionState/u
    );
    expect(performJoin).toContain("await this.roomTransitions.rollbackEnteredRoom(");
  });

  it("removes a post-leave participant only when the captured identity is still authoritative", () => {
    const source = readFileSync(gatewayPath, "utf8");
    const helperStart = source.indexOf("private removeSwitchedParticipantIfCurrent(");
    const rateLimitStart = source.indexOf("private consumeRateLimit(", helperStart);
    const helper = source.slice(helperStart, rateLimitStart);

    expect(helper).toContain(
      "if (this.participantsBySocket.get(socketId) !== expectedParticipant) return;"
    );
    expect(helper).toContain('this.removeParticipant(socketId, "switch")');
    expect(helper.indexOf("!== expectedParticipant"))
      .toBeLessThan(helper.indexOf("this.removeParticipant"));
  });
});
