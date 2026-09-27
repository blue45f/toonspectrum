import { allowStudioProgrammaticReload } from "./programmatic-reload";

if (import.meta.hot) {
  import.meta.hot.on("vite:beforeFullReload", () => {
    allowStudioProgrammaticReload();
  });
}
