-- Page visits: one row per (day, visitor) with a visit counter (page loads that ran the beacon).
-- Day is in America/Santiago. No raw IPs: ip_hash is HMAC-SHA256 (truncated), same key as joins.
-- `internal` = IP matched NEXUS_INTERNAL_IP_PREFIXES (own/test traffic).
create table if not exists nexus_page_visits (
  day date not null,
  ip_hash text not null,
  internal boolean not null default false,
  visits integer not null default 1,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  primary key (day, ip_hash)
);

create index if not exists nexus_page_visits_day_idx on nexus_page_visits (day);
