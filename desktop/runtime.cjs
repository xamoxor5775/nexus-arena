"use strict";
const path = require("node:path");

const ENTRY_URL = "nexus://app/index.html";
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "media-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
].join("; ");

function isTrustedUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "nexus:" && url.hostname === "app" && !url.port && !url.username && !url.password;
  } catch { return false; }
}

function isInside(root, candidate, paths = path) {
  const relative = paths.relative(paths.resolve(root), paths.resolve(candidate));
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${paths.sep}`) && !paths.isAbsolute(relative);
}

function resolveAssetPath(root, value, paths = path) {
  if (!isTrustedUrl(value)) return null;
  try {
    const pathname = decodeURIComponent(new URL(value).pathname);
    // Reject Windows separators, drive names, alternate data streams and double encoding.
    if (/[\\\x00-\x1f:%]/.test(pathname) || pathname.split("/").some((part) => part === "..")) return null;
    const relative = pathname === "/" || pathname === "" ? "index.html" : pathname.replace(/^\/+/, "");
    const candidate = paths.resolve(root, relative);
    return isInside(root, candidate, paths) ? candidate : null;
  } catch { return null; }
}

function sanitizeWindowState(value) {
  const source = value && typeof value === "object" ? value : {};
  const integer = (number, fallback, min, max) => Number.isInteger(number) && number >= min && number <= max ? number : fallback;
  const state = {
    width: integer(source.width, 1280, 800, 7680),
    height: integer(source.height, 800, 600, 4320),
    fullscreen: source.fullscreen === true,
    maximized: source.maximized === true,
  };
  if (Number.isInteger(source.x) && Number.isInteger(source.y) && Math.abs(source.x) <= 32768 && Math.abs(source.y) <= 32768) {
    state.x = source.x;
    state.y = source.y;
  }
  return state;
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".wav": "audio/wav" };
module.exports = { ENTRY_URL, CSP, MIME, isTrustedUrl, isInside, resolveAssetPath, sanitizeWindowState };
