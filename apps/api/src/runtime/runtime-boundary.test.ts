import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

function source(file: string) { return readFileSync(new URL(file, import.meta.url), "utf8"); }

// Parse imports rather than matching prose, comments or string literals. Track the
// original binding too, so renaming a forbidden module cannot bypass the check.
function importedBindings(code: string): Set<string> {
  const file = ts.createSourceFile("boundary.ts", code, ts.ScriptTarget.Latest, true);
  const bindings = new Set<string>();
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const clause = statement.importClause;
    if (clause?.name) bindings.add(clause.name.text);
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) {
        bindings.add(element.name.text);
        if (element.propertyName) bindings.add(element.propertyName.text);
      }
    }
  }
  return bindings;
}

describe("serverless partition ownership and security wiring", () => {
  it("checks real multiline and aliased imports without matching documentation", () => {
    const bindings = importedBindings('// do not import AppModule or CatalogModule\nimport {\n CatalogModule as HiddenCatalog,\n} from "./catalog";\nconst note = "import AppModule";');
    expect(bindings.has("AppModule")).toBe(false);
    expect(bindings.has("CatalogModule")).toBe(true);
    expect(bindings.has("HiddenCatalog")).toBe(true);
  });
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
    for (const forbidden of ["CreatorModule", "AuthModule", "StudioApiModule"]) {
      expect(importedBindings(general).has(forbidden), forbidden).toBe(false);
    }
    for (const module of ["auth-api.module.ts", "studio-api.module.ts"]) {
      const imports = importedBindings(source(`./${module}`));
      for (const forbidden of ["AppModule", "CatalogModule"]) {
        expect(imports.has(forbidden), `${module}: ${forbidden}`).toBe(false);
      }
    }
    const infrastructure = source("./api-http-infrastructure.module.ts");
    expect(infrastructure).toContain("SAFE_HTTP_LOG_SERIALIZERS");
    expect(infrastructure).toContain("SAFE_HTTP_LOG_REDACT_PATHS");
    expect(infrastructure).toContain("APP_FILTER, useClass: AllExceptionsFilter");
  });
});
