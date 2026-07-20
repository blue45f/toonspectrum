import { createServer } from "node:http";

import { describe, expect, it, vi } from "vitest";

import {
  isPublicStudioRemoteReferenceAddress,
  NodeStudioRemoteReferenceHttpRequester,
  parseStudioRemoteReferenceUrl,
  resolveStudioRemoteReferenceEndpoint,
  StudioRemoteReferenceNetworkPolicyError,
} from "./studio-remote-reference-image.network";

import type { StudioRemoteReferenceDnsResolver } from "./studio-remote-reference-image.network";
import type { AddressInfo } from "node:net";

function resolver(
  answers: readonly { address: string; family: 4 | 6 }[]
): StudioRemoteReferenceDnsResolver {
  return { resolve: vi.fn().mockResolvedValue(answers) };
}

describe("studio remote reference network policy", () => {
  it.each([
    "0.0.0.0",
    "10.2.3.4",
    "100.64.0.1",
    "127.255.255.254",
    "169.254.169.254",
    "172.31.255.255",
    "192.168.1.1",
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::127.0.0.1",
    "::ffff:127.0.0.1",
    "64:ff9b::7f00:1",
    "2001:db8::1",
    "2002:7f00:1::",
    "3fff::1",
    "fc00::1",
    "fe80::1",
    "fec0::1",
    "ff02::1",
  ])("blocks local, metadata, transition, reserved or multicast address %s", (address) => {
    expect(isPublicStudioRemoteReferenceAddress(address)).toBe(false);
  });

  it.each([
    "1.1.1.1",
    "8.8.8.8",
    "93.184.216.34",
    "2001:4860:4860::8888",
    "2606:4700:4700::1111",
  ])("allows a globally routable address %s", (address) => {
    expect(isPublicStudioRemoteReferenceAddress(address)).toBe(true);
  });

  it("rejects the whole DNS answer when a public hostname also exposes a private route", async () => {
    const dns = resolver([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.7", family: 4 },
    ]);
    await expect(resolveStudioRemoteReferenceEndpoint(
      parseStudioRemoteReferenceUrl("https://images.example.org/reference.png"),
      dns
    )).rejects.toBeInstanceOf(StudioRemoteReferenceNetworkPolicyError);
  });

  it("returns a validated public endpoint that the transport can pin", async () => {
    const dns = resolver([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);
    await expect(resolveStudioRemoteReferenceEndpoint(
      parseStudioRemoteReferenceUrl("https://images.example.org/reference.png"),
      dns
    )).resolves.toEqual({ address: "93.184.216.34", family: 4 });
  });

  it.each([
    "http://localhost/image.png",
    "http://metadata.google.internal/latest/meta-data",
    "http://service.internal/image.png",
    "http://printer.local/image.png",
    "http://router.lan/image.png",
  ])("rejects local and metadata hostnames before DNS: %s", async (url) => {
    const dns = resolver([{ address: "93.184.216.34", family: 4 }]);
    await expect(resolveStudioRemoteReferenceEndpoint(
      parseStudioRemoteReferenceUrl(url),
      dns
    )).rejects.toBeInstanceOf(StudioRemoteReferenceNetworkPolicyError);
    expect(dns.resolve).not.toHaveBeenCalled();
  });

  it("normalizes alternate IPv4 spelling before applying the address policy", async () => {
    const dns = resolver([{ address: "93.184.216.34", family: 4 }]);
    const url = parseStudioRemoteReferenceUrl("http://2130706433/image.png");
    expect(url.hostname).toBe("127.0.0.1");
    await expect(resolveStudioRemoteReferenceEndpoint(url, dns))
      .rejects.toBeInstanceOf(StudioRemoteReferenceNetworkPolicyError);
    expect(dns.resolve).not.toHaveBeenCalled();
  });

  it("pins the socket to the validated address while preserving the original HTTP Host", async () => {
    let receivedHost: string | undefined;
    const server = createServer((request, response) => {
      receivedHost = request.headers.host;
      response.writeHead(200, { "content-type": "image/png" });
      response.end("pinned");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    const requester = new NodeStudioRemoteReferenceHttpRequester();
    try {
      const response = await requester.request({
        // The nonstandard ephemeral port is used only to exercise the transport in-process. The
        // URL policy layer rejects it before this requester in production.
        url: new URL(`http://does-not-resolve.invalid:${address.port}/reference.png`),
        endpoint: { address: "127.0.0.1", family: 4 },
        signal: new AbortController().signal,
      });
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.body) chunks.push(chunk);
      expect(Buffer.concat(chunks).toString("utf8")).toBe("pinned");
      expect(receivedHost).toBe(`does-not-resolve.invalid:${address.port}`);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => {
        if (error) reject(error);
        else resolve();
      }));
    }
  });
});
