import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertVercelServerlessRuntimeRole,
  getServerlessApp,
} from "./serverless";

const nestFactoryCreate = vi.hoisted(() => vi.fn());
const validateEnv = vi.hoisted(() => vi.fn());

vi.mock("@nestjs/core", () => ({
  NestFactory: {
    create: nestFactoryCreate,
  },
}));
vi.mock("./app.module", () => ({
  AppModule: class AppModule {},
}));
vi.mock("./config/env", () => ({
  validateEnv,
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Vercel serverless runtime boundary", () => {
  it("accepts only the general API role resolved for Vercel", () => {
    expect(() => assertVercelServerlessRuntimeRole({})).not.toThrow();
    expect(() =>
      assertVercelServerlessRuntimeRole({
        API_RUNTIME_ROLE: "full",
      }),
    ).not.toThrow();
    expect(() =>
      assertVercelServerlessRuntimeRole({
        API_RUNTIME_ROLE: "studio-live",
      }),
    ).toThrow(
      "Vercel serverless bootstrap requires API_RUNTIME_ROLE=full",
    );
    expect(() =>
      assertVercelServerlessRuntimeRole({
        API_RUNTIME_ROLE: "unknown",
      }),
    ).toThrow("API_RUNTIME_ROLE is invalid");
  });

  it("rejects a studio-live cold start before creating the Nest application", async () => {
    vi.stubEnv("API_RUNTIME_ROLE", "studio-live");

    await expect(getServerlessApp()).rejects.toThrow(
      "Vercel serverless bootstrap requires API_RUNTIME_ROLE=full",
    );
    expect(validateEnv).not.toHaveBeenCalled();
    expect(nestFactoryCreate).not.toHaveBeenCalled();
  });
});
