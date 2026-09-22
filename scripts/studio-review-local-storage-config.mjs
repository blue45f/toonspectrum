import { createHash, X509Certificate } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** @typedef {{ endpoint: string, runId: string, ownedDirectory: string,
 * accessKeyId: string, secretAccessKey: string }} StudioReviewLocalStorageOptions */

/** A QA-only, exact-loopback storage capability. Never copy arbitrary parent storage env.
 * @param {StudioReviewLocalStorageOptions | undefined} options
 * @param {number[]} [reservedPorts]
 */
export function createStudioReviewLocalStorageEnvironment(options, reservedPorts = []) {
  if (options === undefined) return {};
  const fail = () => { throw new Error("Invalid owned loopback Studio review storage configuration."); };
  if (!options || typeof options !== "object"
    || Object.keys(options).sort().join(",") !== "accessKeyId,endpoint,ownedDirectory,runId,secretAccessKey") fail();
  const { endpoint, runId, ownedDirectory, accessKeyId, secretAccessKey } = options;
  if (!/^[a-f0-9]{12}$/u.test(runId) || accessKeyId !== `qa${runId}` || !/^[a-f0-9]{64}$/u.test(secretAccessKey)) fail();
  let url;
  try { url = new URL(endpoint); } catch { return fail(); }
  const port = Number(url.port);
  if (url.protocol !== "https:" || url.hostname !== "127.0.0.1" || url.username || url.password
    || url.pathname !== "/" || url.search || url.hash || !Number.isInteger(port) || port < 1024 || port > 65535
    || reservedPorts.includes(port) || endpoint !== url.origin) fail();
  if (!path.isAbsolute(ownedDirectory) || !/^toonspectrum-review-storage-qa-[A-Za-z0-9]+$/u.test(path.basename(ownedDirectory))) fail();
  const root = realpathSync(ownedDirectory), tempRoot = realpathSync(tmpdir());
  if (lstatSync(ownedDirectory).isSymbolicLink() || path.dirname(root) !== tempRoot) fail();
  const certificatePath = path.join(root, "ca.crt"), serverPath = path.join(root, "public.crt");
  for (const file of [certificatePath, serverPath]) {
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16_384) fail();
  }
  const ca = new X509Certificate(readFileSync(certificatePath));
  const server = new X509Certificate(readFileSync(serverPath));
  if (!ca.ca || !ca.verify(ca.publicKey) || !server.verify(ca.publicKey) || server.ca
    || server.checkIP("127.0.0.1") !== "127.0.0.1"
    || Date.parse(ca.validFrom) > Date.now() || Date.parse(ca.validTo) <= Date.now()
    || Date.parse(server.validFrom) > Date.now() || Date.parse(server.validTo) <= Date.now()) fail();
  const provider = "cloudflare-r2";
  const fingerprint = createHash("sha256").update(["source", "derived", "export"].map((purpose) => `${purpose}=${provider}`).join("\n")).digest("hex");
  return {
    NODE_EXTRA_CA_CERTS: certificatePath,
    PRIVATE_OBJECT_STORAGE_ENABLED: "true",
    PRIVATE_OBJECT_STORAGE_SOURCE_PROVIDER: provider,
    PRIVATE_OBJECT_STORAGE_DERIVED_PROVIDER: provider,
    PRIVATE_OBJECT_STORAGE_EXPORT_PROVIDER: provider,
    PRIVATE_OBJECT_STORAGE_ROUTING_FINGERPRINT: `sha256:${fingerprint}`,
    R2_OBJECT_STORAGE_ENABLED: "true",
    R2_OBJECT_STORAGE_ENDPOINT: endpoint,
    R2_OBJECT_STORAGE_REGION: "us-east-1",
    R2_OBJECT_STORAGE_ACCESS_KEY_ID: accessKeyId,
    R2_OBJECT_STORAGE_SECRET_ACCESS_KEY: secretAccessKey,
    R2_OBJECT_STORAGE_SOURCE_BUCKET: `qa-vs-review-${runId}-source`,
    R2_OBJECT_STORAGE_DERIVED_BUCKET: `qa-vs-review-${runId}-derived`,
    R2_OBJECT_STORAGE_EXPORT_BUCKET: `qa-vs-review-${runId}-export`,
    R2_OBJECT_STORAGE_PRIVATE_BUCKETS_CONFIRMED: "true",
    STUDIO_WORK_ASSET_ADMISSION: "enable-immutable-readonly-work-assets-v1",
  };
}
