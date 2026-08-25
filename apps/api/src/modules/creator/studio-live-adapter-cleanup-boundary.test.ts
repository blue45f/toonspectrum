import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const cleanupServicePath = fileURLToPath(
  new URL("./studio-live-adapter-cleanup.service.ts", import.meta.url)
);
const gatewayPath = fileURLToPath(new URL("./studio-live.gateway.ts", import.meta.url));
const cleanupPath = fileURLToPath(new URL("./studio-live-gateway-cleanup.ts", import.meta.url));
const creatorModulePath = fileURLToPath(new URL("./creator.module.ts", import.meta.url));

describe("studio live adapter cleanup boundary", () => {
  it("keeps the service bounded to leave/finalize/disconnect ordering", () => {
    const source = readFileSync(cleanupServicePath, "utf8");
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
    const cleanupSource = readFileSync(cleanupPath, "utf8");
    const moduleSource = readFileSync(creatorModulePath, "utf8");
    const invalidStart = cleanupSource.indexOf("export function disconnectInvalidSession(");
    const revokeStart = cleanupSource.indexOf("export function revokeParticipant(", invalidStart);
    const removeStart = cleanupSource.indexOf("export function removeParticipant(", revokeStart);
    const invalidSession = cleanupSource.slice(invalidStart, revokeStart);
    const revoke = cleanupSource.slice(revokeStart, removeStart);

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
    const source = readFileSync(cleanupPath, "utf8");
    const invalidStart = source.indexOf("export function disconnectInvalidSession(");
    const revokeStart = source.indexOf("export function revokeParticipant(", invalidStart);
    const removeStart = source.indexOf("export function removeParticipant(", revokeStart);
    const invalidSession = source.slice(invalidStart, revokeStart);
    const revoke = source.slice(revokeStart, removeStart);

    // Teardown releases the socket's connection slot, not the identity's rate-limit buckets: those
    // are keyed on the authenticated user and must outlive the socket so a reconnect cannot buy a
    // fresh budget.
    expect(invalidSession).toContain('this.removeParticipant(socketId, "revoked")');
    expect(invalidSession).toContain("this.releaseUserConnection(socketId)");
    expect(invalidSession).toContain("this.socketAuthentication.clearBySocketId(socketId, socket)");
    expect(revoke).toContain('this.removeParticipant(socketId, "revoked")');
    expect(revoke).toContain("this.releaseUserConnection(socketId)");
    expect(revoke).toContain("this.joinTransitions.invalidate(socketId)");
    expect(revoke).toContain("this.socketAuthentication.clearBySocketId(socketId, socket)");
  });

  it("commits local participant state before best-effort cleanup notifications", () => {
    const source = readFileSync(cleanupPath, "utf8");
    const invalidStart = source.indexOf("export function disconnectInvalidSession(");
    const revokeStart = source.indexOf("export function revokeParticipant(", invalidStart);
    const removeStart = source.indexOf("export function removeParticipant(", revokeStart);
    const releaseStart = source.indexOf("export function releaseSocketLocks(", removeStart);
    const notifyStart = source.indexOf(
      "export function emitCleanupNotificationBestEffort(",
      releaseStart
    );
    const notifyEnd = source.indexOf("export function localVoiceMembers(", notifyStart);
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
