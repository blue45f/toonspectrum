// Serves dist/ with COOP same-origin + COEP credentialless so /studio's cross-origin-isolation
// gate opens. `vite preview` does not emit these headers, so browser verification of the studio
// shell needs this server instead.
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.argv[2] ?? "dist");
const port = Number(process.argv[3] ?? 4357);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function resolveFile(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  const candidate = join(root, clean);
  if (!candidate.startsWith(root)) return join(root, "index.html");
  try {
    const stat = statSync(candidate);
    if (stat.isDirectory()) return join(candidate, "index.html");
    return candidate;
  } catch {
    return join(root, "index.html");
  }
}

createServer((req, res) => {
  const file = resolveFile(req.url ?? "/");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
  const stream = createReadStream(file);
  stream.on("error", () => {
    res.statusCode = 404;
    res.end("not found");
  });
  stream.pipe(res);
}).listen(port, () => {
  console.log(`studio isolated static server: http://localhost:${port} (root ${root})`);
});
