import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { ArrowUpRight, CircleDollarSign, Eye, Gamepad2, Gauge, LockKeyhole, Swords, Users } from "lucide-react";

export const Route = createFileRoute("/admin/metrics")({ component: AdminMetrics });
type Metrics = { goal: number; paidUsers: number; pendingOrders: number; ordersLast30Days: number; paidLast30Days: number; revenueLast30Days: number; latest: Array<{ email: string; amount: number; paidAt: string | null }> };

type Bucket = { visitas: number; visitantes: number };
type Visits = { hoy: string; desde: string | null; visitas: { hoy: Bucket; ultimos7: Bucket; ultimos30: Bucket; total: Bucket }; internas: { hoy: Bucket; total: Bucket }; ingresos: { hoy: Bucket; ultimos7: Bucket; total: Bucket }; dias: Array<{ dia: string; visitas: number; visitantes: number; visitasInternas: number; ingresos: number; jugadores: number }> };

function AdminMetrics() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [visits, setVisits] = useState<Visits | null>(null);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function load() { setLoading(true); const response = await fetch("/api/admin/metrics"); setMetrics(response.ok ? await response.json() : null); if (response.ok) { const counter = await fetch("/api/admin/visitas").catch(() => null); setVisits(counter?.ok ? await counter.json() : null); } setLoading(false); }
  useEffect(() => { void load(); }, []);
  async function login(event: FormEvent) { event.preventDefault(); setError(""); const response = await fetch("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) }); if (!response.ok) { setError("No se pudo validar la credencial."); return; } setPassword(""); await load(); }
  if (!metrics && !loading) return <main className="admin-login"><form onSubmit={login} className="admin-login-card"><LockKeyhole /><p className="admin-eyebrow">NEXUS ARENA · CONTROL PRIVADO</p><h1>Métricas del crucible.</h1><p>Panel reservado para administración y seguimiento de la meta mensual.</p><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Clave administrativa" autoComplete="current-password" /><button type="submit">INGRESAR AL PANEL</button>{error && <small>{error}</small>}</form></main>;
  if (loading || !metrics) return <main className="admin-loading">CARGANDO MÉTRICAS…</main>;
  const progress = Math.min(100, Math.round((metrics.paidUsers / metrics.goal) * 100));
  return <main className="admin-shell"><header className="admin-header"><div><p className="admin-eyebrow">NEXUS ARENA · CONTROL PRIVADO</p><h1>Panel de tracción.</h1></div><div className="admin-header-actions"><a className="admin-arena-link" href="/?access=1"><Gamepad2 /> Acceder a la arena</a><a href="/">Volver al landing <ArrowUpRight /></a></div></header><section className="admin-goal"><div><p className="admin-eyebrow">META PRINCIPAL</p><h2>{metrics.paidUsers} <span>/ {metrics.goal} usuarios pagados</span></h2><div className="admin-progress"><i style={{ width: `${progress}%` }} /></div><p>{progress}% de avance hacia la meta mensual</p></div><Gauge /></section><section className="admin-cards"><Metric icon={<Users />} label="Pagados acumulados" value={metrics.paidUsers} /><Metric icon={<Users />} label="Pagados últimos 30 días" value={metrics.paidLast30Days} /><Metric icon={<CircleDollarSign />} label="Ingresos últimos 30 días" value={`$${metrics.revenueLast30Days.toLocaleString("es-CL")} CLP`} /><Metric icon={<Gauge />} label="Órdenes pendientes" value={metrics.pendingOrders} /></section>{visits && <VisitCounter visits={visits} />}<section className="admin-table"><div className="admin-table-head"><div><p className="admin-eyebrow">ACTIVIDAD RECIENTE</p><h2>Últimos accesos confirmados</h2></div><span>{metrics.ordersLast30Days} órdenes creadas en 30 días</span></div>{metrics.latest.length ? <div>{metrics.latest.map((row) => <article key={`${row.email}-${row.paidAt}`}><span>{row.email}</span><b>${row.amount.toLocaleString("es-CL")} CLP</b><small>{row.paidAt ? new Date(row.paidAt).toLocaleString("es-CL") : "Fecha pendiente"}</small></article>)}</div> : <p className="admin-empty">Aún no hay pagos confirmados.</p>}</section></main>;
}

function VisitCounter({ visits }: { visits: Visits }) {
  const n = (value: number) => value.toLocaleString("es-CL");
  const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("es-CL", { weekday: "short", day: "2-digit", month: "2-digit" });
  return <section className="admin-visits" id="contador-visitas">
    <div className="admin-table-head"><div><p className="admin-eyebrow">TRÁFICO DEL SITIO</p><h2>Contador de visitas</h2></div><span>Sin bots ni tráfico interno · hora de Chile{visits.desde ? ` · desde ${day(visits.desde)}` : ""}</span></div>
    <div className="admin-cards admin-visit-cards">
      <Metric icon={<Eye />} label="Visitas hoy" value={n(visits.visitas.hoy.visitas)} />
      <Metric icon={<Users />} label="Visitantes únicos hoy" value={n(visits.visitas.hoy.visitantes)} />
      <Metric icon={<Eye />} label="Últimos 7 días" value={`${n(visits.visitas.ultimos7.visitas)} · ${n(visits.visitas.ultimos7.visitantes)} únicos`} />
      <Metric icon={<Eye />} label="Últimos 30 días" value={`${n(visits.visitas.ultimos30.visitas)} · ${n(visits.visitas.ultimos30.visitantes)} únicos`} />
      <Metric icon={<Gauge />} label="Total desde el inicio" value={`${n(visits.visitas.total.visitas)} · ${n(visits.visitas.total.visitantes)} únicos`} />
      <Metric icon={<Swords />} label="Ingresos a la arena hoy" value={`${n(visits.ingresos.hoy.visitas)} · ${n(visits.ingresos.hoy.visitantes)} jugadores`} />
      <Metric icon={<Swords />} label="Ingresos arena 7 días" value={`${n(visits.ingresos.ultimos7.visitas)} · ${n(visits.ingresos.ultimos7.visitantes)} jugadores`} />
      <Metric icon={<Gamepad2 />} label="Tráfico interno (pruebas)" value={`${n(visits.internas.hoy.visitas)} hoy · ${n(visits.internas.total.visitas)} total`} />
    </div>
    <div className="admin-visit-table">
      <div className="admin-visit-row admin-visit-row-head"><span>Día</span><span>Visitas</span><span>Únicos</span><span>Ingresos arena</span><span>Internas</span></div>
      {visits.dias.map((row) => <div className="admin-visit-row" key={row.dia}><span>{row.dia === visits.hoy ? "Hoy" : day(row.dia)}</span><b>{n(row.visitas)}</b><span>{n(row.visitantes)}</span><span>{n(row.ingresos)}{row.jugadores ? ` (${n(row.jugadores)} jug.)` : ""}</span><small>{n(row.visitasInternas)}</small></div>)}
    </div>
  </section>;
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) { return <article className="admin-metric"><div>{icon}</div><p>{label}</p><strong>{value}</strong></article>; }
