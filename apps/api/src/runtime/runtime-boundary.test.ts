import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(file: string) { return readFileSync(new URL(file, import.meta.url), "utf8"); }
describe("serverless partition ownership and security wiring", () => {
  it("keeps one shared ordered HTTP boundary for auth, Studio and general modules", () => {
    const code = source("./serverless-bootstrap.ts");
    let previous = -1;
    for (const operation of ["app.useLogger", "app.use(createApiSecurityHeadersMiddleware", "configureCors(app)", "rewriteQueryPathToUrl(req)",
      "app.use(createApiRuntimeRoleGuard", "app.use(sessionAuth)", "app.use(createCsrfProtectionMiddleware", "configureApiBodyParserBoundary(app", "app.setGlobalPrefix", "app.useGlobalPipes", "await app.init()"]) {
      const position = code.indexOf(operation);
      expect(position, operation).toBeGreaterThan(previous); previous = position;
    }
    expect(code).toContain("abortOnError: false");
    expect(code).toContain("await app.close()");
    for (const module of ["auth-api.module.ts", "studio-api.module.ts", "general-api.module.ts"]) {
      expect(source(`./${module}`)).toContain("ApiHttpInfrastructureModule");
    }
  });
  it("preserves generic marketplace namespace protection without importing Studio into general", () => {
    const general = source("./general-api.module.ts");
    expect(general).toContain("APP_GUARD, useClass: CreatorMarketplaceSocialBoundaryGuard");
    expect(general).not.toMatch(/import .*\b(?:CreatorModule|AuthModule|StudioApiModule)\b/);
    for (const module of ["auth-api.module.ts", "studio-api.module.ts"]) {
      expect(source(`./${module}`)).not.toMatch(/import .*\b(?:AppModule|CatalogModule)\b/);
    }
    const infrastructure = source("./api-http-infrastructure.module.ts");
    expect(infrastructure).toContain("SAFE_HTTP_LOG_SERIALIZERS");
    expect(infrastructure).toContain("SAFE_HTTP_LOG_REDACT_PATHS");
    expect(infrastructure).toContain("APP_FILTER, useClass: AllExceptionsFilter");
  });
});
