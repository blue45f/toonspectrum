import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

function source(file: string) {
  return readFileSync(new URL(file, import.meta.url), "utf8");
}

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

describe("long-running API ownership and security wiring", () => {
  it("checks real multiline and aliased imports without matching documentation", () => {
    const bindings = importedBindings(
      '// do not import AppModule\nimport {\n CatalogModule as HiddenCatalog,\n} from "./catalog";\nconst note = "import AppModule";',
    );
    expect(bindings.has("AppModule")).toBe(false);
    expect(bindings.has("CatalogModule")).toBe(true);
    expect(bindings.has("HiddenCatalog")).toBe(true);
  });

  it("keeps one ordered HTTP boundary for the Render Core API", () => {
    const code = source("../main.ts");
    let previous = -1;
    for (const operation of [
      "app.useLogger",
      "app.enableShutdownHooks",
      "app.use(createApiSecurityHeadersMiddleware",
      "app.use(createEdgeOriginAuthMiddleware",
      "configureCors(app)",
      "app.use(createApiRuntimeRoleGuard",
      "app.setGlobalPrefix",
      "app.useGlobalPipes",
      "await createStudioLivePostgresIoAdapter",
      "await app.listen",
    ]) {
      const position = code.indexOf(operation);
      expect(position, operation).toBeGreaterThan(previous);
      previous = position;
    }

    const session = code.indexOf("app.use(sessionAuth)");
    const csrf = code.indexOf("app.use(createCsrfProtectionMiddleware");
    const bodyParser = code.indexOf("configureApiBodyParserBoundary(app, null)");
    expect(session).toBeGreaterThan(code.indexOf("app.use(createApiRuntimeRoleGuard"));
    expect(csrf).toBeGreaterThan(session);
    expect(bodyParser).toBeGreaterThan(csrf);
    expect(code).toContain("app.enableShutdownHooks()");
    expect(code).toContain('await import("./app.module")');
  });

  it("keeps shared infrastructure in AppModule without retired provider adapters", () => {
    const main = source("../main.ts");
    const appModule = source("../app.module.ts");
    const infrastructure = source("./api-http-infrastructure.module.ts");

    expect(appModule).toContain("ApiHttpInfrastructureModule");
    expect(appModule).toContain("OgModule");
    expect(infrastructure).toContain("SAFE_HTTP_LOG_SERIALIZERS");
    expect(infrastructure).toContain("SAFE_HTTP_LOG_REDACT_PATHS");
    expect(infrastructure).toContain("APP_FILTER, useClass: AllExceptionsFilter");

    const imports = importedBindings(main);
    for (const retired of ["AuthApiModule", "StudioApiModule", "GeneralApiModule"]) {
      expect(imports.has(retired), retired).toBe(false);
    }
    expect(main).not.toContain("serverless");
    expect(main).not.toContain("rewriteQueryPathToUrl");
  });
});
