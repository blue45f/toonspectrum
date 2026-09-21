import http from "node:http";
import net from "node:net";

/** Unique loopback origin prevents browser storage from an earlier test run contaminating this run. */
export async function createStudioDrawingIsolatedOrigin(source) {
  const upstream = new URL(source);
  if (upstream.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(upstream.hostname)
    || upstream.username || upstream.password) throw new Error("Drawing evidence requires an unauthenticated loopback HTTP origin");
  const host = upstream.hostname.replace(/^\[|\]$/g, "");
  const port = Number(upstream.port || 80);
  const sockets = new Set();
  const server = http.createServer((incoming, outgoing) => {
    if (!incoming.url?.startsWith("/") || incoming.url.startsWith("//")) { outgoing.writeHead(400).end(); return; }
    const request = http.request({ hostname: host, port, method: incoming.method, path: incoming.url,
      headers: { ...incoming.headers, host: upstream.host } }, (response) => {
      outgoing.writeHead(response.statusCode ?? 502, response.headers); response.pipe(outgoing);
    });
    request.on("error", () => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end(); });
    outgoing.on("close", () => request.destroy());
    incoming.pipe(request);
  });
  server.on("connection", (socket) => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
  // Preserve the fixture dev server's HMR connection; never forward to a caller-selected host.
  server.on("upgrade", (request, socket, head) => {
    const peer = net.connect({ host, port }); sockets.add(peer); peer.once("close", () => sockets.delete(peer));
    peer.once("connect", () => {
      peer.write(`${request.method} ${request.url} HTTP/1.1\r\n${Object.entries({ ...request.headers, host: upstream.host }).map(([key, value]) => `${key}: ${value}`).join("\r\n")}\r\n\r\n`);
      if (head.length) peer.write(head); peer.pipe(socket); socket.pipe(peer);
    });
    peer.on("error", () => socket.destroy()); socket.on("error", () => peer.destroy()); socket.on("close", () => peer.destroy());
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  return {
    origin: `http://127.0.0.1:${address.port}`,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}
