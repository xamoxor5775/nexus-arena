-- Arena joins: one row per (day, room, peer) the first time a peer enters a match room.
-- Day is in America/Santiago. No raw IPs: session_hash / ip_hash are HMAC-SHA256 (truncated).
-- `internal` = IP matched NEXUS_INTERNAL_IP_PREFIXES (own/test traffic); `dev` = fixed tester room.
create table if not exists nexus_arena_joins (
  day date not null,
  room text not null,
  peer text not null,
  session_hash text not null,
  ip_hash text not null,
  internal boolean not null default false,
  dev boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (day, room, peer)
);

create index if not exists nexus_arena_joins_day_idx on nexus_arena_joins (day);
