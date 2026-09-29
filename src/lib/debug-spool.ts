export type SpoolLevel = "debug" | "info" | "warn" | "error";

export type SpoolEvent = {
  t: string;
  level: SpoolLevel;
  scope: string;
  message: string;
  stack?: string;
  extra?: unknown;
  href?: string;
};

const STORAGE_KEY = "nexus-arena-spool-v1";
const MAX_EVENTS = 400;
const MAX_JSON = 80_000;

function stamp() {
  return new Date().toISOString();
}

function asError(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) return { message: err.message || err.name, stack: err.stack };
  if (typeof err === "string") return { message: err };
  try {
    return { message: JSON.stringify(err) };
  } catch {
    return { message: String(err) };
  }
}

function redact(value: string) {
  return value
    .replace(/[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9._-]{16,}/g, "[redacted-token]")
    .replace(/(authorization|cookie|token|llave)\s*[:=]\s*["']?[^"'&\s]+/gi, "$1=[redacted]");
}

function serialize(event: SpoolEvent): string {
  const line = {
    ...event,
    message: redact(event.message),
    stack: event.stack ? redact(event.stack) : undefined,
  };
  try {
    return JSON.stringify(line);
  } catch {
    return JSON.stringify({ t: event.t, level: event.level, scope: event.scope, message: event.message });
  }
}

class DebugSpool {
  private events: SpoolEvent[] = [];
  private installed = false;
  private pending = 0;
  private flushTimer = 0;

  dump(): SpoolEvent[] {
    return [...this.events];
  }

  text(): string {
    return this.events.map((event) => serialize(event)).join("\n") + "\n";
  }

  private persistTimer = 0;

  write(level: SpoolLevel, scope: string, err: unknown, extra?: unknown) {
    const { message, stack } = asError(err);
    const event: SpoolEvent = {
      t: stamp(),
      level,
      scope,
      message,
      stack,
      extra,
      href: typeof location !== "undefined" ? location.pathname : undefined,
    };
    this.events.push(event);
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    this.schedulePersist();
    if (level === "error" || level === "warn") this.scheduleFlush(800);
    if (typeof console !== "undefined" && this.events.filter((e) => e.scope === scope && e.level === level).length <= 2) {
      const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.debug;
      fn(`[spool:${scope}]`, message, extra ?? "");
    }
  }

  debug(scope: string, err: unknown, extra?: unknown) {
    this.write("debug", scope, err, extra);
  }
  info(scope: string, err: unknown, extra?: unknown) {
    this.write("info", scope, err, extra);
  }
  warn(scope: string, err: unknown, extra?: unknown) {
    this.write("warn", scope, err, extra);
  }
  error(scope: string, err: unknown, extra?: unknown) {
    this.write("error", scope, err, extra);
  }

  download() {
    if (typeof document === "undefined") return;
    const blob = new Blob([this.text()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nexus-arena-${stamp().replace(/[:.]/g, "-")}.spool`;
    a.click();
    URL.revokeObjectURL(url);
  }

  install() {
    if (this.installed || typeof window === "undefined") return;
    this.installed = true;
    this.restore();
    window.addEventListener("error", (event) => {
      this.error("window", event.error || event.message, { source: event.filename, line: event.lineno });
    });
    window.addEventListener("unhandledrejection", (event) => {
      this.error("promise", event.reason);
    });
    this.info("spool", "sesión de depuración iniciada", {
      ua: navigator.userAgent.slice(0, 120),
      w: window.innerWidth,
      h: window.innerHeight,
    });
  }

  private persist() {
    try {
      let raw = this.text();
      while (raw.length > MAX_JSON && this.events.length > 40) {
        this.events.splice(0, 20);
        raw = this.text();
      }
      sessionStorage.setItem(STORAGE_KEY, raw);
    } catch {
      /* quota */
    }
  }

  private schedulePersist() {
    if (typeof window === "undefined") return;
    if (this.persistTimer) return;
    this.persistTimer = window.setTimeout(() => {
      this.persistTimer = 0;
      this.persist();
    }, 900);
  }

  private restore() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        this.events.push(JSON.parse(line) as SpoolEvent);
      }
      if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    } catch {
      /* ignore */
    }
  }

  private scheduleFlush(ms: number) {
    if (typeof window === "undefined") return;
    this.pending += 1;
    if (this.flushTimer) return;
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = 0;
      void this.flush();
    }, ms);
  }

  private async flush() {
    if (!this.pending || typeof fetch === "undefined") return;
    const batch = this.events.filter((event) => event.level === "warn" || event.level === "error").slice(-12);
    this.pending = 0;
    if (!batch.length) return;
    try {
      await fetch("/api/debug/spool", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events: batch }),
        keepalive: true,
      });
    } catch {
      this.pending = Math.min(MAX_EVENTS, this.pending + batch.length);
    }
  }
}

export const debugSpool = new DebugSpool();

if (typeof window !== "undefined") {
  (window as unknown as { __nexusSpool?: DebugSpool }).__nexusSpool = debugSpool;
}
