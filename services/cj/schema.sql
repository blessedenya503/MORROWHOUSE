create extension if not exists pgcrypto;

create table if not exists public.cj_products (
  cj_product_id text primary key,
  name text not null,
  description text,
  category text not null default 'Uncategorized',
  sku text,
  price numeric(12,2) not null default 0,
  images jsonb not null default '[]'::jsonb,
  variants jsonb not null default '[]'::jsonb,
  inventory jsonb not null default '[]'::jsonb,
  is_active boolean not null default false,
  source text not null default 'cj' check (source = 'cj'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  status text not null check (status in ('success', 'failed', 'pending')),
  message text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_cj_products_updated_at
  on public.cj_products (updated_at desc);

create index if not exists idx_sync_logs_entity
  on public.sync_logs (entity_type, entity_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger cj_products_touch_updated_at
before update on public.cj_products
for each row
execute function public.touch_updated_at();

-- Service-role usage is the intended server-side flow for trusted import jobs.
-- RLS is intentionally left off for the provider sync tables so the backend
-- can write supplier updates without exposing CJ credentials to the browser.
