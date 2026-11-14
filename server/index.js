// Static file server plus the co-op WebSocket endpoint.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { RoomManager } from "./room.js";
import { MAX_MESSAGE_BYTES } from "../shared/protocol.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

const ALLOWED = [
  "/index.html",
  "/js/",
  "/css/",
  "/shared/",
  "/client/",
  "/docs/",
  "/version.json",
];

function allowed(p) {
  return ALLOWED.some((prefix) => p === prefix || p.startsWith(prefix));
}

function serve(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    res.writeHead(400);
    res.end("bad request");
    return;
  }
  if (pathname === "/") pathname = "/index.html";
  if (pathname.includes("\0") || pathname.split("/").includes("..")) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  if (!allowed(pathname)) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  const file = path.join(ROOT, pathname);
  if (!file.startsWith(ROOT + path.sep)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      "content-type": MIME[ext] || "application/octet-stream",
      "content-length": stat.size,
      "cache-control": "no-cache",
    });
    fs.createReadStream(file).pipe(res);
  });
}

function readBuild() {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(ROOT, "version.json"), "utf8"));
    return v.short || "dev";
  } catch {
    return "dev";
  }
}

const port = Number(process.env.PORT || 8731);
const host = process.env.HOST || "0.0.0.0";
const manager = new RoomManager(readBuild());

const server = http.createServer(serve);
const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

server.on("upgrade", (req, socket, head) => {
  let pathname;
  try {
    pathname = new URL(req.url, "http://localhost").pathname;
  } catch {
    socket.destroy();
    return;
  }
  if (pathname !== "/ws") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => manager.handle(ws));
});

server.listen(port, host, () => {
  console.log(`Saltline server on http://localhost:${port} (build ${readBuild()})`);
});

function shutdown() {
  console.log("shutting down");
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);