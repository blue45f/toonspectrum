import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const DEPLOY_DIRECTORY = resolve(process.cwd(), "deploy/coturn");
const ENTRYPOINT = join(DEPLOY_DIRECTORY, "entrypoint.sh");
const temporaryDirectories = new Set<string>();

afterEach(() => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { force: true, recursive: true });
  }
  temporaryDirectories.clear();
});

function activeConfigLines(): string[] {
  return readFileSync(join(DEPLOY_DIRECTORY, "turnserver.conf.template"), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function render(overrides: NodeJS.ProcessEnv = {}) {
  const directory = mkdtempSync(join(tmpdir(), "toonspectrum-coturn-"));
  temporaryDirectories.add(directory);
  const template = join(directory, "turnserver.conf.template");
  const secret = join(directory, "secret");
  const previousSecret = join(directory, "previous-secret");
  const certificate = join(directory, "fullchain.pem");
  const key = join(directory, "privkey.pem");
  const output = join(directory, "turnserver.conf");
  const testSecret = "test_secret_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  writeFileSync(template, "fingerprint\nuse-auth-secret\n", { mode: 0o600 });
  writeFileSync(secret, `${testSecret}\n`, { mode: 0o600 });
  writeFileSync(previousSecret, `${testSecret}\n`, { mode: 0o600 });
  writeFileSync(certificate, "test certificate\n", { mode: 0o600 });
  writeFileSync(key, "test private key\n", { mode: 0o600 });

  const result = spawnSync("sh", [ENTRYPOINT], {
    encoding: "utf8",
    env: {
      ...process.env,
      TURN_REALM: "voice.toonspectrum.test",
      TURN_EXTERNAL_IP: "8.8.8.8",
      TURN_SHARED_SECRET_FILE: secret,
      TURN_PREVIOUS_SHARED_SECRET_FILE: previousSecret,
      TURN_TLS_CERT_FILE: certificate,
      TURN_TLS_KEY_FILE: key,
      TURN_CONFIG_TEMPLATE: template,
      TURN_CONFIG_OUTPUT: output,
      TURN_SERVER_BINARY: "/usr/bin/true",
      TURN_RENDER_ONLY: "true",
      ...overrides,
    },
  });

  return { output, result, testSecret };
}

describe("coturn deployment scaffold", () => {
  it("is explicitly opt-in and uses host networking without published relay ports", () => {
    const compose = readFileSync(join(DEPLOY_DIRECTORY, "compose.yml"), "utf8");

    expect(compose).toContain('profiles: ["turn"]');
    expect(compose).toContain("network_mode: host");
    expect(compose).not.toMatch(/^\s+ports:/mu);
    expect(compose).toContain('cap_drop: ["ALL"]');
    expect(compose).toContain("no-new-privileges:true");
  });

  it("keeps REST auth, quotas, peer hardening, and bounded logs active", () => {
    const config = activeConfigLines();

    expect(config).toContain("use-auth-secret");
    expect(config).toContain("no-tcp-relay");
    expect(config).toContain("no-multicast-peers");
    expect(config).toContain("unauthorized-ratelimit");
    expect(config).toContain("log-file=stdout");
    expect(config).not.toContain("no-auth");
    expect(config).not.toContain("allow-loopback-peers");
    expect(config).not.toContain("server-relay");
    expect(config).not.toContain("verbose");
    expect(config).not.toContain("log-binding");
    expect(config).not.toContain("software-attribute");
    expect(config).not.toContain("prometheus");
  });

  it("renders a validated tmpfs config without printing the shared secret", () => {
    const { output, result, testSecret } = render();

    expect(result.status, result.stderr).toBe(0);
    const rendered = readFileSync(output, "utf8");
    expect(rendered).toContain("realm=voice.toonspectrum.test");
    expect(rendered).toContain("external-ip=8.8.8.8");
    expect(rendered).toContain("min-port=49160");
    expect(rendered).toContain("max-port=49259");
    expect(rendered).toContain(`static-auth-secret=${testSecret}`);
    expect(statSync(output).mode & 0o777).toBe(0o600);
    expect(`${result.stdout}${result.stderr}`).not.toContain(testSecret);
  });

  it("renders current and previous secrets for overlap rotation without logging either", () => {
    const directory = mkdtempSync(join(tmpdir(), "toonspectrum-coturn-rotation-"));
    temporaryDirectories.add(directory);
    const previousSecretPath = join(directory, "previous-secret");
    const previousSecret = "previous_secret_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    writeFileSync(previousSecretPath, `${previousSecret}\n`, { mode: 0o600 });

    const { output, result, testSecret } = render({
      TURN_PREVIOUS_SHARED_SECRET_FILE: previousSecretPath,
    });

    expect(result.status, result.stderr).toBe(0);
    const secretLines = readFileSync(output, "utf8")
      .split("\n")
      .filter((line) => line.startsWith("static-auth-secret="));
    expect(secretLines).toEqual([
      `static-auth-secret=${testSecret}`,
      `static-auth-secret=${previousSecret}`,
    ]);
    expect(`${result.stdout}${result.stderr}`).not.toContain(testSecret);
    expect(`${result.stdout}${result.stderr}`).not.toContain(previousSecret);
  });

  it("fails closed for placeholder realms and weak secrets", () => {
    const placeholder = render({ TURN_REALM: "voice.example.com" });
    expect(placeholder.result.status).toBe(78);
    expect(placeholder.result.stderr).toContain("certificate DNS name");

    const directory = mkdtempSync(join(tmpdir(), "toonspectrum-coturn-weak-"));
    temporaryDirectories.add(directory);
    const weakSecret = join(directory, "secret");
    writeFileSync(weakSecret, "short\n", { mode: 0o600 });
    const weak = render({
      TURN_SHARED_SECRET_FILE: weakSecret,
      TURN_PREVIOUS_SHARED_SECRET_FILE: weakSecret,
    });
    expect(weak.result.status).toBe(78);
    expect(weak.result.stderr).toContain("between 32 and 128");
  });

  it.each([
    "10.0.0.1",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.1.1",
    "172.16.0.1",
    "192.0.2.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "255.255.255.255",
    "2001:4860:4860::8888",
    "8.8.8",
    "8.8.8.999",
    "008.8.8.8",
  ])("rejects non-public or malformed external address %s", (address) => {
    const { result } = render({ TURN_EXTERNAL_IP: address });

    expect(result.status).toBe(78);
    expect(result.stderr).toContain("canonical public IPv4");
  });

  it("accepts a canonical public/private 1:1 NAT mapping", () => {
    const { output, result } = render({ TURN_RELAY_IP: "10.0.0.15" });

    expect(result.status, result.stderr).toBe(0);
    const rendered = readFileSync(output, "utf8");
    expect(rendered).toContain("external-ip=8.8.8.8/10.0.0.15");
    expect(rendered).toContain("relay-ip=10.0.0.15");
  });

  it.each(["10.0.0", "10.0.0.999", "010.0.0.1", "fe80::1", "relay.local"])(
    "rejects malformed relay address %s",
    (address) => {
      const { result } = render({ TURN_RELAY_IP: address });

      expect(result.status).toBe(78);
      expect(result.stderr).toContain("canonical IPv4 interface");
    }
  );

  it("rejects quotas larger than the bounded relay allocation range", () => {
    const { result } = render({ TURN_TOTAL_QUOTA: "101" });

    expect(result.status).toBe(78);
    expect(result.stderr).toContain("available relay port count");
  });
});
