import { test as base } from "@playwright/test";

/** Observational fixture only: every adapter/device request still calls the real native method. */
export const test = base.extend<{ nativeGpuDiagnostics: void }>({
  nativeGpuDiagnostics: [async ({ page }, use, info) => {
    const events: string[] = [];
    page.on("console", (message) => {
      if (message.text().startsWith("[bg3d-native]")) events.push(message.text());
    });
    await page.addInitScript(() => {
      const emit = (operation: string, details: unknown) => {
        console.info(`[bg3d-native] ${JSON.stringify({ operation, atMs: performance.now(), details })}`);
      };
      const describe = (error: unknown): unknown => {
        const causes: { name?: string; message: string }[] = [];
        const seen = new Set<unknown>();
        let current = error;
        while (current !== undefined && !seen.has(current) && causes.length < 5) {
          seen.add(current);
          if (current instanceof Error) {
            causes.push({ name: current.name, message: current.message });
            current = current.cause;
          } else {
            causes.push({ message: String(current) });
            break;
          }
        }
        return causes;
      };
      window.addEventListener("error", (event) => emit("uncaught", describe(event.error)));
      window.addEventListener("unhandledrejection", (event) => emit("rejection", describe(event.reason)));
      // Use the actual WebGPU interface: partial stand-ins erase required native adapter members.
      const gpu = navigator.gpu;
      if (!gpu) { emit("api-absent", null); return; }
      const nativeRequest = gpu.requestAdapter.bind(gpu);
      let sequence = 0;
      gpu.requestAdapter = (options) => {
        const id = ++sequence;
        const started = performance.now();
        emit("adapter-start", { id, options });
        return nativeRequest(options).then((adapter) => {
          emit("adapter-end", { id, available: !!adapter, elapsedMs: performance.now() - started });
          if (adapter) {
            const requestDevice = adapter.requestDevice.bind(adapter);
            adapter.requestDevice = (descriptor) => {
              const deviceStarted = performance.now();
              emit("device-start", { id, descriptor });
              return requestDevice(descriptor).then((device) => {
                emit("device-end", { id, elapsedMs: performance.now() - deviceStarted });
                return device;
              }, (error: unknown) => {
                emit("device-error", { id, error: describe(error) });
                throw error;
              });
            };
          }
          return adapter;
        }, (error: unknown) => {
          emit("adapter-error", { id, error: describe(error) });
          throw error;
        });
      };
    });
    try {
      await use();
    } finally {
      await info.attach("bg3d-native-lifecycle.json", {
        body: Buffer.from(JSON.stringify(events, null, 2)), contentType: "application/json",
      });
    }
  }, { auto: true }],
});
