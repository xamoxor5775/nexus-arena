/** Tiny in-memory sliding-window limiter per key (IP). Single container: good enough. */
export function makeLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((stamp) => now - stamp < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return true;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 2000) {
      for (const [k, stamps] of hits) if (stamps.every((stamp) => now - stamp >= windowMs)) hits.delete(k);
    }
    return false;
  };
}
