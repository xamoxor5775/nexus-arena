create table if not exists nexus_orders (
  id text primary key,
  flow_token text unique,
  flow_order text,
  email text not null,
  amount_clp integer not null,
  status text not null default 'pending',
  access_token text unique,
  access_token_hash text unique,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nexus_orders_flow_token_idx on nexus_orders (flow_token);
create index if not exists nexus_orders_status_idx on nexus_orders (status);
