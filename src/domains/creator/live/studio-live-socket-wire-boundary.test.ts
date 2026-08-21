import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

function moduleImports(relativePath: string): { source: string; specifiers: string[] } {
  const fileUrl = new URL(relativePath, import.meta.url);
  const source = readFileSync(fileUrl, "utf8");
  const file = ts.createSourceFile(
    fileUrl.pathname,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const specifiers: string[] = [];
  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return { source, specifiers };
}

describe("studio live socket wire ownership boundary", () => {
  it("keeps wire validation pure and independent from Socket.IO and browser runtime APIs", () => {
    const wire = moduleImports("./studio-live-socket-wire.ts");

    expect(wire.specifiers).toEqual([
      "./studio-crdt-binary-wire",
      "./studio-live-collaboration-protocol",
      "@/lib/studio-live-lock-resource",
    ]);
    expect(wire.source).not.toMatch(/socket\.io-client|studio-live-socket-endpoint|runtime-api-base/);
    expect(wire.source).not.toMatch(
      /\b(?:globalThis|window|document|navigator|localStorage|sessionStorage|WebSocket|EventSource)\b/
    );
    expect(wire.source).not.toMatch(/\b(?:setTimeout|clearTimeout|setInterval|clearInterval)\b/);
  });

  it("keeps connection lifecycle in transport and wire parsers out of that module", () => {
    const transport = moduleImports("./studio-live-socket-transport.ts");

    // 2026-08-21 intentional change: the Socket.IO connection factory (endpoint resolution,
    // `io(...)` construction, realtime purpose routing, default injectables) moved to
    // `studio-live-socket-connection-factory.ts`. The boundary still holds — one module owns the
    // socket.io-client dependency and the transport reaches it only through that module.
    const connectionFactory = moduleImports(
      "./studio-live-socket-connection-factory.ts",
    );

    expect(connectionFactory.specifiers).toContain("socket.io-client");
    expect(transport.specifiers).toContain("./studio-live-socket-connection-factory");
    expect(transport.specifiers).not.toContain("socket.io-client");
    expect(transport.specifiers).toContain("./studio-live-socket-wire");
    for (const parser of [
      "parseParticipant",
      "parseLock",
      "parseVoiceMember",
      "parseFailure",
      "parseJoinAck",
      "publicParticipant",
    ]) {
      expect(transport.source).not.toMatch(
        new RegExp(`function\\s+${parser}\\b`)
      );
      expect(transport.source).toContain(parser);
    }
    expect(transport.source).toContain("private beginJoin()");
    expect(transport.source).toContain("private reconcilePendingPresence(");
    expect(transport.source).toContain("publishCrdtUpdate(");
  });
});
