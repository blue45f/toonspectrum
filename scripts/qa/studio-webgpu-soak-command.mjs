/** Use the tested Linux compositor path; native platforms keep their normal browser launch. */
export function studioWebGpuSoakCommand(script, platform = process.platform) {
  const prefix = platform === "linux"
    ? 'TOONSPECTRUM_WEBGPU_HEADED=1 xvfb-run -a --server-args="-screen 0 1920x1200x24" '
    : "";
  return `${prefix}pnpm run ${script}`;
}
