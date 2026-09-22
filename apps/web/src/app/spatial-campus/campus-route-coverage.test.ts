import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { STUDIO_ROUTE_REGISTRY } from "@/domains/creator/studio-route-registry";
import { CAMPUS_ROUTE_DISTRICTS, campusBinding, campusProtectedSearch } from "@/shared/lib/spatial-campus/campus-bindings";
import { CAMPUS_DISTRICTS } from "@/shared/lib/spatial-campus/campus-model";

const directory = fileURLToPath(new URL("../routes/groups/", import.meta.url));
const routes: { id: string; path: string }[] = [];
const literal = (node: ts.Node | undefined): string | null => node && ts.isStringLiteral(node) ? node.text : null;
for (const file of readdirSync(directory).filter((name) => /\.routes?\.tsx$/u.test(name))) {
  const source = ts.createSourceFile(file, readFileSync(`${directory}/${file}`, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (node: ts.Node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const properties = node.properties.filter(ts.isPropertyAssignment);
      const value = (name: string) => properties.find((property) => property.name.getText(source) === name)?.initializer;
      const id = literal(value("id"));
      const pathValue = value("path");
      let path = literal(pathValue);
      if (pathValue && ts.isCallExpression(pathValue) && pathValue.expression.getText(source) === "studioRoutePath") {
        const routeId = literal(pathValue.arguments[0]);
        path = STUDIO_ROUTE_REGISTRY.find((registration) => registration.id === routeId)?.pattern ?? null;
      }
      if (id && path) routes.push({ id, path });
    }
    if (ts.isCallExpression(node) && node.expression.getText(source) === "route") {
      const id = literal(node.arguments[0]), path = literal(node.arguments[1]);
      if (id && path) routes.push({ id, path });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}
describe("campus route authority coverage", () => {
  it("explicitly classifies every registered top-level route, including aliases and protected entries", () => {
    expect(routes.length).toBeGreaterThan(150);
    expect(new Set(routes.map((route) => route.id)).size).toBe(routes.length);
    expect([...CAMPUS_ROUTE_DISTRICTS.keys()].sort()).toEqual(routes.map((route) => route.id).sort());
    for (const route of routes) expect(campusBinding(route.id, route.path), route.id).not.toBeNull();
  });
  it("covers all ten market routes without inventing checkout capability", () => {
    const market = routes.filter((route) => route.id.startsWith("market-"));
    expect(market).toHaveLength(10);
    for (const route of market) expect(campusBinding(route.id, route.path)?.districtId).toBe("market");
    expect(campusBinding("market-checkout", "/market/checkout/item")?.surface).toBe("protected");
  });
  it("does not turn an unknown future route into a fake plaza page", () => {
    expect(campusBinding("future-unregistered", "/unknown")).toBeNull();
  });
  it.each(["token", "shareToken", "reviewToken", "presentationToken", "invite", "credential", "code", "state"])("isolates %s before showing any world or return target", (key) => {
    expect(campusProtectedSearch(`?${key}=secret`)).toBe(true);
    expect(campusBinding("market-home", "/market", `?${key}=secret`)?.surface).toBe("protected");
  });
  it("retains nine distinct districts, visual identities and unique direct actions", () => {
    expect(CAMPUS_DISTRICTS).toHaveLength(9);
    expect(new Set(CAMPUS_DISTRICTS.map((district) => district.artworkUrl)).size).toBe(9);
    for (const district of CAMPUS_DISTRICTS) {
      expect(district.artworkUrl).toMatch(/^\/(?:assets|brand)\//u);
      expect(new Set(district.destinations.map((item) => item.id)).size).toBe(district.destinations.length);
    }
    expect(CAMPUS_DISTRICTS.find((district) => district.id === "academy")?.destinations)
      .toContainEqual(expect.objectContaining({ id: "trace", href: "/learn/trace" }));
    expect(campusBinding("legal-about-technology-playbook", "/about/technology/playbook")?.districtId)
      .toBe("academy");
    expect(CAMPUS_DISTRICTS.find((district) => district.id === "gallery")?.destinations)
      .toContainEqual(expect.objectContaining({ id: "publish", href: "/community/promote/new" }));
  });
});