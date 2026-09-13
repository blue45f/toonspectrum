/** The static preview has no authentication API; model only its fresh signed-out visitor. */
import type { BrowserContext } from "playwright";

export const STUDIO_PREVIEW_GUEST_SESSION = Object.freeze({ authenticated: false, user: null });

/** Never install this fixture for a caller-supplied server or a non-loopback origin. */
export function studioOwnedPreviewSessionEndpoint(ownedOrigin: string): URL | null {
  if (!ownedOrigin) return null;
  const origin = new URL(ownedOrigin);
  if (
    origin.protocol !== "http:"
    || !["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname)
    || origin.username || origin.password
    || origin.pathname !== "/" || origin.search || origin.hash
  ) throw new Error("Guest session fixture requires an owned loopback preview origin.");
  return new URL("/api/auth/session", origin.origin);
}

/**
 * This is a named authentication-boundary fixture, NOT a collaboration transport mock.
 * No logged-in identity, ticket, membership, permissions, room, CRDT update, storage or pixels
 * are fabricated. Production/external verifications pass an empty ownedOrigin and keep the
 * real HTTP session endpoint. An absent API's 502 must not be mistaken for a verified logout
 * by the product's fail-closed SessionProvider.
 */
export async function installStudioCollaborationPreviewSession(
  context: Pick<BrowserContext, "route">,
  ownedOrigin: string,
): Promise<"live-session-endpoint" | "static-preview-signed-out-session-fixture"> {
  const endpoint = studioOwnedPreviewSessionEndpoint(ownedOrigin);
  if (!endpoint) return "live-session-endpoint";
  await context.route(
    (url) => url.origin === endpoint.origin && url.pathname === endpoint.pathname,
    async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Cache-Control": "no-store" },
        body: JSON.stringify(STUDIO_PREVIEW_GUEST_SESSION),
      });
    },
  );
  return "static-preview-signed-out-session-fixture";
}
