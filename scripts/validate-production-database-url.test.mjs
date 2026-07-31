import { expect, test } from "vitest";

import {
  createPsqlEnvironment,
  validateProductionDatabaseUrl,
} from "./validate-production-database-url.mjs";

const DIRECT_URL =
  "postgresql://artist:secret@ep-direct.ap-southeast-1.aws.neon.tech/toonspectrum?sslmode=verify-full&channel_binding=require";

test("accepts the exact direct PostgreSQL production contract", () => {
  expect(validateProductionDatabaseUrl(DIRECT_URL)).toEqual({
    protocol: "postgresql:",
    hostname: "ep-direct.ap-southeast-1.aws.neon.tech",
    port: "5432",
    databaseName: "toonspectrum",
    tlsVerified: true,
  });
});

test("accepts an explicit authority port without allowing a query override", () => {
  expect(
    validateProductionDatabaseUrl(
      DIRECT_URL.replace(".tech/", ".tech:5432/"),
    ).port,
  ).toBe("5432");
});

for (const [name, value, pattern] of [
  [
    "pooler authority",
    DIRECT_URL.replace("ep-direct.", "ep-direct-pooler."),
    /pooler/u,
  ],
  [
    "generic pooler hostname",
    DIRECT_URL.replace(
      "ep-direct.ap-southeast-1.aws.neon.tech",
      "pooler.example.com",
    ),
    /pooler/u,
  ],
  [
    "libpq host override",
    DIRECT_URL.replace(
      "?",
      "?host=pooler.example.com&",
    ),
    /query parameter "host"/u,
  ],
  [
    "percent-encoded libpq host override",
    DIRECT_URL.replace(
      "?",
      "?ho%73t=pooler.example.com&",
    ),
    /query parameter "host"/u,
  ],
  [
    "libpq hostaddr override",
    DIRECT_URL.replace("?", "?hostaddr=192.0.2.10&"),
    /query parameter "hostaddr"/u,
  ],
  [
    "libpq service override",
    DIRECT_URL.replace("?", "?service=production&"),
    /query parameter "service"/u,
  ],
  [
    "libpq port override",
    DIRECT_URL.replace("?", "?port=6432&"),
    /query parameter "port"/u,
  ],
  [
    "libpq options override",
    DIRECT_URL.replace("?", "?options=-csearch_path%3Devil&"),
    /query parameter "options"/u,
  ],
  [
    "unknown query parameter",
    `${DIRECT_URL}&application_name=release`,
    /query parameter "application_name"/u,
  ],
  [
    "duplicate sslmode",
    `${DIRECT_URL}&sslmode=verify-full`,
    /must appear exactly once/u,
  ],
  [
    "weaker sslmode",
    DIRECT_URL.replace("sslmode=verify-full", "sslmode=require"),
    /must equal "verify-full"/u,
  ],
  [
    "weaker channel binding",
    DIRECT_URL.replace("channel_binding=require", "channel_binding=prefer"),
    /must equal "require"/u,
  ],
  [
    "loopback production endpoint",
    DIRECT_URL.replace(
      "ep-direct.ap-southeast-1.aws.neon.tech",
      "127.0.0.1",
    ),
    /loopback/u,
  ],
  [
    "percent-encoded hostname",
    DIRECT_URL.replace("ep-direct", "ep%2ddirect"),
    /percent-encoded/u,
  ],
  [
    "missing password",
    DIRECT_URL.replace("artist:secret@", "artist@"),
    /user and password/u,
  ],
  [
    "multiple database path segments",
    DIRECT_URL.replace("/toonspectrum?", "/one/two?"),
    /exactly one/u,
  ],
  [
    "fragment",
    `${DIRECT_URL}#ignored`,
    /fragments/u,
  ],
]) {
  test(`rejects ${name}`, () => {
    expect(() => validateProductionDatabaseUrl(value)).toThrow(pattern);
  });
}

test("allows a credentialed loopback URL only behind the explicit test switch", () => {
  expect(
    validateProductionDatabaseUrl(
      "postgresql://webdex:webdex@127.0.0.1:55432/webdex",
      { allowLoopback: true },
    ).tlsVerified,
  ).toBe(false);
});

test("still rejects query overrides in loopback test mode", () => {
  expect(
    () =>
      validateProductionDatabaseUrl(
        "postgresql://webdex:webdex@127.0.0.1:55432/webdex?host=/tmp",
        { allowLoopback: true },
      ),
  ).toThrow(/query parameter "host"/u);
});

test("builds an override-resistant libpq environment without putting the URL in argv", () => {
  const environment = createPsqlEnvironment(DIRECT_URL, {
    baseEnvironment: {
      PATH: "/usr/bin",
      PGHOST: "attacker.example",
      PGHOSTADDR: "192.0.2.20",
      PGSERVICE: "attacker",
      PGOPTIONS: "-csearch_path=attacker",
    },
  });
  expect(environment).toEqual({
    PATH: "/usr/bin",
    PGHOST: "ep-direct.ap-southeast-1.aws.neon.tech",
    PGPORT: "5432",
    PGUSER: "artist",
    PGPASSWORD: "secret",
    PGDATABASE: "toonspectrum",
    PGSSLMODE: "verify-full",
    PGCHANNELBINDING: "require",
  });
});
