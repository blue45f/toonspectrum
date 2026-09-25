import { request } from "node:https";
import { isIP } from "node:net";
import { parsePublicWebhookDestination, pinnedPublicLookup, resolvePublicOutboundAddress } from "../../platform/network/public-endpoint";
import { ProductionExternalHttpError } from "./production-integration-http";

async function withinSignal<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let dispose = () => {};
  try {
    return await Promise.race([operation, new Promise<never>((_resolve, reject) => {
      const abort = () => reject(signal.reason); signal.addEventListener("abort", abort, { once: true });
      dispose = () => signal.removeEventListener("abort", abort);
    })]);
  } finally { dispose(); }
}
/** Only the server-configured generic notification destination reaches this transport. */
export async function sendProtectedWebhook(urlString: string, headers: Readonly<Record<string, string>>, body: string, timeoutMs: number): Promise<Record<string, unknown>> {
  let dispatched = false;
  try {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000 || Buffer.byteLength(body) > 65_536) throw new Error("invalid-webhook-limits");
    const url = parsePublicWebhookDestination(urlString), signal = AbortSignal.timeout(timeoutMs);
    const endpoint = await withinSignal(resolvePublicOutboundAddress(url), signal); signal.throwIfAborted();
    const hostname = url.hostname.replace(/^\[|\]$/gu, "");
    const bytes = await new Promise<Buffer>((resolve, reject) => {
      const handle = request(url, { method: "POST", agent: false, family: endpoint.family, lookup: pinnedPublicLookup(endpoint),
        servername: isIP(hostname) ? undefined : hostname, rejectUnauthorized: true, signal, maxHeaderSize: 16_384,
        headers: { ...headers, "Content-Length": String(Buffer.byteLength(body)), "Accept-Encoding": "identity", Connection: "close" } }, (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400) { response.destroy(); reject(new ProductionExternalHttpError("external_redirect_blocked", status, true)); return; }
        if (response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity") {
          response.destroy(); reject(new ProductionExternalHttpError("external_encoding_blocked", status, true)); return;
        }
        const declared = Number(response.headers["content-length"] ?? 0);
        if (!Number.isFinite(declared) || declared < 0 || declared > 1_048_576) { response.destroy(); reject(new ProductionExternalHttpError("external_response_too_large", status, true)); return; }
        const chunks: Buffer[] = []; let length = 0;
        response.on("data", (chunk: Buffer) => {
          length += chunk.byteLength;
          if (length > 1_048_576) { response.destroy(); reject(new ProductionExternalHttpError("external_response_too_large", status, true)); }
          else chunks.push(chunk);
        });
        response.once("error", reject);
        response.once("aborted", () => reject(new ProductionExternalHttpError("external_response_incomplete", status, true)));
        response.once("end", () => {
          if (length > 1_048_576 || (response.headers["content-length"] !== undefined && declared !== length)) {
            reject(new ProductionExternalHttpError("external_response_incomplete", status, true)); return;
          }
          if (status < 200 || status >= 300) { reject(new ProductionExternalHttpError(`external_http_${status}`, status, status >= 500 || status === 429)); return; }
          resolve(Buffer.concat(chunks, length));
        });
      });
      handle.once("error", reject); dispatched = true; handle.end(body);
    });
    if (!bytes.length) return {};
    const parsed: unknown = JSON.parse(bytes.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("unexpected-webhook-response");
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ProductionExternalHttpError) throw error;
    throw new ProductionExternalHttpError(dispatched ? "external_webhook_result_uncertain" : "external_webhook_destination_rejected", null, dispatched);
  }
}
