import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const dispatcherPath = fileURLToPath(
  new URL("./studio-live-cleanup-notification-dispatcher.ts", import.meta.url)
);
const gatewayPath = fileURLToPath(new URL("./studio-live.gateway.ts", import.meta.url));
const creatorModulePath = fileURLToPath(new URL("./creator.module.ts", import.meta.url));
const clientTransportPath = fileURLToPath(
  new URL(
    "../../../../../src/domains/creator/studio-live-socket-transport.ts",
    import.meta.url
  )
);

describe("studio live cleanup notification dispatcher boundary", () => {
  it("owns one bounded process-local timer without gateway or domain policy", () => {
    const source = readFileSync(dispatcherPath, "utf8");

    expect(source.split(/\r?\n/u).length).toBeLessThanOrEqual(220);
    expect(source).toContain(
      "class StudioLiveCleanupNotificationDispatcher implements OnModuleDestroy"
    );
    expect(source).toContain("const RETRY_DELAYS_MS = [50, 250] as const");
    expect(source).toContain("const MAX_PENDING_NOTIFICATIONS = 512");
    expect(source).toContain("const MAX_PENDING_PER_TARGET = 128");
    expect(source).toContain("private retryTimer: ReturnType<typeof setTimeout> | null");
    expect(source).toContain("if (this.retryTimer) clearTimeout(this.retryTimer)");
    expect(source).toContain("this.pendingByTarget.clear()");
    expect(source).toContain("notification.isStillRelevant?.() ?? true");
    expect(source).not.toMatch(/setInterval|StudioLiveGateway|CreatorService|Namespace|Socket/u);
    expect(source.match(/setTimeout\(/gu)).toHaveLength(1);
  });

  it("wires bounded room tombstones while keeping terminal access delivery single-shot", () => {
    const gateway = readFileSync(gatewayPath, "utf8");
    const creatorModule = readFileSync(creatorModulePath, "utf8");
    const invalidStart = gateway.indexOf("private disconnectInvalidSession(");
    const revokeStart = gateway.indexOf("private revokeParticipant(", invalidStart);
    const removeStart = gateway.indexOf("private removeParticipant(", revokeStart);
    const releaseStart = gateway.indexOf("private releaseSocketLocks(", removeStart);
    const voiceStart = gateway.indexOf("private emitVoiceLeave(", releaseStart);
    const detachStart = gateway.indexOf("private detachVoiceMembership(", voiceStart);
    const invalid = gateway.slice(invalidStart, revokeStart);
    const revoke = gateway.slice(revokeStart, removeStart);
    const remove = gateway.slice(removeStart, releaseStart);
    const voice = gateway.slice(voiceStart, detachStart);

    expect(gateway).toContain(
      "private readonly cleanupNotifications: StudioLiveCleanupNotificationDispatcher"
    );
    expect(creatorModule).toMatch(
      /providers:\s*\[[\s\S]*StudioLiveCleanupNotificationDispatcher[\s\S]*StudioLiveGateway/u
    );
    expect(invalid).toContain('"studio:access:revoked"');
    expect(revoke).toContain('"studio:access:revoked"');
    expect(invalid).not.toContain('"bounded"');
    expect(revoke).not.toContain('"bounded"');
    expect(remove).toMatch(/"studio:presence:leave"[\s\S]*"bounded"/u);
    expect(remove).toContain("const current = this.participantsBySocket.get(socketId)");
    expect(voice).toMatch(/"studio:voice:leave"[\s\S]*"bounded"/u);
    expect(voice).toContain(
      "const current = this.voiceMembershipBySocket.get(member.connectionId)"
    );
  });

  it("only retries tombstones whose browser handlers tolerate duplicate delivery", () => {
    const source = readFileSync(clientTransportPath, "utf8");
    const presenceStart = source.indexOf("private applyPresenceLeave(");
    const presenceEnd = source.indexOf("private applyPresenceUpdate(", presenceStart);
    const voiceStart = source.indexOf("private readonly onVoiceLeave =");
    const voiceEnd = source.indexOf("private readonly onVoiceSignal =", voiceStart);
    const presence = source.slice(presenceStart, presenceEnd);
    const voice = source.slice(voiceStart, voiceEnd);

    expect(presence).toContain("this.participants.delete(connectionId)");
    expect(presence).toContain("if (!participant || participant.connectionId === this.selfConnectionId) return");
    expect(voice).toContain("if (current) this.voiceMemberByConnection.delete(value.connectionId)");
    expect(voice).toMatch(/if \(current && participant\.role !== "viewer" && !wasPending\)/u);
  });
});
