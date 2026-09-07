import { createServer } from "node:http";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertStudioLiveVercelConfiguration,
  initializeStudioLiveVercelRuntime,
} from "./studio-live-serverless";

const mocks = vi.hoisted(() => ({ create: vi.fn(), adapter: vi.fn() }));
vi.mock("@nestjs/core", () => ({ NestFactory: { create: mocks.create } }));
vi.mock("./app.module", () => ({ AppModule: class AppModule {} }));
vi.mock("./realtime/studio-postgres-io.adapter", async (load) => ({
  ...await load<typeof import("./realtime/studio-postgres-io.adapter")>(),
  createStudioLivePostgresIoAdapter: mocks.adapter,
}));

const environment = {
  STUDIO_LIVE_VERCEL_ENABLED: "true",
  STUDIO_LIVE_CLUSTER_ADAPTER: "postgres",
  STUDIO_LIVE_POSTGRES_URL: "postgresql://fixture:fixture@127.0.0.1:55433/qa",
  NODE_ENV: "test",
};

beforeEach(() => { vi.clearAllMocks(); });

function application() {
  const server = createServer();
  const adapter = { disposePool: vi.fn(async () => undefined) };
  const app = {
    useLogger: vi.fn(), get: vi.fn(() => ({ log: vi.fn(), error: vi.fn() })),
    use: vi.fn(), enableCors: vi.fn(), useWebSocketAdapter: vi.fn(),
    init: vi.fn(async () => undefined), close: vi.fn(async () => undefined),
    getHttpServer: vi.fn(() => server),
  };
  mocks.create.mockResolvedValue(app);
  mocks.adapter.mockResolvedValue(adapter);
  return { app, adapter, server };
}

describe("native Vercel Studio bootstrap", () => {
  it("requires explicit opt-in and PostgreSQL even outside production", async () => {
    for (const invalid of [
      {},
      { ...environment, STUDIO_LIVE_VERCEL_ENABLED: "false" },
      { ...environment, STUDIO_LIVE_CLUSTER_ADAPTER: "memory" },
      { ...environment, STUDIO_LIVE_POSTGRES_URL: undefined },
      { ...environment, STUDIO_LIVE_POSTGRES_URL: "postgresql://x:x@pooler.example/qa?sslmode=require" },
    ]) {
      await expect(initializeStudioLiveVercelRuntime(invalid)).rejects.toThrow();
    }
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.adapter).not.toHaveBeenCalled();
    expect(() => assertStudioLiveVercelConfiguration(environment)).not.toThrow();
  });

  it("attaches the existing cluster adapter before gateway init and returns the exact Nest HTTP server", async () => {
    const { app, adapter, server } = application();
    app.init.mockImplementation(async () => {
      expect(app.useWebSocketAdapter).toHaveBeenCalledWith(adapter);
    });
    const runtime = await initializeStudioLiveVercelRuntime(environment);
    expect(runtime.server).toBe(server);
    expect(mocks.create).toHaveBeenCalledWith(expect.any(Function), {
      bodyParser: false, bufferLogs: true, abortOnError: false,
    });
    expect(mocks.adapter).toHaveBeenCalledWith(app, environment, expect.objectContaining({ logger: expect.any(Object) }));
    await Promise.all([runtime.close(), runtime.close()]);
    expect(app.close).toHaveBeenCalledOnce();
    expect(adapter.disposePool).toHaveBeenCalledOnce();
  });

  it("closes the application after adapter preflight fails and never initializes a memory gateway", async () => {
    const { app } = application();
    mocks.adapter.mockRejectedValue(new Error("preflight failed"));
    await expect(initializeStudioLiveVercelRuntime(environment)).rejects.toThrow("preflight failed");
    expect(app.close).toHaveBeenCalledOnce();
    expect(app.init).not.toHaveBeenCalled();
  });

  it("releases the cluster pool when a partially initialized gateway fails", async () => {
    const { app, adapter } = application();
    app.init.mockRejectedValue(new Error("gateway failed"));
    await expect(initializeStudioLiveVercelRuntime(environment)).rejects.toThrow("gateway failed");
    expect(app.close).toHaveBeenCalledOnce();
    expect(adapter.disposePool).toHaveBeenCalledOnce();
  });

  it("still releases the pool if application shutdown fails", async () => {
    const { app, adapter } = application();
    const runtime = await initializeStudioLiveVercelRuntime(environment);
    app.close.mockRejectedValue(new Error("close failed"));
    await expect(runtime.close()).rejects.toThrow("close failed");
    expect(adapter.disposePool).toHaveBeenCalledOnce();
  });
});
