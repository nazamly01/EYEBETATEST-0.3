-- ============================================================
-- EYE™ — NEW FEATURES SQL
-- Run this in: Supabase → SQL Editor
-- ============================================================

-- ============================================================
-- 1. PAYMENT PROOF — add column to existing orders table
-- ============================================================
alter table orders add column if not exists payment_proof_url text;

-- ============================================================
-- 2. FEEDBACKS TABLE
-- ============================================================
create table if not exists feedbacks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references profiles(id) on delete set null,
  author_name  text not null default 'Anonymous',
  rating       smallint not null default 5 check (rating between 1 and 5),
  comment      text not null default '',
  image_url    text,
  is_approved  boolean not null default false,
  is_hidden    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- RLS for feedbacks
alter table feedbacks enable row level security;

-- Trigger to update updated_at on row modification
create or replace function public.set_feedback_updated_at()
returns trigger language plpgsql as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$;

create trigger feedback_updated_at
before update on public.feedbacks
for each row execute function public.set_feedback_updated_at();

-- Public read: only approved + not hidden
drop policy if exists "feedbacks_public_read" on feedbacks;
create policy "feedbacks_public_read" on feedbacks
  for select using (is_approved = true and is_hidden = false);

-- Authenticated users with a completed order can insert
drop policy if exists "feedbacks_insert_if_ordered" on feedbacks;
create policy "feedbacks_insert_if_ordered" on feedbacks
  for insert with check (
    auth.uid() is not null and
    exists (
      select 1 from orders
      where user_id = auth.uid()
        and status in ('Delivered', 'Shipped', 'Processing', 'Pending')
    )
  );

-- Admin can read ALL feedbacks (including hidden/unapproved)
drop policy if exists "feedbacks_admin_select" on feedbacks;
create policy "feedbacks_admin_select" on feedbacks
  for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Admin can update any feedback
drop policy if exists "feedbacks_admin_update" on feedbacks;
create policy "feedbacks_admin_update" on feedbacks
  for update using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Admin can delete any feedback
drop policy if exists "feedbacks_admin_delete" on feedbacks;
create policy "feedbacks_admin_delete" on feedbacks
  for delete using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Admin can insert feedback manually
drop policy if exists "feedbacks_admin_insert" on feedbacks;
create policy "feedbacks_admin_insert" on feedbacks
  for insert with check (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- ============================================================
-- 3. ACTIVITY LOGS TABLE
-- ============================================================
create table if not exists activity_logs (
  id          bigserial primary key,
  actor_id    uuid references profiles(id) on delete set null,
  actor_name  text,
  action      text not null,
  entity      text,
  entity_id   text,
  detail      text,
  created_at  timestamptz not null default now()
);

-- RLS for activity_logs
alter table activity_logs enable row level security;

-- Only admin can read logs
drop policy if exists "logs_admin_read" on activity_logs;
create policy "logs_admin_read" on activity_logs
  for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Authenticated users can insert logs (system writes them)
drop policy if exists "logs_insert_authenticated" on activity_logs;
create policy "logs_insert_authenticated" on activity_logs
  for insert with check (auth.uid() is not null);

-- ============================================================
-- 3.1 AUTOMATIC LOGGING TRIGGERS
-- ============================================================

-- Function to handle automatic logging
create or replace function public.fn_log_activity()
returns trigger language plpgsql as $$
declare
  v_actor_id uuid;
  v_entity_id text;
  v_detail text;
begin
  v_actor_id := auth.uid();
  
  if (TG_OP = 'DELETE') then
    v_entity_id := OLD.id::text;
    v_detail := 'Deleted ' || TG_TABLE_NAME || ': ' || v_entity_id;
  else
    v_entity_id := NEW.id::text;
    if (TG_OP = 'INSERT') then
      v_detail := 'Created ' || TG_TABLE_NAME;
    else
      v_detail := 'Modified ' || TG_TABLE_NAME;
    end if;
  end if;

  insert into public.activity_logs (actor_id, action, entity, entity_id, detail)
  values (v_actor_id, TG_OP || '_' || upper(TG_TABLE_NAME), TG_TABLE_NAME, v_entity_id, v_detail);
  
  if (TG_OP = 'DELETE') then return OLD; end if;
  return NEW;
end;
$$;

-- Apply triggers to key tables
drop trigger if exists tr_log_orders on orders;
create trigger tr_log_orders after insert or update or delete on orders
for each row execute function public.fn_log_activity();

drop trigger if exists tr_log_products on products;
create trigger tr_log_products after insert or update or delete on products
for each row execute function public.fn_log_activity();

drop trigger if exists tr_log_feedbacks on feedbacks;
create trigger tr_log_feedbacks after insert or update or delete on feedbacks
for each row execute function public.fn_log_activity();

drop trigger if exists tr_log_coupons on coupons;
create trigger tr_log_coupons after insert or update or delete on coupons
for each row execute function public.fn_log_activity();

-- ============================================================
-- 4. STORAGE BUCKETS
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('order-proofs',    'order-proofs',    false, 5242880,
   array['image/jpeg','image/png','image/webp','image/gif']),
  ('feedback-images', 'feedback-images', true,  3145728,
   array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Storage RLS: order-proofs (private — only uploader or admin)
drop policy if exists "order_proofs_upload" on storage.objects;
create policy "order_proofs_upload" on storage.objects
  for insert with check (bucket_id = 'order-proofs' and auth.uid() is not null);

drop policy if exists "order_proofs_read" on storage.objects;
create policy "order_proofs_read" on storage.objects
  for select using (
    bucket_id = 'order-proofs' and (
      exists (select 1 from profiles where id = auth.uid() and role = 'admin')
    )
  );

-- Storage RLS: feedback-images (public bucket, authenticated upload)
drop policy if exists "feedback_images_upload" on storage.objects;
create policy "feedback_images_upload" on storage.objects
  for insert with check (bucket_id = 'feedback-images' and auth.uid() is not null);

drop policy if exists "feedback_images_public_read" on storage.objects;
create policy "feedback_images_public_read" on storage.objects
  for select using (bucket_id = 'feedback-images');

-- ============================================================
-- 5. CONTACT MESSAGES TABLE
-- ============================================================
create table if not exists contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  email       text,
  message     text,
  created_at  timestamptz not null default now()
);

-- RLS for contact_messages
alter table contact_messages enable row level security;

-- Anyone can insert (public contact form)
drop policy if exists "contact_messages_insert_public" on contact_messages;
create policy "contact_messages_insert_public" on contact_messages
  for insert with check (true);

-- Only admin can read messages
drop policy if exists "contact_messages_admin_read" on contact_messages;
create policy "contact_messages_admin_read" on contact_messages
  for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- ============================================================
-- Done! Run this SQL then reload your admin panel.
-- ============================================================
