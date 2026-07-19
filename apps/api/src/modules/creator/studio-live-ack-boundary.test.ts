import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ackPath = fileURLToPath(new URL("./studio-live-ack.ts", import.meta.url));
const gatewayPath = fileURLToPath(new URL("./studio-live.gateway.ts", import.meta.url));

describe("studio live ACK ownership boundary", () => {
  it("keeps ACK policy in a bounded leaf without Nest, Socket.IO, repository, or gateway runtime", () => {
    const ackSource = readFileSync(ackPath, "utf8");
    const lineCount = ackSource.split(/\r?\n/u).length;

    expect(lineCount).toBeLessThanOrEqual(250);
    expect(ackSource).not.toContain("@nestjs/");
    expect(ackSource).not.toContain("socket.io");
    expect(ackSource).not.toContain("CreatorService");
    expect(ackSource).not.toContain("StudioLiveGateway");
    expect(ackSource).not.toContain("Repository");
    expect(ackSource).not.toContain("SubscribeMessage");
  });

  it("makes the gateway consume the leaf mapping instead of owning duplicate ACK policy", () => {
    const gatewaySource = readFileSync(gatewayPath, "utf8");

    expect(gatewaySource).toContain('from "./studio-live-ack"');
    expect(gatewaySource).toMatch(/replyStudioLiveAck\s+as\s+reply/u);
    expect(gatewaySource).toMatch(/studioLiveFailure\s+as\s+failure/u);
    expect(gatewaySource).not.toMatch(/function\s+(?:failure|reply)\s*(?:<|\()/u);
    expect(gatewaySource).not.toContain("private crdtFailure(");
    expect(gatewaySource).not.toContain("StudioCrdtBackpressureError");
    expect(gatewaySource).not.toContain("StudioCrdtStorageCorruptionError");
    expect(gatewaySource).toContain(
      'mapStudioLiveCrdtFailure(error, parsed.data.workId, "sync")'
    );
    expect(gatewaySource).toContain(
      'mapStudioLiveCrdtFailure(error, parsed.data.workId, "update")'
    );
  });

  it("preserves the CRDT update ACK-before-fan-out linearization contract in the gateway", () => {
    const gatewaySource = readFileSync(gatewayPath, "utf8");
    const updateStart = gatewaySource.indexOf("async applyCrdtUpdate(");
    const updateEnd = gatewaySource.indexOf('@SubscribeMessage("studio:lock:request")', updateStart);
    const updateHandler = gatewaySource.slice(updateStart, updateEnd);

    expect(updateStart).toBeGreaterThan(-1);
    expect(updateEnd).toBeGreaterThan(updateStart);
    expect(updateHandler).toContain("await this.studioCrdtService.applyUpdate({");
    expect(updateHandler).toContain("reply(ack, response);");
    expect(updateHandler).toContain('.emit("studio:crdt:update", remote);');
    expect(updateHandler.indexOf("await this.studioCrdtService.applyUpdate({"))
      .toBeLessThan(updateHandler.indexOf("reply(ack, response);"));
    expect(updateHandler.indexOf("reply(ack, response);"))
      .toBeLessThan(updateHandler.indexOf('.emit("studio:crdt:update", remote);'));
  });
});
