import { describe, expect, it } from "vitest";

import {
  POSTGRES_INTEGRATION_SUITES,
  createPostgresIntegrationEnvironment,
  createVitestArguments,
  parsePostgresIntegrationArguments,
  resolvePostgresIntegrationTarget,
  validatePostgresIntegrationUrl,
} from "./run-postgres-integration-tests.mjs";

const LOCAL_URL =
  "postgresql://webdex:local-secret@127.0.0.1:55432/webdex";
const REMOTE_TEST_URL =
  "postgresql://ci:remote-secret@db.example.test/toonspectrum_integration?sslmode=verify-full&channel_binding=require";
const REMOTE_PRODUCTION_URL =
  "postgresql://app:production-secret@db.example.com/toonspectrum?sslmode=verify-full";

describe("PostgreSQL integration test runner", () => {
  it("requires a dedicated TEST_DATABASE_URL instead of inheriting DATABASE_URL", () => {
    expect(() =>
      resolvePostgresIntegrationTarget({
        environment: { DATABASE_URL: REMOTE_PRODUCTION_URL },
      }),
    ).toThrow(/dedicated test database/u);
  });

  it("accepts one explicit CLI or environment test URL and rejects ambiguity", () => {
    expect(
      resolvePostgresIntegrationTarget({
        arguments_: ["--database-url", LOCAL_URL],
        environment: {},
      }).loopback,
    ).toBe(true);
    expect(
      resolvePostgresIntegrationTarget({
        environment: { TEST_DATABASE_URL: LOCAL_URL },
      }).databaseName,
    ).toBe("webdex");
    expect(() =>
      resolvePostgresIntegrationTarget({
        arguments_: ["--database-url", LOCAL_URL],
        environment: {
          TEST_DATABASE_URL: LOCAL_URL.replace("webdex", "other"),
        },
      }),
    ).toThrow(/Conflicting/u);
  });

  it("blocks remote and production targets unless every test-only guard passes", () => {
    expect(() => validatePostgresIntegrationUrl(REMOTE_TEST_URL)).toThrow(
      /Remote PostgreSQL targets are blocked/u,
    );
    expect(
      validatePostgresIntegrationUrl(REMOTE_TEST_URL, {
        allowRemoteTestDatabase: true,
        environment: { CI: "true", NODE_ENV: "test" },
      }).loopback,
    ).toBe(false);
    expect(() =>
      validatePostgresIntegrationUrl(REMOTE_PRODUCTION_URL, {
        allowRemoteTestDatabase: true,
        environment: { CI: "true", NODE_ENV: "test" },
      }),
    ).toThrow(/disposable test database/u);
    expect(() =>
      validatePostgresIntegrationUrl(LOCAL_URL, {
        environment: { NODE_ENV: "production" },
      }),
    ).toThrow(/disabled inside a production runtime/u);
  });

  it("rejects authority overrides, unknown parameters, and weak remote TLS", () => {
    expect(() =>
      validatePostgresIntegrationUrl(`${LOCAL_URL}?host=production.internal`),
    ).toThrow(/forbidden connection override/u);
    expect(() =>
      validatePostgresIntegrationUrl(`${LOCAL_URL}?application_name=unsafe`),
    ).toThrow(/unsupported connection parameter/u);
    expect(() =>
      validatePostgresIntegrationUrl(
        REMOTE_TEST_URL.replace("verify-full", "disable"),
        {
          allowRemoteTestDatabase: true,
          environment: { NODE_ENV: "test" },
        },
      ),
    ).toThrow(/requires sslmode=verify-full/u);
    expect(() =>
      validatePostgresIntegrationUrl(
        REMOTE_TEST_URL.replace("&channel_binding=require", ""),
        {
          allowRemoteTestDatabase: true,
          environment: { NODE_ENV: "test" },
        },
      ),
    ).toThrow(/channel_binding=require/u);
  });

  it("injects only the selected test target over inherited database variables", () => {
    const childEnvironment = createPostgresIntegrationEnvironment(LOCAL_URL, {
      DATABASE_URL: REMOTE_PRODUCTION_URL,
      NODE_ENV: "development",
      STUDIO_LIVE_POSTGRES_INTEGRATION_URL: REMOTE_PRODUCTION_URL,
      STUDIO_TEAM_COMMENT_POSTGRES_INTEGRATION_URL: REMOTE_PRODUCTION_URL,
    });

    expect(childEnvironment.NODE_ENV).toBe("test");
    expect(childEnvironment.DATABASE_URL).toBe(LOCAL_URL);
    expect(childEnvironment.TEST_DATABASE_URL).toBe(LOCAL_URL);
    expect(childEnvironment.STUDIO_LIVE_POSTGRES_INTEGRATION_URL).toBe(
      LOCAL_URL,
    );
    expect(childEnvironment.STUDIO_TEAM_COMMENT_POSTGRES_INTEGRATION_URL).toBe(
      LOCAL_URL,
    );
  });

  it("runs exactly the eight direct PostgreSQL suites without file parallelism", () => {
    expect(POSTGRES_INTEGRATION_SUITES).toHaveLength(8);
    expect(new Set(POSTGRES_INTEGRATION_SUITES)).toHaveProperty("size", 8);
    expect(
      POSTGRES_INTEGRATION_SUITES.every((suite) =>
        suite.endsWith(".integration.test.ts"),
      ),
    ).toBe(true);

    const vitestArguments = createVitestArguments();
    expect(vitestArguments).toContain("--no-file-parallelism");
    expect(
      vitestArguments.slice(-POSTGRES_INTEGRATION_SUITES.length),
    ).toEqual(POSTGRES_INTEGRATION_SUITES);
    expect(
      vitestArguments.some((argument) => argument.includes("secret")),
    ).toBe(false);
  });

  it("keeps help and repeated sensitive arguments deterministic", () => {
    expect(parsePostgresIntegrationArguments(["--", "--help"])).toEqual({
      allowRemoteTestDatabase: false,
      databaseUrl: undefined,
      help: true,
    });
    expect(() =>
      parsePostgresIntegrationArguments([
        "--database-url",
        LOCAL_URL,
        "--database-url",
        LOCAL_URL,
      ]),
    ).toThrow(/exactly once/u);
    expect(() =>
      parsePostgresIntegrationArguments(["--not-a-real-option"]),
    ).toThrow(/Unsupported/u);
  });
});
