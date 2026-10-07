#!/usr/bin/env bash
# Ingresos a la arena por día (hora de Chile), leídos de nexus_arena_joins vía
# /api/admin/ingresos dentro del contenedor (login con NEXUS_ADMIN_SECRET del .env).
#
#   deploy/ingresos.sh          # últimos 14 días
#   deploy/ingresos.sh 60       # últimos 60 días
#   deploy/ingresos.sh 30 json  # salida JSON cruda
#
# Columnas: ingresos = entradas a salas (sala+peer por día); jugadores = sesiones
# distintas; ips = IPs distintas (hash); externos = jugadores sin IPs propias
# (NEXUS_INTERNAL_IP_PREFIXES, por defecto 104.30.180. y 190.114.) ni sala dev.
# Cada ingreso también queda en `docker logs nexus-arena | grep '\[ingreso\]'`.
set -euo pipefail

DAYS="${1:-14}"
FORMAT="${2:-tabla}"
CONTAINER="${NEXUS_CONTAINER:-nexus-arena}"

docker exec -e DIAS="$DAYS" -e FORMATO="$FORMAT" "$CONTAINER" node -e '
const base = "http://127.0.0.1:" + (process.env.PORT || 8080);
(async () => {
  const login = await fetch(base + "/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: process.env.NEXUS_ADMIN_SECRET || "" }),
  });
  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  if (!login.ok || !cookie) { console.error("login admin falló (" + login.status + ")"); process.exit(1); }
  const res = await fetch(base + "/api/admin/ingresos?dias=" + encodeURIComponent(process.env.DIAS), { headers: { cookie } });
  const data = await res.json();
  if (!res.ok) { console.error("error", res.status, data); process.exit(1); }
  if (process.env.FORMATO === "json") { console.log(JSON.stringify(data, null, 2)); return; }
  const pad = (v, n) => String(v).padStart(n);
  console.log("Ingresos a la arena (" + data.zonaHoraria + "), hoy " + data.hoy);
  console.log("dia         ingresos jugadores    ips externos");
  for (const d of data.dias) console.log(d.dia + " " + pad(d.ingresos, 8) + " " + pad(d.jugadores, 9) + " " + pad(d.ips, 6) + " " + pad(d.externos, 8));
  if (!data.dias.length) console.log("(sin ingresos en el período)");
  const t = data.total;
  console.log("Total desde " + (t.desde || "-") + ": " + t.ingresos + " ingresos, " + t.jugadores + " jugadores, " + t.externos + " externos");
})().catch((err) => { console.error(err); process.exit(1); });
'
