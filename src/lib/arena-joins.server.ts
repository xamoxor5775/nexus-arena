import { getSql } from "./db";
import { hashId, isInternalIp, joinDay, normalizeIp, parsePrefixes } from "./arena-joins";

/**
 * Records the first time a peer enters a match room each day: one `[ingreso]` line on
 * stdout (docker logs) + one row in nexus_arena_joins. Never throws and never blocks
 * the /api/rtc poll — a DB hiccup only loses the row, not the match.
 */
const state = globalThis as typeof globalThis & { __nexusJoinSeen__?: { day: string; keys: Set<string> } };

function seenToday(day: string): Set<string> {
  if (!state.__nexusJoinSeen__ || state.__nexusJoinSeen__.day !== day) state.__nexusJoinSeen__ = { day, keys: new Set() };
  return state.__nexusJoinSeen__.keys;
}

export type ArenaJoin = { room: string; peer: string; sessionId: string; ip: string; dev?: boolean };

export function recordArenaJoin(join: ArenaJoin, now = Date.now()): void {
  try {
    const day = joinDay(now);
    const key = `${join.room}|${join.peer}`;
    const seen = seenToday(day);
    if (seen.has(key)) return;
    if (seen.size > 50_000) seen.clear(); // backstop against a flood of fake peer ids
    seen.add(key);
    const secret = (process.env.NEXUS_ACCESS_SECRET || "").trim();
    const ip = normalizeIp(join.ip);
    const sessionHash = hashId(`s:${join.sessionId}`, secret);
    const ipHash = hashId(`ip:${ip}`, secret);
    const internal = isInternalIp(ip, parsePrefixes(process.env.NEXUS_INTERNAL_IP_PREFIXES));
    const dev = Boolean(join.dev);
    console.log(
      `[ingreso] ${new Date(now).toISOString()} dia=${day} sala=${join.room} peer=${join.peer.slice(0, 8)} jugador=${sessionHash} ip=${ipHash} interno=${internal ? 1 : 0} dev=${dev ? 1 : 0}`,
    );
    void getSql()
      .then((sql) =>
        sql.query(
          "insert into nexus_arena_joins (day, room, peer, session_hash, ip_hash, internal, dev) values ($1, $2, $3, $4, $5, $6, $7) on conflict do nothing",
          [day, join.room, join.peer, sessionHash, ipHash, internal, dev],
        ),
      )
      .catch((err) => console.error("[ingreso] no se pudo guardar:", err instanceof Error ? err.message : err));
  } catch (err) {
    console.error("[ingreso] error:", err instanceof Error ? err.message : err);
  }
}

export type JoinDayStats = { dia: string; ingresos: number; jugadores: number; ips: number; externos: number; ipsExternas: number };

/** Per-day counts (newest first). `externos` excludes internal IPs and the dev room. */
export async function arenaJoinStats(days: number) {
  const sql = await getSql();
  const since = joinDay(Date.now() - (days - 1) * 86_400_000);
  const [perDay, totals] = await Promise.all([
    sql.query<JoinDayStats>(
      `select day::text as dia,
              count(*)::int as ingresos,
              count(distinct session_hash)::int as jugadores,
              count(distinct ip_hash)::int as ips,
              count(distinct session_hash) filter (where not internal and not dev)::int as externos,
              count(distinct ip_hash) filter (where not internal and not dev)::int as "ipsExternas"
         from nexus_arena_joins where day >= $1::date group by day order by day desc`,
      [since],
    ),
    sql.query<{ ingresos: number; jugadores: number; externos: number; desde: string | null }>(
      `select count(*)::int as ingresos,
              count(distinct session_hash)::int as jugadores,
              count(distinct session_hash) filter (where not internal and not dev)::int as externos,
              min(day)::text as desde
         from nexus_arena_joins`,
    ),
  ]);
  return { zonaHoraria: "America/Santiago", hoy: joinDay(), dias: perDay, total: totals[0] ?? { ingresos: 0, jugadores: 0, externos: 0, desde: null } };
}
