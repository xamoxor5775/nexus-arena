import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { ArrowUpRight, CircleDollarSign, Gamepad2, Gauge, LockKeyhole, Users } from "lucide-react";

export const Route = createFileRoute("/admin/metrics")({ component: AdminMetrics });
type Metrics = { goal: number; paidUsers: number; pendingOrders: number; ordersLast30Days: number; paidLast30Days: number; revenueLast30Days: number; latest: Array<{ email: string; amount: number; paidAt: string | null }> };

function AdminMetrics() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function load() { setLoading(true); const response = await fetch("/api/admin/metrics"); setMetrics(response.ok ? await response.json() : null); setLoading(false); }
  useEffect(() => { void load(); }, []);
  async function login(event: FormEvent) { event.preventDefault(); setError(""); const response = await fetch("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) }); if (!response.ok) { setError("No se pudo validar la credencial."); return; } setPassword(""); await load(); }
  if (!metrics && !loading) return <main className="admin-login"><form onSubmit={login} className="admin-login-card"><LockKeyhole /><p className="admin-eyebrow">NEXUS ARENA · CONTROL PRIVADO</p><h1>Métricas del crucible.</h1><p>Panel reservado para administración y seguimiento de la meta mensual.</p><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Clave administrativa" autoComplete="current-password" /><button type="submit">INGRESAR AL PANEL</button>{error && <small>{error}</small>}</form></main>;
  if (loading || !metrics) return <main className="admin-loading">CARGANDO MÉTRICAS…</main>;
  const progress = Math.min(100, Math.round((metrics.paidUsers / metrics.goal) * 100));
  return <main className="admin-shell"><header className="admin-header"><div><p className="admin-eyebrow">NEXUS ARENA · CONTROL PRIVADO</p><h1>Panel de tracción.</h1></div><div className="admin-header-actions"><a className="admin-arena-link" href="/?access=1"><Gamepad2 /> Acceder a la arena</a><a href="/">Volver al landing <ArrowUpRight /></a></div></header><section className="admin-goal"><div><p className="admin-eyebrow">META PRINCIPAL</p><h2>{metrics.paidUsers} <span>/ {metrics.goal} usuarios pagados</span></h2><div className="admin-progress"><i style={{ width: `${progress}%` }} /></div><p>{progress}% de avance hacia la meta mensual</p></div><Gauge /></section><section className="admin-cards"><Metric icon={<Users />} label="Pagados acumulados" value={metrics.paidUsers} /><Metric icon={<Users />} label="Pagados últimos 30 días" value={metrics.paidLast30Days} /><Metric icon={<CircleDollarSign />} label="Ingresos últimos 30 días" value={`$${metrics.revenueLast30Days.toLocaleString("es-CL")} CLP`} /><Metric icon={<Gauge />} label="Órdenes pendientes" value={metrics.pendingOrders} /></section><section className="admin-table"><div className="admin-table-head"><div><p className="admin-eyebrow">ACTIVIDAD RECIENTE</p><h2>Últimos accesos confirmados</h2></div><span>{metrics.ordersLast30Days} órdenes creadas en 30 días</span></div>{metrics.latest.length ? <div>{metrics.latest.map((row) => <article key={`${row.email}-${row.paidAt}`}><span>{row.email}</span><b>${row.amount.toLocaleString("es-CL")} CLP</b><small>{row.paidAt ? new Date(row.paidAt).toLocaleString("es-CL") : "Fecha pendiente"}</small></article>)}</div> : <p className="admin-empty">Aún no hay pagos confirmados.</p>}</section></main>;
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) { return <article className="admin-metric"><div>{icon}</div><p>{label}</p><strong>{value}</strong></article>; }
