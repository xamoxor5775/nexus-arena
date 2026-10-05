-- Weapon skin purchases (Flow). One row per checkout; `skins` = comma list granted when paid.
create table if not exists nexus_skin_orders (
  id text primary key,
  flow_token text unique,
  flow_order text,
  email text not null,
  product text not null,
  skins text not null,
  amount_clp integer not null,
  status text not null default 'pending',
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nexus_skin_orders_email_idx on nexus_skin_orders (lower(email));
create index if not exists nexus_skin_orders_status_idx on nexus_skin_orders (status);
