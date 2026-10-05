alter table nexus_orders add column if not exists access_consumed_at timestamptz;
alter table nexus_orders add column if not exists access_session_hash text;

create unique index if not exists nexus_orders_access_session_idx
  on nexus_orders (access_session_hash)
  where access_session_hash is not null;
