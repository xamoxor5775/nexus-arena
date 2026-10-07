import { getSql } from "./db";
import { hashId, isInternalIp, joinDay, normalizeIp, parsePrefixes } from "./arena-joins";

/** Adds one visit for this visitor today. Never throws: a DB hiccup only loses the count. */
export async function recordPageVisit(rawIp: string, now = Date.now()): Promise<boolean> {
  try {
    const day = joinDay(now);
    const ip = normalizeIp(rawIp);
    const ipHash = hashId(`ip:${ip}`, (process.env.NEXUS_ACCESS_SECRET || "").trim());
    const internal = isInternalIp(ip, parsePrefixes(process.env.NEXUS_INTERNAL_IP_PREFIXES));
    const sql = await getSql();
    await sql.query(
      `insert into nexus_page_visits (day, ip_hash, internal) values ($1, $2, $3)
       on conflict (day, ip_hash) do update set visits = nexus_page_visits.visits + 1, last_at = now()`,
      [day, ipHash, internal],
    );
    return true;
  } catch (err) {
    console.error("[visita] no se pudo guardar:", err instanceof Error ? err.message : err);
    return false;
  }
}

type Bucket = { visitas: number; visitantes: number };
export type VisitDay = { dia: string; visitas: number; visitantes: number; visitasInternas: number; ingresos: number; jugadores: number };

const empty = (): Bucket => ({ visitas: 0, visitantes: 0 });

/** Admin summary: page visits + arena entries. External (non-internal) traffic by default. */
export async function visitStats(days = 14) {
  const sql = await getSql();
  const now = Date.now();
  const hoy = joinDay(now);
  const d7 = joinDay(now - 6 * 86_400_000);
  const d30 = joinDay(now - 29 * 86_400_000);
  const since = joinDay(now - (days - 1) * 86_400_000);
  const bucket = (where: string) =>
    `select coalesce(sum(visits), 0)::int as visitas, count(distinct ip_hash)::int as visitantes from nexus_page_visits where ${where}`;
  const joinBucket = (where: string) =>
    `select count(*)::int as visitas, count(distinct session_hash)::int as visitantes from nexus_arena_joins where not internal and not dev and ${where}`;
  const [today, week, month, total, internalToday, internalTotal, since0, joinsToday, joinsWeek, joinsTotal, perDay, joinsPerDay] = await Promise.all([
    sql.query<Bucket>(bucket("not internal and day = $1::date"), [hoy]),
    sql.query<Bucket>(bucket("not internal and day >= $1::date"), [d7]),
    sql.query<Bucket>(bucket("not internal and day >= $1::date"), [d30]),
    sql.query<Bucket>(bucket("not internal")),
    sql.query<Bucket>(bucket("internal and day = $1::date"), [hoy]),
    sql.query<Bucket>(bucket("internal")),
    sql.query<{ desde: string | null }>("select min(day)::text as desde from nexus_page_visits"),
    sql.query<Bucket>(joinBucket("day = $1::date"), [hoy]),
    sql.query<Bucket>(joinBucket("day >= $1::date"), [d7]),
    sql.query<Bucket>(joinBucket("true")),
    sql.query<{ dia: string; visitas: number; visitantes: number; visitasInternas: number }>(
      `select day::text as dia,
              coalesce(sum(visits) filter (where not internal), 0)::int as visitas,
              count(distinct ip_hash) filter (where not internal)::int as visitantes,
              coalesce(sum(visits) filter (where internal), 0)::int as "visitasInternas"
         from nexus_page_visits where day >= $1::date group by day`,
      [since],
    ),
    sql.query<{ dia: string; ingresos: number; jugadores: number }>(
      `select day::text as dia, count(*)::int as ingresos, count(distinct session_hash)::int as jugadores
         from nexus_arena_joins where not internal and not dev and day >= $1::date group by day`,
      [since],
    ),
  ]);
  const dias: VisitDay[] = [];
  for (let i = 0; i < days + 1 && dias.length < days; i += 1) {
    const dia = joinDay(now - i * 86_400_000);
    if (dias.some((row) => row.dia === dia)) continue; // DST: two timestamps can land on one day
    const v = perDay.find((row) => row.dia === dia);
    const j = joinsPerDay.find((row) => row.dia === dia);
    dias.push({ dia, visitas: v?.visitas || 0, visitantes: v?.visitantes || 0, visitasInternas: v?.visitasInternas || 0, ingresos: j?.ingresos || 0, jugadores: j?.jugadores || 0 });
  }
  return {
    zonaHoraria: "America/Santiago",
    hoy,
    desde: since0[0]?.desde || null,
    visitas: { hoy: today[0] || empty(), ultimos7: week[0] || empty(), ultimos30: month[0] || empty(), total: total[0] || empty() },
    internas: { hoy: internalToday[0] || empty(), total: internalTotal[0] || empty() },
    ingresos: { hoy: joinsToday[0] || empty(), ultimos7: joinsWeek[0] || empty(), total: joinsTotal[0] || empty() },
    dias,
  };
}
