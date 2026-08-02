import { describe, expect, it, vi } from "vitest";

import {
  createApiRuntimeRoleGuard,
  isApiRuntimeRolePathAllowed,
  resolveApiRuntimeRole,
} from "./runtime-role";

describe("API runtime role", () => {
  it("keeps the default Vercel/general API surface complete", () => {
    expect(resolveApiRuntimeRole({})).toBe("full");
    expect(isApiRuntimeRolePathAllowed("full", "/api/auth/providers")).toBe(
      true,
    );
  });

  it("limits the long-running host to health and Socket.IO transport", () => {
    expect(resolveApiRuntimeRole({ API_RUNTIME_ROLE: "studio-live" })).toBe(
      "studio-live",
    );
    expect(
      isApiRuntimeRolePathAllowed("studio-live", "/api/health/live"),
    ).toBe(true);
    expect(
      isApiRuntimeRolePathAllowed("studio-live", "/api/health/ready"),
    ).toBe(true);
    expect(
      isApiRuntimeRolePathAllowed(
        "studio-live",
        "/socket.io/?EIO=4&transport=websocket",
      ),
    ).toBe(true);
    expect(
      isApiRuntimeRolePathAllowed("studio-live", "/api/auth/providers"),
    ).toBe(false);
    expect(
      isApiRuntimeRolePathAllowed("studio-live", "/api/creator/works"),
    ).toBe(false);
  });

  it("limits a capability worker to liveness, signed readiness and the exact gateway", () => {
    expect(
      resolveApiRuntimeRole({ API_RUNTIME_ROLE: "capability-worker" }),
    ).toBe("capability-worker");
    expect(
      isApiRuntimeRolePathAllowed("capability-worker", "/api/health/live"),
    ).toBe(true);
    expect(
      isApiRuntimeRolePathAllowed(
        "capability-worker",
        "/.well-known/toonspectrum/backend-capabilities/v1/health",
      ),
    ).toBe(true);
    expect(
      isApiRuntimeRolePathAllowed(
        "capability-worker",
        "/.well-known/toonspectrum/backend-capabilities/v1/execute",
      ),
    ).toBe(true);
    expect(
      isApiRuntimeRolePathAllowed("capability-worker", "/api/auth/providers"),
    ).toBe(false);
    expect(
      isApiRuntimeRolePathAllowed("capability-worker", "/socket.io/"),
    ).toBe(false);
    expect(
      isApiRuntimeRolePathAllowed(
        "capability-worker",
        "/api/health/live",
        "POST",
      ),
    ).toBe(false);
    expect(
      isApiRuntimeRolePathAllowed(
        "capability-worker",
        "/.well-known/toonspectrum/backend-capabilities/v1/execute",
        "GET",
      ),
    ).toBe(false);
  });

  it("fails closed on an unknown role", () => {
    expect(() =>
      resolveApiRuntimeRole({ API_RUNTIME_ROLE: "everything" }),
    ).toThrow("API_RUNTIME_ROLE is invalid");
  });

  it("returns a non-cacheable 404 without invoking downstream handlers", () => {
    const setHeader = vi.fn();
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const next = vi.fn();
    const guard = createApiRuntimeRoleGuard({
      API_RUNTIME_ROLE: "studio-live",
    });

    guard(
      { path: "/api/auth/providers" } as never,
      { setHeader, status } as never,
      next,
    );

    expect(next).not.toHaveBeenCalled();
    expect(setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "private, no-store, max-age=0",
    );
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      statusCode: 404,
      error: "Not Found",
      message: "Route is not available on this runtime role",
    });
  });
});
