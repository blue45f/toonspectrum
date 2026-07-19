import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const cleanupPath = fileURLToPath(
  new URL("./studio-live-adapter-cleanup.service.ts", import.meta.url)
);
const gatewayPath = fileURLToPath(new URL("./studio-live.gateway.ts", import.meta.url));
const creatorModulePath = fileURLToPath(new URL("./creator.module.ts", import.meta.url));

describe("studio live adapter cleanup boundary", () => {
  it("keeps the service bounded to leave/finalize/disconnect ordering", () => {
    const source = readFileSync(cleanupPath, "utf8");
    const leave = source.indexOf("this.startRoomLeaveBestEffort");
    const finalize = source.indexOf("input.finalizeLocalState()");
    const disconnect = source.indexOf("input.socket?.disconnect(true)");

    expect(source.split(/\r?\n/u).length).toBeLessThanOrEqual(100);
    expect(source).toContain("class StudioLiveAdapterCleanupService");
    expect(leave).toBeGreaterThan(-1);
    expect(leave).toBeLessThan(finalize);
    expect(finalize).toBeLessThan(disconnect);
    expect(source).not.toContain("StudioLiveGateway");
    expect(source).not.toContain("CreatorService");
    expect(source).not.toContain("participantsBySocket");
    expect(source).not.toContain("StudioLiveAuthPrincipal");
    expect(source).not.toContain("studio:access:revoked");
    expect(source).not.toContain("studio:presence:leave");
    expect(source).not.toContain("StudioLiveFailure");
  });

  it("wires the service and removes duplicated adapter cleanup from revocation methods", () => {
    const gatewaySource = readFileSync(gatewayPath, "utf8");
    const moduleSource = readFileSync(creatorModulePath, "utf8");
    const invalidStart = gatewaySource.indexOf("private disconnectInvalidSession(");
    const revokeStart = gatewaySource.indexOf("private revokeParticipant(", invalidStart);
    const removeStart = gatewaySource.indexOf("private removeParticipant(", revokeStart);
    const invalidSession = gatewaySource.slice(invalidStart, revokeStart);
    const revoke = gatewaySource.slice(revokeStart, removeStart);

    expect(gatewaySource).toContain('from "./studio-live-adapter-cleanup.service"');
    expect(gatewaySource).toContain(
      "private readonly adapterCleanup: StudioLiveAdapterCleanupService"
    );
    expect(moduleSource).toMatch(/StudioLiveAdapterCleanupService[\s\S]*from\s+["']\.\/studio-live-adapter-cleanup\.service["']/u);
    expect(moduleSource).toMatch(/providers:\s*\[[\s\S]*StudioLiveAdapterCleanupService[\s\S]*StudioLiveGateway/u);
    expect(invalidSession).toContain("this.adapterCleanup.closeRoomTransport({");
    expect(revoke).toContain("this.adapterCleanup.closeRoomTransport({");
    expect(invalidSession).not.toContain("socket?.leave(");
    expect(revoke).not.toContain("socket?.leave(");
    expect(invalidSession).not.toContain("socket.disconnect(true)");
    expect(revoke).not.toContain("socket.disconnect(true)");
  });

  it("keeps participant, rate, generation and authentication policy in gateway callbacks", () => {
    const source = readFileSync(gatewayPath, "utf8");
    const invalidStart = source.indexOf("private disconnectInvalidSession(");
    const revokeStart = source.indexOf("private revokeParticipant(", invalidStart);
    const removeStart = source.indexOf("private removeParticipant(", revokeStart);
    const invalidSession = source.slice(invalidStart, revokeStart);
    const revoke = source.slice(revokeStart, removeStart);

    expect(invalidSession).toContain('this.removeParticipant(socketId, "revoked")');
    expect(invalidSession).toContain("this.rateLimits.delete(socketId)");
    expect(invalidSession).toContain("this.socketAuthentication.clearBySocketId(socketId, socket)");
    expect(revoke).toContain('this.removeParticipant(socketId, "revoked")');
    expect(revoke).toContain("this.rateLimits.delete(socketId)");
    expect(revoke).toContain("this.joinTransitions.invalidate(socketId)");
    expect(revoke).toContain("this.socketAuthentication.clearBySocketId(socketId, socket)");
  });

  it("commits local participant state before best-effort cleanup notifications", () => {
    const source = readFileSync(gatewayPath, "utf8");
    const invalidStart = source.indexOf("private disconnectInvalidSession(");
    const revokeStart = source.indexOf("private revokeParticipant(", invalidStart);
    const removeStart = source.indexOf("private removeParticipant(", revokeStart);
    const releaseStart = source.indexOf("private releaseSocketLocks(", removeStart);
    const notifyStart = source.indexOf(
      "private emitCleanupNotificationBestEffort(",
      releaseStart
    );
    const notifyEnd = source.indexOf("private localVoiceMembers(", notifyStart);
    const invalidSession = source.slice(invalidStart, revokeStart);
    const revoke = source.slice(revokeStart, removeStart);
    const remove = source.slice(removeStart, releaseStart);
    const notificationLeaf = source.slice(notifyStart, notifyEnd);
    const localCommitMarkers = [
      "this.detachVoiceMembership(socketId)",
      "this.participantsBySocket.delete(socketId)",
      "delete socket.data.studioParticipant",
      "delete socket.data.studioWorkId",
      "this.participantAuthorizationRechecks.delete(socketId)",
      "this.deleteCandidateRelayAuthorizationsForSocket(socketId)",
      "roomSockets?.delete(socketId)",
    ];
    const voiceNotification = remove.indexOf("this.emitVoiceLeave(");
    const presenceNotification = remove.indexOf(
      "this.emitCleanupNotificationBestEffort("
    );

    expect(invalidSession).toContain(
      'this.emitCleanupNotificationBestEffort(socketId, "studio:access:revoked"'
    );
    expect(revoke).toContain(
      'this.emitCleanupNotificationBestEffort(socketId, "studio:access:revoked"'
    );
    expect(notificationLeaf).toContain("this.cleanupNotifications.dispatch({");
    expect(notificationLeaf).toContain(
      "deliver: () => this.server.to(target).emit(event, payload)"
    );
    expect(notificationLeaf).not.toMatch(/try\s*\{/u);
    expect(voiceNotification).toBeGreaterThan(-1);
    expect(presenceNotification).toBeGreaterThan(voiceNotification);
    expect(remove.slice(presenceNotification)).toContain('"bounded"');
    for (const marker of localCommitMarkers) {
      expect(remove.indexOf(marker)).toBeGreaterThan(-1);
      expect(remove.indexOf(marker)).toBeLessThan(voiceNotification);
    }
  });
});
