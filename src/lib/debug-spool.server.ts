import { appendFile, mkdir, readFile, rename, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

const MAX_BYTES = 2_000_000;

export function spoolPath() {
  const explicit = process.env.NEXUS_SPOOL_PATH?.trim();
  if (explicit) return explicit;
  const dataDir = process.env.PGLITE_DATA_DIR?.trim();
  if (dataDir) return join(dataDir, "nexus-arena.spool");
  return join(process.cwd(), "logs", "nexus-arena.spool");
}

function redact(value: string) {
  return value
    .replace(/[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9._-]{16,}/g, "[redacted-token]")
    .replace(/(authorization|cookie|token|llave|secret|password)\s*[:=]\s*["']?[^"'&\s]+/gi, "$1=[redacted]");
}

export async function appendSpool(lines: string[]) {
  const path = spoolPath();
  await mkdir(dirname(path), { recursive: true });
  const body = lines
    .map((line) => redact(line).replace(/\s+$/g, ""))
    .filter(Boolean)
    .join("\n");
  if (!body) return;
  await appendFile(path, `${body}\n`, "utf8");
  try {
    const info = await stat(path);
    if (info.size > MAX_BYTES) {
      await rename(path, `${path}.1`).catch(() => undefined);
    }
  } catch {
    /* first write */
  }
}

export async function readSpoolTail(maxChars = 80_000) {
  const path = spoolPath();
  try {
    const raw = await readFile(path, "utf8");
    return raw.length <= maxChars ? raw : raw.slice(-maxChars);
  } catch {
    return "";
  }
}

export async function spoolServer(scope: string, err: unknown, extra?: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  await appendSpool([
    JSON.stringify({
      t: new Date().toISOString(),
      level: "error",
      scope,
      message: redact(message),
      stack: stack ? redact(stack) : undefined,
      extra,
      src: "server",
    }),
  ]);
}
