# Morrow House private admin

This is a separate local application. It is not a customer-site route, is not included in the root `npm run build`, and does not bind to a network interface. Start it from the repository root with `npm run admin`, then open `http://127.0.0.1:4174`.

## Private local access

1. Copy `.env.example` to `.env` if you have not already.
2. Set `ADMIN_PASSWORD` to a unique passphrase with at least 16 characters. Do not commit `.env` or share the passphrase.
3. Run `npm run admin` in a terminal. The admin API listens only on `127.0.0.1:4243`; the Vite admin site listens only on `127.0.0.1:4174`.
4. Sign in with that passphrase. The server issues an eight-hour HttpOnly, SameSite session cookie. Login is rate-limited.

Access is intentionally limited to this computer. The admin UI and API must not be deployed to a public host or exposed through a tunnel/reverse proxy. Anyone with access to your unlocked computer and passphrase can use it. Use disk encryption and keep `.env` private.

The dashboard currently displays **preview data only**. Stock edits and order status changes stay in memory and reset when the server restarts. `admin/data.js` is sample data, not your real catalog or orders.

## Supabase setup

1. Create a Supabase project and keep its database password and API keys private.
2. In **Authentication → Users**, create one owner account using your email. Do not enable public sign-up for this admin.
3. In the Supabase SQL Editor, run the schema and policies below. Replace the owner UUID with the `id` shown for your Auth user.
4. Add the Supabase project URL and keys to `.env`, never to `admin/index.html`, source files, or a `VITE_` variable. The Supabase `service_role`/secret key bypasses RLS and must only be used by the server if it is needed for trusted jobs.
5. Install the server SDK with `npm install @supabase/supabase-js`. Integrate Supabase in `admin/server.js`: validate the signed-in owner’s Supabase access token, query `products`, `orders`, and `order_items`, and replace the preview handlers. Prefer a user-scoped Supabase client carrying the owner’s access token so RLS is enforced. Keep all price, inventory, payment, and order-status decisions on the server.
6. Add a signed Stripe webhook to the existing Express backend. On `checkout.session.completed`, verify the Stripe signature and upsert the session, customer, total, and line-item snapshots into Supabase. Do not mark orders paid from browser input. Stripe checkout is currently not persisted as a durable order, so live-order reporting requires this webhook.
7. Replace the local admin passphrase as the identity check with Supabase Auth for the owner account (or retain the local passphrase as an extra local lock). Add Supabase Auth session handling to the login form and send the access token to the local API; the backend must verify it and Supabase RLS must still restrict rows to the owner UUID.
8. Set initial stock levels in `products`, verify the dashboard with your owner account, and test a Stripe test-mode checkout/webhook before using real payments.

### Tables and owner-only row policies

Run this once in the Supabase SQL Editor, then replace `OWNER_AUTH_USER_UUID` with your Auth user's UUID before running the final insert.

```sql
create extension if not exists pgcrypto;

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.products (
  id text primary key,
  sku text not null unique,
  name text not null,
  category text not null,
  price_cents integer not null check (price_cents >= 0),
  stock integer not null default 0 check (stock >= 0),
  reorder_at integer not null default 5 check (reorder_at >= 0),
  image text,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  stripe_session_id text not null unique,
  customer_name text,
  customer_email text,
  status text not null default 'Paid'
    check (status in ('Paid', 'Processing', 'Fulfilled', 'Cancelled')),
  total_cents integer not null check (total_cents >= 0),
  currency text not null default 'usd',
  carrier text,
  tracking_number text,
  created_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text references public.products(id) on delete set null,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0)
);

alter table public.admin_users enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy "Owner can read own admin record"
  on public.admin_users for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Owner can manage products"
  on public.products for all to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())))
  with check (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

create policy "Owner can manage orders"
  on public.orders for all to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())))
  with check (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

create policy "Owner can manage order items"
  on public.order_items for all to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())))
  with check (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

insert into public.admin_users (user_id)
values ('OWNER_AUTH_USER_UUID');
```

The owner UUID allowlist is the critical boundary: a logged-in Supabase user who is not in `admin_users` cannot read or change these records. Do not add an `anon` policy, do not enable public sign-up for the admin, and do not expose the service-role key to the browser.

## Environment variables for the Supabase phase

Keep these values in the ignored root `.env` file. Use the project's API URL and current key names from Supabase's **Connect** dialog. `SUPABASE_ANON_KEY` is safe to send only to a browser when RLS is correctly enabled; the service-role key is never safe in browser code.

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-publishable-or-anon-key
SUPABASE_SERVICE_ROLE_KEY=server-only-secret-if-needed
```

## Scripts

- `npm run admin` runs the private admin UI and its local API.
- `npm run admin:build` builds the admin app separately into ignored `admin/dist`.
- `npm run build` builds only the public storefront; it does not package the admin app.