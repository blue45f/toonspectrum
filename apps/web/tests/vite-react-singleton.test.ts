// @vitest-environment jsdom

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";

import { build, loadConfigFromFile } from "vite";
import { expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");
const require = createRequire(path.join(root, "package.json"));

it("bundles the workspace carousel with its renderer's React through mount, update and unmount", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "toonstudio-react-singleton-"));
  const host = document.createElement("div");
  document.body.append(host);
  let mounted: { unmount(): void } | undefined;
  try {
    const entry = path.join(directory, "entry.js");
    // Import the actual workspace hook: its dependency can have a different auto-installed
    // React peer from the application. A mocked hook or unbundled unit render misses that seam.
    await writeFile(entry, `
      import { createElement, useState } from ${JSON.stringify(require.resolve("react"))};
      import { createRoot } from ${JSON.stringify(require.resolve("react-dom/client"))};
      import { flushSync } from ${JSON.stringify(require.resolve("react-dom"))};
      import { useCarousel } from ${JSON.stringify(path.join(root, "packages/core/src/carousel/use-carousel.ts"))};
      export const errors = [];
      function SingleItemCarousel() {
        const { selectedIndex, hasPagination } = useCarousel({ active: false });
        const [count, setCount] = useState(0);
        return createElement('button', {
          onClick: () => setCount(value => value + 1),
          'data-selected-index': selectedIndex,
          'data-pagination': String(hasPagination),
        }, 'item ' + count);
      }
      export function mount(host) {
        const root = createRoot(host, { onUncaughtError: error => errors.push(error.message) });
        flushSync(() => root.render(createElement(SingleItemCarousel)));
        return {
          click() { flushSync(() => host.querySelector('button').click()); },
          unmount() { flushSync(() => root.unmount()); },
        };
      }
    `);
    const loaded = await loadConfigFromFile(
      { command: "build", mode: "production" }, path.join(root, "vite.config.ts"), root,
    );
    if (!loaded) throw new Error("Missing application Vite config");
    const result = await build({
      configFile: false,
      root: path.join(root, "apps/web"),
      resolve: loaded.config.resolve,
      logLevel: "silent",
      define: { "process.env.NODE_ENV": JSON.stringify("production") },
      build: {
        write: false,
        copyPublicDir: false,
        minify: false,
        lib: { entry, name: "CarouselRegression", formats: ["iife"] },
      },
    });
    const bundles = Array.isArray(result) ? result : [result];
    const bundle = bundles[0];
    if (bundles.length !== 1 || !bundle || !("output" in bundle)) {
      throw new Error("Unexpected bundle output");
    }
    const chunk = bundle.output.find((output) => output.type === "chunk" && output.isEntry);
    if (!chunk || chunk.type !== "chunk") throw new Error("Missing carousel entry chunk");
    const runtime = runInNewContext(`${chunk.code}\nCarouselRegression`, {
      window, document, navigator, HTMLElement, Node, Event, console,
      setTimeout, clearTimeout, setImmediate, clearImmediate,
    }) as {
      errors: string[];
      mount(element: HTMLElement): { click(): void; unmount(): void };
    };
    const instance = runtime.mount(host);
    mounted = instance;
    expect(runtime.errors).toEqual([]);
    expect(host.querySelector("button")?.textContent).toBe("item 0");
    expect(host.querySelector("button")?.dataset).toMatchObject({
      selectedIndex: "0", pagination: "false",
    });
    instance.click();
    expect(host.querySelector("button")?.textContent).toBe("item 1");
    instance.unmount();
    mounted = undefined;
    expect(host.childElementCount).toBe(0);
    expect(runtime.errors).toEqual([]);
  } finally {
    mounted?.unmount();
    host.remove();
    await rm(directory, { recursive: true, force: true });
  }
});
