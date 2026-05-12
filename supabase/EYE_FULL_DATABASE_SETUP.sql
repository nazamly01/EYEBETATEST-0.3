-- ============================================================
-- EYE™ — FULL DATABASE SETUP (MASTER SCHEMA)
-- Run this in: Supabase → SQL Editor
-- This file creates all tables, policies, and buckets for the entire website.
-- ============================================================

-- ============================================================
-- 1. PROFILES & ROLES
-- ============================================================
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  phone text,
  address text,
  role text default 'user' check (role in ('user', 'admin')),
  created_at timestamptz default now()
);

alter table profiles enable row level security;

create policy "profiles_owner_read" on profiles for select using (auth.uid() = id);
create policy "profiles_owner_update" on profiles for update using (auth.uid() = id);
create policy "profiles_admin_all" on profiles for all using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- ============================================================
-- 2. CATEGORIES
-- ============================================================
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image text,
  description text,
  sort_order integer default 0,
  created_at timestamptz default now()
);

alter table categories enable row level security;

create policy "categories_public_read" on categories for select using (true);
create policy "categories_admin_all" on categories for all using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- ============================================================
-- 3. PRODUCTS & PRODUCT IMAGES
-- ============================================================
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references categories(id) on delete set null,
  name text not null,
  slug text unique,
  description text,
  price decimal not null,
  compare_price decimal,
  image text, -- primary image
  images text[], -- array of image urls (legacy or helper)
  sizes text[],
  size_stocks jsonb default '{}'::jsonb,
  size_specs jsonb default '{}'::jsonb,
  stock integer default 0,
  badge text,
  is_featured boolean default false,
  created_at timestamptz default now()
);

create table if not exists product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  url text not null,
  sort_order integer default 0,
  created_at timestamptz default now()
);

alter table products enable row level security;
alter table product_images enable row level security;

create policy "products_public_read" on products for select using (true);
create policy "products_admin_all" on products for all using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "product_images_public_read" on product_images for select using (true);
create policy "product_images_admin_all" on product_images for all using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- ============================================================
-- 4. ORDERS & ORDER ITEMS
-- ============================================================
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  customer_name text,
  customer_email text,
  customer_phone text,
  shipping_address text,
  governorate_id text,
  area_id text,
  total_amount decimal not null,
  shipping_fee decimal default 0,
  status text default 'Pending' check (status in ('Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled')),
  payment_proof_url text,
  created_at timestamptz default now()
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name text,
  price decimal not null,
  quantity integer not null,
  size text,
  created_at timestamptz default now()
);

alter table orders enable row level security;
alter table order_items enable row level security;

create policy "orders_owner_read" on orders for select using (auth.uid() = user_id);
create policy "order_items_owner_read" on order_items for select using (exists (select 1 from orders where id = order_id and user_id = auth.uid()));
create policy "orders_admin_all" on orders for all using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "order_items_admin_all" on order_items for all using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- ============================================================
-- 5. COUPONS & EXPENSES
-- ============================================================
create table if not exists coupons (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  discount_percent integer check (discount_percent between 0 and 100),
  discount_amount decimal,
  is_active boolean default true,
  expires_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  amount decimal not null,
  category text,
  expense_date date default current_date,
  created_at timestamptz default now()
);

alter table coupons enable row level security;
alter table expenses enable row level security;

create policy "coupons_read_auth" on coupons for select using (auth.uid() is not null);
create policy "coupons_admin_all" on coupons for all using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "expenses_admin_all" on expenses for all using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- ============================================================
-- 6. WISHLIST & NEWSLETTER
-- ============================================================
create table if not exists wishlist_items (
  user_id uuid references profiles(id) on delete cascade,
  product_id uuid references products(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, product_id)
);

create table if not exists newsletter_subscribers (
  email text primary key,
  created_at timestamptz default now()
);

alter table wishlist_items enable row level security;
alter table newsletter_subscribers enable row level security;

create policy "wishlist_owner_all" on wishlist_items for all using (auth.uid() = user_id);
create policy "newsletter_public_insert" on newsletter_subscribers for insert with check (true);
create policy "newsletter_admin_read" on newsletter_subscribers for select using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- ============================================================
-- 7. FEEDBACKS & CONTACT
-- ============================================================
create table if not exists feedbacks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  author_name text not null default 'Anonymous',
  rating smallint not null default 5 check (rating between 1 and 5),
  comment text not null default '',
  image_url text,
  is_approved boolean not null default false,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text,
  message text,
  created_at timestamptz not null default now()
);

alter table feedbacks enable row level security;
alter table contact_messages enable row level security;

create policy "feedbacks_public_read" on feedbacks for select using (is_approved = true and is_hidden = false);
create policy "feedbacks_insert_ordered" on feedbacks for insert with check (auth.uid() is not null and exists (select 1 from orders where user_id = auth.uid()));
create policy "feedbacks_admin_all" on feedbacks for all using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "contact_insert_public" on contact_messages for insert with check (true);
create policy "contact_admin_read" on contact_messages for select using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- ============================================================
-- 8. ACTIVITY LOGS
-- ============================================================
create table if not exists activity_logs (
  id bigserial primary key,
  actor_id uuid references profiles(id) on delete set null,
  actor_name text,
  action text not null,
  entity text,
  entity_id text,
  detail text,
  created_at timestamptz not null default now()
);

alter table activity_logs enable row level security;
create policy "logs_admin_read" on activity_logs for select using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "logs_insert_auth" on activity_logs for insert with check (auth.uid() is not null);

-- ============================================================
-- 9. CMS: SETTINGS, ANNOUNCEMENTS, NAVIGATION
-- ============================================================
create table if not exists site_settings (
  key text primary key,
  value jsonb,
  updated_at timestamptz default now()
);

create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  link_url text,
  sort_order integer default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists navigation_links (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  href text not null,
  zone text default 'primary_nav',
  sort_order integer default 0,
  created_at timestamptz default now()
);

alter table site_settings enable row level security;
alter table announcements enable row level security;
alter table navigation_links enable row level security;

create policy "cms_public_read" on site_settings for select using (true);
create policy "cms_public_read" on announcements for select using (true);
create policy "cms_public_read" on navigation_links for select using (true);
create policy "cms_admin_all" on site_settings for all using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "cms_admin_all" on announcements for all using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy "cms_admin_all" on navigation_links for all using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- ============================================================
-- 10. AUTOMATIC LOGGING TRIGGERS
-- ============================================================
create or replace function public.fn_log_activity()
returns trigger language plpgsql as $$
begin
  insert into public.activity_logs (actor_id, action, entity, entity_id, detail)
  values (auth.uid(), TG_OP || '_' || upper(TG_TABLE_NAME), TG_TABLE_NAME, 
          case when TG_OP = 'DELETE' then OLD.id::text else NEW.id::text end,
          case when TG_OP = 'DELETE' then 'Deleted' when TG_OP = 'INSERT' then 'Created' else 'Modified' end || ' ' || TG_TABLE_NAME);
  return case when TG_OP = 'DELETE' then OLD else NEW end;
end;
$$;

create trigger tr_log_orders after insert or update or delete on orders for each row execute function public.fn_log_activity();
create trigger tr_log_products after insert or update or delete on products for each row execute function public.fn_log_activity();
create trigger tr_log_feedbacks after insert or update or delete on feedbacks for each row execute function public.fn_log_activity();
create trigger tr_log_coupons after insert or update or delete on coupons for each row execute function public.fn_log_activity();

-- ============================================================
-- 11. STORAGE BUCKETS (REQUIRES SUPERUSER OR DASHBOARD)
-- ============================================================
-- Buckets referenced in JS: 'product-images', 'payment-proofs', 'feedback-images'

-- Create bucket for order proofs if not exists
insert into storage.buckets (id, name, public) 
values ('order-proofs', 'order-proofs', true)
on conflict (id) do nothing;

-- Allow public uploads to order-proofs (since unauthenticated guests can order)
create policy "Allow public uploads to order-proofs" 
on storage.objects for insert 
with check (bucket_id = 'order-proofs');

-- Allow public viewing of order-proofs
create policy "Allow public read access to order-proofs" 
on storage.objects for select 
using (bucket_id = 'order-proofs');

-- Allow admin deletion/update of order-proofs
create policy "Allow admin full access to order-proofs" 
on storage.objects for all 
using (bucket_id = 'order-proofs' and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
