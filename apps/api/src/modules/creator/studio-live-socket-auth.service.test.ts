import { describe, expect, it, vi } from "vitest";

import { StudioLiveSocketAuthService } from "./studio-live-socket-auth.service";

import type {
  StudioLiveAuthPrincipal,
  StudioLiveSocket,
} from "./studio-live.protocol";

function socket(id: string, sessionToken: unknown = `valid:${id}`): StudioLiveSocket {
  return {
    id,
    data: {},
    handshake: { auth: { sessionToken } },
  } as unknown as StudioLiveSocket;
}

function principal(userId: string, expiresAt = Date.now() + 60_000): StudioLiveAuthPrincipal {
  return { userId, sessionVersion: 1, expiresAt };
}

describe("StudioLiveSocketAuthService", () => {
  it("stores a private principal copy and redacts the consumed handshake token", async () => {
    const verified = principal("owner");
    const authenticate = vi.fn(async () => verified);
    const service = new StudioLiveSocketAuthService(authenticate, vi.fn(async () => true));
    const client = socket("owner");

    await expect(service.authenticate(client)).resolves.toBe(true);

    expect(authenticate).toHaveBeenCalledWith("valid:owner");
    expect(service.principal(client)).toEqual(verified);
    expect(service.principal(client)).not.toBe(verified);
    expect(client.handshake.auth).not.toHaveProperty("sessionToken");
    expect(client.data).toEqual({});
  });

  it("admits only the explicit bounded v1 guest credential shape", async () => {
    const authenticate = vi.fn(async () => null);
    const service = new StudioLiveSocketAuthService(authenticate, vi.fn(async () => true));
    const validGuest = socket(
      "guest",
      "guest:v1:7a75f75a-4abc-4def-8abc-04c9e58a52f1",
    );

    await expect(service.authenticate(validGuest)).resolves.toBe(true);
    expect(service.principal(validGuest)?.userId).toBe(
      "guest_7a75f75a-4abc-4def-8abc-04c9e58a52f1",
    );
    expect(validGuest.handshake.auth).not.toHaveProperty("sessionToken");
    expect(authenticate).not.toHaveBeenCalled();

    for (const legacy of [
      "guest:guessable",
      "anonymous:legacy",
      "guest:v1:not-a-uuid",
    ]) {
      const client = socket(legacy, legacy);
      await expect(service.authenticate(client)).resolves.toBe(false);
      expect(client.handshake.auth).not.toHaveProperty("sessionToken");
    }
    expect(authenticate).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["rejected", async () => null],
    ["expired", async () => principal("owner", Date.now() - 1)],
    ["failed", async () => { throw new Error("private verifier failure"); }],
  ] as const)("fails closed when authentication is %s", async (_case, authenticate) => {
    const service = new StudioLiveSocketAuthService(authenticate, vi.fn(async () => true));
    const client = socket("owner");

    await expect(service.authenticate(client)).resolves.toBe(false);

    expect(service.principal(client)).toBeUndefined();
    expect(client.handshake.auth).not.toHaveProperty("sessionToken");
  });

  it("rejects malformed tokens without invoking the authenticator", async () => {
    const authenticate = vi.fn(async () => principal("owner"));
    const service = new StudioLiveSocketAuthService(authenticate, vi.fn(async () => true));

    for (const token of [null, "", "x".repeat(8_193)]) {
      const client = socket("owner", token);
      await expect(service.authenticate(client)).resolves.toBe(false);
      expect(service.principal(client)).toBeUndefined();
      expect(client.handshake.auth).not.toHaveProperty("sessionToken");
    }
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("revalidates only the exact unexpired principal generation", async () => {
    let release!: (allowed: boolean) => void;
    const pending = new Promise<boolean>((resolve) => {
      release = resolve;
    });
    const authenticate = vi.fn(async (token: string) => principal(token.slice(6)));
    const revalidate = vi.fn(async () => pending);
    const service = new StudioLiveSocketAuthService(authenticate, revalidate);
    const client = socket("owner");
    await service.authenticate(client);
    const original = service.principal(client);
    const validation = service.revalidate(client);

    client.handshake.auth.sessionToken = "valid:replacement";
    await service.authenticate(client);
    release(true);

    await expect(validation).resolves.toBe(false);
    expect(service.principal(client)?.userId).toBe("replacement");
    expect(service.isPrincipalCurrent(client, original as StudioLiveAuthPrincipal, "owner"))
      .toBe(false);
  });

  it("does not classify an authenticated account as a guest by user-id prefix", async () => {
    const revalidate = vi.fn(async () => false);
    const service = new StudioLiveSocketAuthService(
      vi.fn(async () => principal("guest_legitimate-account")),
      revalidate,
    );
    const client = socket("prefixed-account");

    await expect(service.authenticate(client)).resolves.toBe(true);
    await expect(service.revalidate(client)).resolves.toBe(false);
    expect(revalidate).toHaveBeenCalledOnce();
  });

  it("turns revalidation exceptions and expiration into a private boolean denial", async () => {
    const revalidate = vi.fn(async () => { throw new Error("private database failure"); });
    const service = new StudioLiveSocketAuthService(
      vi.fn(async () => principal("owner")),
      revalidate
    );
    const client = socket("owner");
    await service.authenticate(client);

    await expect(service.revalidate(client)).resolves.toBe(false);
    const stored = service.principal(client);
    if (!stored) throw new Error("missing principal fixture");
    stored.expiresAt = Date.now() - 1;
    await expect(service.revalidate(client)).resolves.toBe(false);
    expect(revalidate).toHaveBeenCalledOnce();
  });

  it("clears by Socket identity, by reusable id, and at module teardown scope", async () => {
    const service = new StudioLiveSocketAuthService(
      vi.fn(async (token: string) => principal(token.slice(6))),
      vi.fn(async () => true)
    );
    const oldSocket = socket("shared", "valid:old");
    const replacementSocket = socket("shared", "valid:replacement");
    const peerSocket = socket("peer");
    await Promise.all([
      service.authenticate(oldSocket),
      service.authenticate(replacementSocket),
      service.authenticate(peerSocket),
    ]);

    service.clearBySocketId("shared", replacementSocket);
    expect(service.principal(replacementSocket)).toBeUndefined();
    expect(service.principal(oldSocket)?.userId).toBe("old");

    service.clearBySocketId("shared");
    expect(service.principal(oldSocket)).toBeUndefined();
    expect(service.principal(peerSocket)).toBeDefined();

    service.clearAll();
    expect(service.principal(peerSocket)).toBeUndefined();
  });
});
