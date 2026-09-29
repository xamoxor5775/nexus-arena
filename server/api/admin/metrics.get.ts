import { defineEventHandler, setResponseStatus } from "h3";
import { getSql } from "../../../src/lib/db";
import { adminSessionIsValid } from "../../../src/lib/admin.server";

type CountRow = { count: number };
type SumRow = { total: number | null };

export default defineEventHandler(async (event) => {
  if (!adminSessionIsValid(event.node?.req.headers.cookie || null)) {
    setResponseStatus(event, 401);
    return { error: "No autorizado" };
  }
  const sql = await getSql();
  const [paid, pending, total, recent, revenue, latest] = await Promise.all([
    sql.query<CountRow>("select count(*)::int as count from nexus_orders where status = 'paid'"),
    sql.query<CountRow>("select count(*)::int as count from nexus_orders where status = 'pending'"),
    sql.query<CountRow>("select count(*)::int as count from nexus_orders where created_at >= now() - interval '30 days'"),
    sql.query<CountRow>("select count(*)::int as count from nexus_orders where status = 'paid' and coalesce(paid_at, created_at) >= now() - interval '30 days'"),
    sql.query<SumRow>("select coalesce(sum(amount_clp), 0)::int as total from nexus_orders where status = 'paid' and coalesce(paid_at, created_at) >= now() - interval '30 days'"),
    sql.query<{ email: string; amount_clp: number; paid_at: string | null }>("select email, amount_clp, paid_at from nexus_orders where status = 'paid' order by coalesce(paid_at, created_at) desc limit 8"),
  ]);
  return {
    goal: 100,
    paidUsers: paid[0]?.count || 0,
    pendingOrders: pending[0]?.count || 0,
    ordersLast30Days: total[0]?.count || 0,
    paidLast30Days: recent[0]?.count || 0,
    revenueLast30Days: revenue[0]?.total || 0,
    latest: latest.map((row) => ({ email: row.email, amount: row.amount_clp, paidAt: row.paid_at })),
  };
});
