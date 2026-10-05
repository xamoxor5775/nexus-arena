alter table nexus_orders add column if not exists flow_customer_id text;
alter table nexus_orders add column if not exists flow_registration_token text;
alter table nexus_orders add column if not exists flow_subscription_id text;
alter table nexus_orders add column if not exists flow_plan_id text;
alter table nexus_orders add column if not exists subscription_status text not null default 'pending';
alter table nexus_orders add column if not exists active_until timestamptz;
alter table nexus_orders add column if not exists last_invoice_id text;

create unique index if not exists nexus_orders_flow_customer_idx on nexus_orders (flow_customer_id) where flow_customer_id is not null;
create unique index if not exists nexus_orders_flow_subscription_idx on nexus_orders (flow_subscription_id) where flow_subscription_id is not null;
create index if not exists nexus_orders_active_until_idx on nexus_orders (active_until);
