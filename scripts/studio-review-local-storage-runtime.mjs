import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomBytes, X509Certificate } from "node:crypto";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import https from "node:https";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { requireUnusedApiTarget, validateIsolatedMarketApiTarget } from "./isolated-market-api.mjs";
import { createStudioReviewLocalStorageEnvironment } from "./studio-review-local-storage-config.mjs";

const run = promisify(execFile);
export const STUDIO_REVIEW_MINIO_IMAGE = "quay.io/minio/minio@sha256:9966a92a734f9411e32f4f41d7d9d826fcdc0f68c4e20b70295bd4e7c11f8a2f";
export const STUDIO_REVIEW_MC_IMAGE = "quay.io/minio/mc@sha256:37d109dddbbb2c95873f5fc81ac93f37023264770fc580a7564148892087b1b7";
const OWNER_LABEL = "io.toonspectrum.qa.review-storage";
const LEGACY_REVIEW_POSTGRES = "codex-virtual-studio-host-pg-20260920";
const ISOLATED_REVIEW_POSTGRES_PATTERN = /^codex-review-storage-test-pg-[a-f0-9]{10}$/u;
const REVIEW_POSTGRES_IMAGES = new Set([
  "postgres:16-alpine",
  "postgres@sha256:e013e867e712fec275706a6c51c966f0bb0c93cfa8f51000f85a15f9865a28cb",
]);

/** Creates one local CA without installing it in any system trust store. */
export async function createStudioReviewQaCertificates() {
  const directory = await mkdtemp(path.join(tmpdir(), "toonspectrum-review-storage-qa-"));
  await chmod(directory, 0o700);
  try {
    const extensions = path.join(directory, "server.cnf");
    const caConfig = path.join(directory, "ca.cnf");
    await writeFile(caConfig, "[req]\ndistinguished_name=dn\n[dn]\n[v3_ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n", { mode: 0o600 });
    await writeFile(extensions, "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=IP:127.0.0.1,DNS:localhost\n", { mode: 0o600 });
    await run("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-config", caConfig, "-extensions", "v3_ca", "-subj", "/CN=ToonSpectrum disposable review QA CA",
      "-keyout", path.join(directory, "ca.key"), "-out", path.join(directory, "ca.crt")]);
    await run("openssl", ["req", "-new", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=127.0.0.1",
      "-keyout", path.join(directory, "private.key"), "-out", path.join(directory, "server.csr")]);
    await run("openssl", ["x509", "-req", "-in", path.join(directory, "server.csr"), "-CA", path.join(directory, "ca.crt"),
      "-CAkey", path.join(directory, "ca.key"), "-CAcreateserial", "-days", "1", "-extfile", extensions, "-out", path.join(directory, "public.crt")]);
    for (const file of ["ca.key", "private.key"]) await chmod(path.join(directory, file), 0o600);
    return directory;
  } catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
}

/** Fetch with an explicit CA, real certificate validation and no ambient cookies.
 * @param {string | URL} url
 * @param {Buffer} ca
 * @param {{origin?: string}} options
 * @returns {Promise<{status: number | undefined, headers: import("node:http").IncomingHttpHeaders, bytes: Buffer}>}
 */
export async function readStudioReviewQaObject(url, ca, options = {}) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { ca, timeout: 15_000, ...(options.origin ? { headers: { Origin: options.origin } } : {}) }, (response) => {
      const chunks = []; let length = 0;
      response.on("data", (chunk) => {
        length += chunk.length;
        if (length > 16 * 1024 * 1024) request.destroy(new Error("QA object exceeds the bounded response size."));
        else chunks.push(chunk);
      });
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, bytes: Buffer.concat(chunks) }));
      response.on("error", reject);
    });
    request.on("timeout", () => request.destroy(new Error("QA HTTPS object timed out.")));
    request.on("error", reject);
  });
}

/** Owns only its uniquely named, labelled containers/volume and ephemeral certificate folder.
 * No images are pulled, unrelated services stopped, or production environment files read here.
 */
export async function withStudioReviewLocalStorage(environment, output, verify) {
  assert.equal(environment.STUDIO_QA_LOCAL_STORAGE, "true", "Explicit local storage QA opt-in is required.");
  assert.equal(process.arch, "arm64", "This verified image digest pair is Linux ARM64 only.");
  const context = (await run("docker", ["context", "show"])).stdout.trim();
  const details = JSON.parse((await run("docker", ["context", "inspect", context])).stdout)[0];
  assert(details.Endpoints.docker.Host.startsWith("unix://"), "Use an existing local Docker socket only.");
  const docker = async (args, extra = {}) => run("docker", ["--context", context, ...args], { maxBuffer: 1024 * 1024, ...extra });
  const database = validateIsolatedMarketApiTarget({ rawApiUrl: environment.STUDIO_QA_API_BASE_URL ?? "http://127.0.0.1:4355/",
    rawDatabaseUrl: environment.TEST_DATABASE_URL, environment });
  const pgName = environment.STUDIO_QA_OWNED_POSTGRES;
  assert(typeof pgName === "string" && (pgName === LEGACY_REVIEW_POSTGRES || ISOLATED_REVIEW_POSTGRES_PATTERN.test(pgName)),
    "Explicitly select the legacy Host QA PostgreSQL container or a uniquely named review-storage test container.");
  const postgres = JSON.parse((await docker(["inspect", pgName])).stdout)[0];
  const configuredPorts = postgres.HostConfig?.PortBindings?.["5432/tcp"];
  const assignedPorts = postgres.NetworkSettings?.Ports?.["5432/tcp"];
  const pgPorts = Array.isArray(assignedPorts) && assignedPorts.length > 0 ? assignedPorts : configuredPorts;
  assert(Array.isArray(pgPorts) && pgPorts.length === 1, "The owned PostgreSQL container must expose exactly one loopback port.");
  const databaseUrl = new URL(database.databaseUrl);
  assert.equal(databaseUrl.hostname, "127.0.0.1");
  assert.equal(pgPorts[0].HostIp, "127.0.0.1");
  assert(/^\d{4,5}$/u.test(pgPorts[0].HostPort), "The owned PostgreSQL container needs an assigned unprivileged port.");
  assert.equal(databaseUrl.port, pgPorts[0].HostPort, "The validated test URL must target the selected PostgreSQL container.");
  assert(REVIEW_POSTGRES_IMAGES.has(postgres.Config.Image), "Use the verified PostgreSQL 16 QA image only.");
  const postgresEnvironment = Object.fromEntries(postgres.Config.Env.map((entry) => entry.split(/=(.*)/su).slice(0, 2)));
  assert.equal(postgresEnvironment.POSTGRES_DB, database.databaseName);
  assert.equal(postgresEnvironment.POSTGRES_USER, decodeURIComponent(databaseUrl.username));
  if (ISOLATED_REVIEW_POSTGRES_PATTERN.test(pgName)) {
    assert.equal(postgres.Config.Labels?.["io.toonspectrum.qa.review-storage-postgres"], "true",
      "The isolated review PostgreSQL container must carry the explicit QA ownership label.");
    assert.equal(postgres.State.Running, true, "A random-port review test container must already be running.");
  }
  for (const image of [STUDIO_REVIEW_MINIO_IMAGE, STUDIO_REVIEW_MC_IMAGE]) await docker(["image", "inspect", image]);
  const port = Number(environment.STUDIO_QA_STORAGE_PORT ?? "59963");
  assert(Number.isInteger(port) && port >= 1024 && port <= 65535);
  assert(![Number(databaseUrl.port), database.apiPort, 5173, 5181].includes(port), "Storage cannot share a database/API/web port.");
  const endpoint = `https://127.0.0.1:${port}`;
  await requireUnusedApiTarget({ apiOrigin: endpoint, apiPort: port });
  const runId = randomBytes(6).toString("hex"), name = `codex-vs-review-storage-${runId}`, volume = `${name}-data`;
  const directory = await createStudioReviewQaCertificates();
  // Colima shares the repository path but not macOS /tmp. Keep CA material in /tmp and
  // copy only the server pair plus public CA into a run-owned, cleaned mount directory.
  const mountDirectory = await mkdtemp(path.join(output, `.minio-certs-${runId}-`));
  await chmod(mountDirectory, 0o700);
  await mkdir(path.join(mountDirectory, "CAs"), { mode: 0o700 });
  await copyFile(path.join(directory, "public.crt"), path.join(mountDirectory, "public.crt"));
  await copyFile(path.join(directory, "private.key"), path.join(mountDirectory, "private.key"));
  await copyFile(path.join(directory, "ca.crt"), path.join(mountDirectory, "CAs", "qa.crt"));
  await chmod(path.join(mountDirectory, "private.key"), 0o600);
  const options = { endpoint, runId, ownedDirectory: directory, accessKeyId: `qa${runId}`, secretAccessKey: randomBytes(32).toString("hex") };
  const buckets = ["source", "derived", "export"].map((purpose) => `qa-vs-review-${runId}-${purpose}`);
  const record = { context, endpoint, container: name, volume, certificateDirectory: directory, certificateMountDirectory: mountDirectory,
    images: [STUDIO_REVIEW_MINIO_IMAGE, STUDIO_REVIEW_MC_IMAGE], buckets, createdVolume: false, createdContainer: false,
    postgres: { name: pgName, id: postgres.Id, originalRunning: postgres.State.Running, startedByRun: false, restored: false },
    cleanup: { containerRemoved: false, volumeRemoved: false, certificatesRemoved: false }, publicAccessDenied: false };
  const saveRecord = () => writeFile(path.join(output, "local-storage-resources.json"), `${JSON.stringify(record, null, 2)}\n`);
  let result, failure, mayHaveContainer = false;
  try {
    const settings = createStudioReviewLocalStorageEnvironment(options);
    const ca = await readFile(settings.NODE_EXTRA_CA_CERTS);
    const server = new X509Certificate(await readFile(path.join(directory, "public.crt")));
    const spki = createHash("sha256").update(server.publicKey.export({ type: "spki", format: "der" })).digest("base64");
    // A random name is still checked before mutation: never adopt or remove an existing resource.
    assert.equal((await docker(["container", "ls", "-aq", "--filter", `name=^/${name}$`])).stdout.trim(), "");
    assert.equal((await docker(["volume", "ls", "-q", "--filter", `name=^${volume}$`])).stdout.trim(), "");
    await docker(["volume", "create", "--label", `${OWNER_LABEL}=${runId}`, volume]); record.createdVolume = true;
    await saveRecord();
    mayHaveContainer = true;
    await docker(["run", "-d", "--name", name, "--label", `${OWNER_LABEL}=${runId}`, "--memory", "512m", "--cpus", "1",
      "-p", `127.0.0.1:${port}:9000`, "-v", `${volume}:/data`,
      "-v", `${mountDirectory}:/certs:ro`,
      "-e", "MINIO_ROOT_USER", "-e", "MINIO_ROOT_PASSWORD", "-e", "MINIO_API_CORS_ALLOW_ORIGIN", "-e", "MINIO_BROWSER=off",
      STUDIO_REVIEW_MINIO_IMAGE, "server", "/data", "--address", ":9000", "--certs-dir", "/certs"],
    { env: { ...process.env, MINIO_ROOT_USER: options.accessKeyId, MINIO_ROOT_PASSWORD: options.secretAccessKey,
      MINIO_API_CORS_ALLOW_ORIGIN: "http://127.0.0.1:5181,http://127.0.0.1:5173" } });
    record.createdContainer = true; await saveRecord();
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { if ((await readStudioReviewQaObject(`${endpoint}/minio/health/live`, ca)).status === 200) { ready = true; break; } } catch { /* owned startup */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert(ready, "Owned TLS S3 server did not become ready.");
    const mc = async (args) => docker(["run", "--rm", "--name", `${name}-mc`, "--label", `${OWNER_LABEL}=${runId}`,
      "--network", `container:${name}`, "-v", `${path.join(mountDirectory, "CAs")}:/root/.mc/certs/CAs:ro`, "-e", "MC_HOST_qa", STUDIO_REVIEW_MC_IMAGE, ...args],
    { env: { ...process.env, MC_HOST_qa: `https://${options.accessKeyId}:${options.secretAccessKey}@127.0.0.1:9000` } });
    for (const bucket of buckets) {
      await mc(["mb", `qa/${bucket}`]);
      await mc(["anonymous", "set", "none", `qa/${bucket}`]);
      assert.equal((await readStudioReviewQaObject(`${endpoint}/${bucket}`, ca)).status, 403, "A QA bucket must reject anonymous listing.");
    }
    record.publicAccessDenied = true; await saveRecord();
    if (!record.postgres.originalRunning) {
      record.postgres.startedByRun = true; await saveRecord(); await docker(["start", pgName]);
    }
    result = await verify({ options, endpoint, ca, spki, record });
  } catch (error) { failure = error; }
  finally {
    const errors = [];
    if (mayHaveContainer) {
      try {
        for (const ownedName of [`${name}-mc`, name]) {
          const exists = (await docker(["container", "ls", "-aq", "--filter", `name=^/${ownedName}$`])).stdout.trim();
          if (!exists) continue;
          const actual = JSON.parse((await docker(["inspect", ownedName])).stdout)[0];
          assert.equal(actual.Config.Labels[OWNER_LABEL], runId);
          await docker(["rm", "-f", ownedName]);
        }
        record.cleanup.containerRemoved = true;
      } catch (error) { errors.push(error); }
    }
    if (record.createdVolume && (!record.createdContainer || record.cleanup.containerRemoved)) {
      try {
        const actual = JSON.parse((await docker(["volume", "inspect", volume])).stdout)[0];
        assert.equal(actual.Labels[OWNER_LABEL], runId);
        await docker(["volume", "rm", volume]); record.cleanup.volumeRemoved = true;
      } catch (error) { errors.push(error); }
    }
    try {
      await rm(directory, { recursive: true, force: true });
      await rm(mountDirectory, { recursive: true, force: true });
      record.cleanup.certificatesRemoved = true;
    } catch (error) { errors.push(error); }
    try {
      const actual = JSON.parse((await docker(["inspect", pgName])).stdout)[0];
      assert.equal(actual.Id, record.postgres.id, "Never stop a replacement PostgreSQL container.");
      if (record.postgres.startedByRun) await docker(["stop", "--time", "10", pgName]);
      const restored = JSON.parse((await docker(["inspect", pgName])).stdout)[0];
      assert.equal(restored.Id, record.postgres.id);
      assert.equal(restored.State.Running, record.postgres.originalRunning, "The owned PostgreSQL state must match its original state.");
      record.postgres.restored = true;
    } catch (error) { errors.push(error); }
    try { await saveRecord(); } catch (error) { errors.push(error); }
    if (errors.length) failure = new AggregateError([...(failure ? [failure] : []), ...errors], "Could not clean owned local storage QA resources.");
  }
  if (failure) throw failure;
  return result;
}
