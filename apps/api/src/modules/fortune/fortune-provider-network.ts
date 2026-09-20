import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";

import type { LookupFunction } from "node:net";

const v4 = new BlockList(), v6 = new BlockList();
for (const [ip, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]] as const) v4.addSubnet(ip, prefix, "ipv4");
for (const [ip, prefix] of [["::", 96], ["::ffff:0:0", 96], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64], ["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8]] as const) v6.addSubnet(ip, prefix, "ipv6");
export function publicFortuneAddress(ip: string) { const f = isIP(ip); return f === 4 ? !v4.check(ip, "ipv4") : f === 6 ? /^[23]/u.test(ip) && !v6.check(ip, "ipv6") : false; }
export function fortuneEndpoint(endpoint: string, allowlist: readonly string[]): URL {
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash || isIP(url.hostname) || !allowlist.includes(url.origin)
    || !url.hostname.includes(".") || /(^|\.)(localhost|local|internal|test|invalid|home|lan)$/iu.test(url.hostname)) throw new Error("provider-not-approved");
  return url;
}
/** Fixed allowlisted HTTPS origin, pinned DNS address, no redirects, no cookies or API keys. */
export async function fetchFortuneJson(url: URL, signal: AbortSignal): Promise<unknown> {
  const answers = await lookup(url.hostname, { all: true, verbatim: true });
  if (signal.aborted) throw new Error("timeout");
  if (!answers.length || answers.length > 64 || answers.some((a) => !publicFortuneAddress(a.address))) throw new Error("private-provider-address");
  const address = answers[0];
  const pinned = ((_: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => options?.all ? callback(null, [address]) : callback(null, address.address, address.family)) as LookupFunction;
  return new Promise((resolve, reject) => {
    const req = request(url, { method: "GET", agent: false, lookup: pinned, family: address.family, servername: url.hostname, rejectUnauthorized: true, signal, maxHeaderSize: 8192, headers: { Accept: "application/json" } }, (res) => {
      if (res.statusCode !== 200 || !res.headers["content-type"]?.startsWith("application/json")) { res.destroy(); reject(new Error("provider-response-invalid")); return; }
      const chunks: Buffer[] = []; let bytes = 0;
      res.on("data", (chunk: Buffer) => { bytes += chunk.byteLength; if (bytes > 32768) { res.destroy(); reject(new Error("provider-response-too-large")); } else chunks.push(chunk); });
      res.on("error", () => reject(new Error("provider-response-failed")));
      res.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { reject(new Error("provider-json-invalid")); } });
    });
    req.on("error", () => reject(new Error("provider-unavailable"))); req.end();
  });
}
