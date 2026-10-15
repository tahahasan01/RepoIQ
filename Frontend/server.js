// Production static server for the built SPA in dist/.
//
// `vite preview` is a local preview tool, not a production server. This is a
// deliberately small, dependency-free replacement that does what the app needs:
//   - SPA fallback: extensionless paths (/dashboard/42) get index.html
//   - hashed /assets/* cached for a year; index.html always revalidated
//   - security headers, including a CSP built from VITE_API_BASE_URL
//   - gzip/brotli for text assets, compressed once and kept in memory
//
// Usage: npm run build && PORT=4173 npm start

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "dist");
const PORT = Number(process.env.PORT) || 4173;
// Unset HOST listens on every interface, IPv4 and IPv6 (Node binds `::`).
const HOST = process.env.HOST || undefined;
const INDEX = path.join(ROOT, "index.html");

if (!fs.existsSync(INDEX)) {
  console.error(`[server] ${INDEX} not found - run \`npm run build\` first.`);
  process.exit(1);
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};
const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".json", ".webmanifest", ".map", ".txt", ".xml", ".svg", ".ico"]);

// --- Content-Security-Policy -------------------------------------------------
// The API is usually on another origin (VITE_API_BASE_URL is baked into the
// bundle at build time; Railway and Nixpacks expose the same variable at
// runtime). Without it we cannot know where the app will fetch from, so fall
// back to allowing any https origin rather than shipping a site whose every
// request is blocked - and say so loudly.
function apiOrigin() {
  const configured = process.env.VITE_API_BASE_URL;
  if (!configured) return null;
  try {
    return new URL(configured).origin;
  } catch {
    // A relative base URL ("/api/v1") is same-origin: 'self' covers it.
    return "";
  }
}
const api = apiOrigin();
if (api === null) {
  console.warn("[server] VITE_API_BASE_URL is not set at runtime; CSP connect-src falls back to any https: origin.");
}
const apiSources = api ? ` ${api}` : api === null ? " https:" : "";

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // Inline style attributes are everywhere (framer-motion, Radix, recharts).
  "style-src 'self' 'unsafe-inline'",
  // GitHub avatars, uploaded avatars served by the API, Unsplash images on the
  // blog, and data:/blob: URLs for generated images.
  `img-src 'self' data: blob: https://avatars.githubusercontent.com https://images.unsplash.com${apiSources}`,
  "font-src 'self' data:",
  `connect-src 'self'${apiSources}`,
  "media-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = {
  "Content-Security-Policy": CSP,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
};

// --- File lookup ---------------------------------------------------------------
const cache = new Map(); // absolute path -> { body, etag, mtimeMs, encoded: Map }

function load(file) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;
  const hit = cache.get(file);
  if (hit && hit.mtimeMs === stat.mtimeMs) return hit;
  const body = fs.readFileSync(file);
  const etag = `"${crypto.createHash("sha1").update(body).digest("base64url").slice(0, 27)}"`;
  const entry = { body, etag, mtimeMs: stat.mtimeMs, encoded: new Map() };
  cache.set(file, entry);
  return entry;
}

/** Map a URL path to a file inside dist/, or null if it escapes or is hidden. */
function resolve(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const file = path.join(ROOT, path.normalize(decoded));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return null;
  // No dotfiles (.env and friends never belong in dist, but never serve them).
  if (path.relative(ROOT, file).split(path.sep).some((part) => part.startsWith("."))) return null;
  return file;
}

function cacheControl(file) {
  if (file === INDEX) return "no-cache";
  // Vite content-hashes everything it writes to assets/, so a URL's bytes never change.
  if (path.relative(ROOT, file).split(path.sep)[0] === "assets") return "public, max-age=31536000, immutable";
  // public/ files (favicon, opengraph.png, robots.txt) keep their names across deploys.
  return "public, max-age=3600";
}

function pickEncoding(req, ext) {
  if (!COMPRESSIBLE.has(ext)) return null;
  const accept = String(req.headers["accept-encoding"] || "");
  if (/\bbr\b/.test(accept)) return "br";
  if (/\bgzip\b/.test(accept)) return "gzip";
  return null;
}

function encode(entry, encoding) {
  let out = entry.encoded.get(encoding);
  if (!out) {
    out =
      encoding === "br"
        ? zlib.brotliCompressSync(entry.body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } })
        : zlib.gzipSync(entry.body, { level: 9 });
    entry.encoded.set(encoding, out);
  }
  return out;
}

function send(req, res, status, file, entry) {
  const ext = path.extname(file).toLowerCase();
  const headers = {
    ...SECURITY_HEADERS,
    "Content-Type": TYPES[ext] || "application/octet-stream",
    "Cache-Control": cacheControl(file),
    ETag: entry.etag,
    Vary: "Accept-Encoding",
  };
  if (req.headers["x-forwarded-proto"] === "https") {
    headers["Strict-Transport-Security"] = "max-age=31536000";
  }
  if (status === 200 && req.headers["if-none-match"] === entry.etag) {
    res.writeHead(304, headers);
    return res.end();
  }
  const encoding = pickEncoding(req, ext);
  const body = encoding ? encode(entry, encoding) : entry.body;
  if (encoding) headers["Content-Encoding"] = encoding;
  headers["Content-Length"] = body.length;
  res.writeHead(status, headers);
  res.end(req.method === "HEAD" ? undefined : body);
}

function notFound(req, res) {
  res.writeHead(404, { ...SECURITY_HEADERS, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" });
  res.end(req.method === "HEAD" ? undefined : "Not found");
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { ...SECURITY_HEADERS, Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Method not allowed");
  }
  let pathname;
  try {
    pathname = new URL(req.url || "/", "http://localhost").pathname;
  } catch {
    return notFound(req, res);
  }

  const file = resolve(pathname);
  if (file === null) return notFound(req, res);

  const direct = load(file === ROOT ? INDEX : file);
  if (direct) return send(req, res, 200, file === ROOT ? INDEX : file, direct);

  // A missing file under assets/, or any path with an extension, is a real
  // 404: answering it with index.html would hand HTML to a <script> tag (and
  // a stale tab asking for an old chunk would get a confusing parse error).
  const isAsset = pathname.startsWith("/assets/") || path.extname(pathname) !== "";
  if (isAsset) return notFound(req, res);

  // Client-side route: let React Router handle it.
  return send(req, res, 200, INDEX, load(INDEX));
});

server.listen(PORT, HOST, () => {
  console.log(`[server] Serving ${ROOT} on port ${PORT}${HOST ? ` (${HOST})` : ""}`);
});

// Let in-flight responses finish when the platform stops the container.
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
