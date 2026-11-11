alter table public.cj_products
  add column if not exists original_data jsonb not null default '{}'::jsonb,
  add column if not exists supplier_data jsonb not null default '{}'::jsonb,
  add column if not exists editor_content jsonb not null default '{}'::jsonb,
  add column if not exists editor_status text not null default 'QUEUED',
  add column if not exists public_product_id text,
  add column if not exists published_at timestamptz,
  add column if not exists published_by text;

update public.cj_products
set public_product_id = coalesce(
  (
    select products.id::text
    from public.products
    where products.id::text = cj_products.cj_product_id
  ),
  gen_random_uuid()::text
)
where public_product_id is null or public_product_id = '';

create unique index if not exists idx_cj_products_public_product_id
  on public.cj_products (public_product_id);

alter table public.cj_products
  drop constraint if exists cj_products_editor_status_check;

alter table public.cj_products
  add constraint cj_products_editor_status_check
  check (editor_status in ('QUEUED', 'EDITING', 'READY_TO_PUBLISH', 'PUBLISHED', 'ARCHIVED', 'REJECTED'));

alter table public.products
  add column if not exists public_detail text not null default '',
  add column if not exists public_data jsonb not null default '{}'::jsonb;

create table if not exists public.product_editor_history (
  id uuid primary key default gen_random_uuid(),
  cj_product_id text not null references public.cj_products(cj_product_id) on delete cascade,
  action text not null,
  actor text not null,
  before_data jsonb not null default '{}'::jsonb,
  after_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_cj_products_editor_status
  on public.cj_products (editor_status, updated_at desc);

create index if not exists idx_product_editor_history_product
  on public.product_editor_history (cj_product_id, created_at desc);

update public.cj_products
set original_data = jsonb_build_object(
      'name', name,
      'description', description,
      'category', category,
      'sku', sku,
      'price', price,
      'images', images,
      'variants', variants,
      'inventory', inventory
    ),
    editor_status = case when is_active then 'PUBLISHED' else 'QUEUED' end,
    editor_content = jsonb_build_object(
      'title', coalesce(nullif(name, ''), 'Untitled product'),
      'shortDescription', '',
      'description', coalesce(description, ''),
      'category', coalesce(category, 'Home Décor'),
      'subcategory', '',
      'tags', '[]'::jsonb,
      'brand', '',
      'productType', '',
      'images', coalesce((
        select jsonb_agg(jsonb_build_object('url', image, 'alt', '', 'source', 'supplier') order by image_order)
        from jsonb_array_elements_text(images) with ordinality as image_rows(image, image_order)
        where image <> ''
      ), '[]'::jsonb),
      'primaryImage', coalesce(images ->> 0, ''),
      'pricing', jsonb_build_object(
        'supplierCost', price,
        'shippingCost', 0,
        'additionalCost', 0,
        'sellingPrice', coalesce((
          select price_cents::numeric / 100
          from public.products
          where products.id = cj_products.cj_product_id
        ), 0),
        'discountedPrice', null,
        'currency', 'USD'
      ),
      'specifications', '{}'::jsonb,
      'variants', variants,
      'shipping', jsonb_build_object('reviewed', false, 'notes', ''),
      'seo', jsonb_build_object('title', '', 'description', '', 'slug', '', 'keywords', '[]'::jsonb),
      'quality', jsonb_build_object(
        'imagesReviewed', false,
        'specificationsReviewed', false,
        'variantsReviewed', false,
        'inventoryReviewed', false,
        'shippingReviewed', false,
        'previewReviewed', false
      )
    )
where original_data = '{}'::jsonb
  and editor_content = '{}'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-editor-images', 'product-editor-images', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public product editor images are readable" on storage.objects;

create policy "Public product editor images are readable"
  on storage.objects for select
  using (bucket_id = 'product-editor-images');

insert into public.product_editor_history (cj_product_id, action, actor, after_data)
select cj_product_id, 'IMPORTED', 'system', jsonb_build_object(
  'original_data', original_data,
  'editor_status', editor_status
)
from public.cj_products
where not exists (
  select 1
  from public.product_editor_history
  where product_editor_history.cj_product_id = cj_products.cj_product_id
);
