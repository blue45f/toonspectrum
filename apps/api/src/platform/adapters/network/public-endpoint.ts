import { BlockList, isIP, type LookupFunction } from "node:net";
import { lookup } from "node:dns/promises";
// Outbound webhooks may connect only to ordinary public addresses.
const v4 = new BlockList(), v6 = new BlockList();
for (const [network, prefix] of [["0.0.0.0",8],["10.0.0.0",8],["100.64.0.0",10],["127.0.0.0",8],["169.254.0.0",16],
  ["172.16.0.0",12],["192.0.0.0",24],["192.0.2.0",24],["192.88.99.0",24],["192.168.0.0",16],["198.18.0.0",15],
  ["198.51.100.0",24],["203.0.113.0",24],["224.0.0.0",4],["240.0.0.0",4]] as const) v4.addSubnet(network,prefix,"ipv4");
for (const [network, prefix] of [["2001::",23],["2001:db8::",32],["2002::",16],["3fff::",20]] as const) v6.addSubnet(network,prefix,"ipv6");
export function isPublicOutboundAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4 ? !v4.check(address,"ipv4") : family === 6 ? /^[23]/u.test(address) && !v6.check(address,"ipv6") : false;
}
export function parsePublicWebhookDestination(raw: string): URL {
  if (raw.length > 4096) throw new Error("destination-too-long");
  const url = new URL(raw), hostname = url.hostname.replace(/^\[|\]$/gu, "").replace(/\.$/u, "").toLowerCase();
  if (url.protocol !== "https:" || (url.port && url.port !== "443") || url.username || url.password || url.search || url.hash
    || !hostname || hostname === "localhost" || /\.(?:internal|localhost|local|localdomain|home|lan|test|invalid|example)$/u.test(hostname)
    || (isIP(hostname) && !isPublicOutboundAddress(hostname))) throw new Error("destination-not-public-https");
  return url;
}
export interface PublicOutboundAddress { readonly address: string; readonly family: 4 | 6 }
export async function resolvePublicOutboundAddress(url: URL): Promise<PublicOutboundAddress> {
  const hostname = url.hostname.replace(/^\[|\]$/gu, "");
  const literal = isIP(hostname);
  const answers = literal ? [{ address: hostname, family: literal }] : await lookup(hostname, { all: true, verbatim: true });
  if (!answers.length || answers.length > 64 || answers.some((item) => (item.family !== 4 && item.family !== 6)
    || isIP(item.address) !== item.family || !isPublicOutboundAddress(item.address))) throw new Error("destination-dns-not-public");
  return { address: answers[0]!.address, family: answers[0]!.family as 4 | 6 };
}
export function pinnedPublicLookup(endpoint: PublicOutboundAddress): LookupFunction {
  return ((_hostname: string, options: unknown, callback: (...args: unknown[]) => void) => {
    if (options && typeof options === "object" && "all" in options && options.all === true) callback(null, [endpoint]);
    else callback(null, endpoint.address, endpoint.family);
  }) as LookupFunction;
}
