import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { resolveStudioRoute } from "../apps/web/src/domains/creator/studio-router/studio-route-manifest";
import { STUDIO_DRAFT_CANVAS_PATHNAME } from "../apps/web/src/domains/creator/studio-workspace-route";

import {
  installStudioCollaborationPreviewSession,
  studioOwnedPreviewSessionEndpoint,
} from "./lib/studio-collaboration-preview-session";

import type { Route } from "playwright";

const source = readFileSync("scripts/verify-studio-collaboration-sync.mts", "utf8");

describe("collaboration browser entry contract", () => {
  it("opens the canonical editor rather than the non-editor Studio home", () => {
    expect(STUDIO_DRAFT_CANVAS_PATHNAME).toBe("/studio/canvas");
    expect(resolveStudioRoute({ pathname: STUDIO_DRAFT_CANVAS_PATHNAME })).toMatchObject({ kind: "editor" });
    expect(resolveStudioRoute({ pathname: "/studio" })).toMatchObject({ kind: "invalid" });
    expect(source).toContain("pageA.goto(`${origin}${STUDIO_DRAFT_CANVAS_PATHNAME}`");
    expect(source).toContain("fetch(`${origin}${STUDIO_DRAFT_CANVAS_PATHNAME}`)");
    expect(source).not.toContain("pageA.goto(`${origin}/studio`,");
  });

  it("keeps duplicate-tab identity isolation and bidirectional pixel convergence mandatory", () => {
    expect(source).toContain("Date.now() + 30_000");
    expect(source).toContain("canvas surface unavailable after 30 seconds at ${page.url()}");
    expect(source).not.toContain('canvas.waitFor({ state: "visible", timeout: 1 })');
    expect(source).toContain('context.waitForEvent("page")');
    expect(source).toContain('window.open(url, "_blank")');
    expect(source).not.toContain("pageB.goto(roomUrl");
    expect(source).toContain('"duplicated tab reused the source client instance id"');
    expect(source).toContain("\"duplicated tab retained the source tab's room-owner receipt\"");
    expect(source).toContain("pageC.goto(roomUrl");
    expect(source).toContain('waitForCanvasChange(pageB, blankB, "A -> B remote stroke")');
    expect(source).toContain('waitForCanvasChange(pageA, beforeSecondA, "B -> A remote stroke")');
    expect(source).toContain("late joiner did not restore authored ink");
    expect(source).toContain(`page.locator('[data-studio-post-processing-scope=""]')`);
    expect(source).toContain("const screenshot = await page.screenshot({");
    expect(source).toContain("fingerprintStudioCompositedPng");
    expect(source).not.toContain('querySelectorAll<HTMLCanvasElement>(".konvajs-content canvas")');
    expect(source).not.toContain("documentSurface.screenshot({");
  });

  it("captures the failed page location and screenshot for future navigation regressions", () => {
    expect(source).toContain("failure-tab-${index}.png");
    expect(source).toContain("url: page.url()");
    expect(source).toContain('report.status = "FAIL"');
  });

  it("declares its fixture boundary before navigation and never assumes an unmounted panel is local", () => {
    const configured = source.indexOf("await installStudioCollaborationPreviewSession(context, ownedOrigin)");
    expect(configured).toBeGreaterThan(0);
    expect(configured).toBeLessThan(source.indexOf("await attachPage(context, \"A\")"));
    expect(source).toContain("report.sessionBoundary");
    expect(source).not.toContain("uses the same-origin collaboration fallback");
    expect(source).not.toContain("ensureLocalPreviewTransport");
  });
});

describe("static preview signed-out session boundary", () => {
  it("never intercepts a caller-supplied live server", async () => {
    const route = vi.fn();
    expect(await installStudioCollaborationPreviewSession({ route }, "")).toBe("live-session-endpoint");
    expect(route).not.toHaveBeenCalled();
  });

  it.each([
    "https://www.toonstudio.cloud",
    "http://example.com:4173",
    "http://user:password@127.0.0.1:4173",
    "http://127.0.0.1:4173/api",
    "http://127.0.0.1:4173?override=1",
    "http://127.0.0.1:4173#override",
  ])("rejects an unowned fixture scope: %s", (origin) => {
    expect(() => studioOwnedPreviewSessionEndpoint(origin)).toThrow();
  });

  it("stubs only a GET signed-out session, leaving tickets, rooms, storage and other origins real", async () => {
    let matches: ((url: URL) => boolean) | null = null;
    let respond: ((route: Route) => Promise<void>) | null = null;
    const route = vi.fn(async (matcher: unknown, handler: unknown) => {
      matches = matcher as (url: URL) => boolean;
      respond = handler as (route: Route) => Promise<void>;
    });
    expect(await installStudioCollaborationPreviewSession({ route }, "http://127.0.0.1:4173"))
      .toBe("static-preview-signed-out-session-fixture");
    expect(route).toHaveBeenCalledTimes(1);
    const match = matches as unknown as (url: URL) => boolean;
    const handle = respond as unknown as (route: Route) => Promise<void>;
    expect(match(new URL("http://127.0.0.1:4173/api/auth/session"))).toBe(true);
    for (const url of [
      "https://www.toonstudio.cloud/api/auth/session",
      "http://127.0.0.1:9999/api/auth/session",
      "http://127.0.0.1:4173/api/creator/studio-live/auth-ticket",
      "http://127.0.0.1:4173/api/studio-realtime/tickets",
      "http://127.0.0.1:4173/api/creator/works/room",
      "http://127.0.0.1:4173/studio-live",
    ]) expect(match(new URL(url)), url).toBe(false);

    const fulfill = vi.fn(), passthrough = vi.fn();
    await handle({ request: () => ({ method: () => "GET" }), fulfill, continue: passthrough } as unknown as Route);
    expect(fulfill).toHaveBeenCalledWith({
      status: 200,
      contentType: "application/json",
      headers: { "Cache-Control": "no-store" },
      body: '{"authenticated":false,"user":null}',
    });
    expect(passthrough).not.toHaveBeenCalled();
    fulfill.mockClear();
    await handle({ request: () => ({ method: () => "POST" }), fulfill, continue: passthrough } as unknown as Route);
    expect(fulfill).not.toHaveBeenCalled();
    expect(passthrough).toHaveBeenCalledTimes(1);
  });
});
