-- Hibbullah — full hosted schema (generated from supabase/migrations/*.sql)
-- Run ONCE in: Supabase Dashboard → SQL Editor → New query → paste → Run
-- Safe to re-run: tables/functions use IF NOT EXISTS / OR REPLACE patterns.


-- ===================================================================
-- FILE: supabase/migrations/20260918010000_initial_schema.sql
-- ===================================================================
-- Hibbullah — Initial Database Schema
-- This migration creates all tables required by the current application.
-- Run with: npx supabase db push (local only, not remote)

-- ═══════════════════════════════════════════════════════════════════════
-- 0. EXTENSIONS
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. PROFILES — extends Supabase Auth's auth.users
-- ═══════════════════════════════════════════════════════════════════════

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text,
  phone text not null,
  role text not null default 'customer' check (role in ('customer', 'admin')),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ensure email format if present
alter table public.profiles
  add constraint profiles_email_format check (email is null or email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$');

-- Ensure Kenyan phone format (+254...)
alter table public.profiles
  add constraint profiles_phone_format check (phone = '' or phone ~* '^\+?254[17][0-9]{8}$');

-- Unique phone constraint
create unique index idx_profiles_phone on public.profiles (phone);

-- RLS: Users can only access their own profile; admins can read all
alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id or auth.jwt() ->> 'role' = 'admin');

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Admins can view all profiles"
  on public.profiles for select
  using (auth.jwt() ->> 'role' = 'admin');

-- ═══════════════════════════════════════════════════════════════════════
-- 2. CATEGORIES — navigable product categories
-- ═══════════════════════════════════════════════════════════════════════

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  icon text,
  created_at timestamptz not null default now()
);

-- RLS: Public read; admin write
alter table public.categories enable row level security;

create policy "Anyone can view active categories"
  on public.categories for select
  using (true);

create policy "Admins can manage categories"
  on public.categories for all
  using (auth.jwt() ->> 'role' = 'admin');

-- ═══════════════════════════════════════════════════════════════════════
-- 3. MANUFACTURERS — pharmaceutical companies
-- ═══════════════════════════════════════════════════════════════════════

create table public.manufacturers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text,
  website text,
  created_at timestamptz not null default now()
);

-- RLS: Public read; admin write
alter table public.manufacturers enable row level security;

create policy "Anyone can view manufacturers"
  on public.manufacturers for select
  using (true);

create policy "Admins can manage manufacturers"
  on public.manufacturers for all
  using (auth.jwt() ->> 'role' = 'admin');

-- ═══════════════════════════════════════════════════════════════════════
-- 4. PRODUCTS — product catalog
-- ═══════════════════════════════════════════════════════════════════════

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text not null,
  generic_name text not null,
  manufacturer_id uuid not null references public.manufacturers(id) on delete restrict,
  category_id uuid not null references public.categories(id) on delete restrict,
  description text not null default '',
  price numeric(12,2) not null check (price >= 0),
  original_price numeric(12,2) check (original_price >= 0),
  discount_percent integer not null default 0 check (discount_percent >= 0 and discount_percent <= 99),
  stock integer not null default 0 check (stock >= 0),
  unit text not null default 'pack',
  image_url text,
  secondary_image_url text,
  is_active boolean not null default true,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Discount cannot exceed original price
  constraint valid_discount check (
    (original_price is null and discount_percent = 0) or
    (original_price is not null and discount_percent >= 0)
  )
);

-- Ensure discount_percent is 0 when there is no original price
create or replace function public.check_discount()
returns trigger as $$
begin
  if new.original_price is null then
    new.discount_percent := 0;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_products_check_discount
  before insert or update on public.products
  for each row execute function public.check_discount();

-- Indexes for common query patterns
create index idx_products_category on public.products (category_id);
create index idx_products_manufacturer on public.products (manufacturer_id);
create index idx_products_active on public.products (is_active);
create index idx_products_featured on public.products (is_featured);
create index idx_products_name on public.products using gin (name gin_trgm_ops);
create index idx_products_brand on public.products using gin (brand gin_trgm_ops);
create index idx_products_generic on public.products using gin (generic_name gin_trgm_ops);
create index idx_products_description on public.products using gin (description gin_trgm_ops);

-- RLS: Public read active products; admin full write
alter table public.products enable row level security;

create policy "Anyone can view active products"
  on public.products for select
  using (is_active = true);

create policy "Admins can manage products"
  on public.products for all
  using (auth.jwt() ->> 'role' = 'admin');

-- ═══════════════════════════════════════════════════════════════════════
-- 5. CART_ITEMS — customer shopping cart (one row per user+product)
-- ═══════════════════════════════════════════════════════════════════════

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null check (quantity >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint unique_user_product unique (user_id, product_id)
);

-- Indexes
create index idx_cart_items_user on public.cart_items (user_id);
create index idx_cart_items_product on public.cart_items (product_id);

-- RLS: Customer can only access their own cart
alter table public.cart_items enable row level security;

create policy "Customers can view own cart"
  on public.cart_items for select
  using (auth.uid() = user_id);

create policy "Customers can insert own cart items"
  on public.cart_items for insert
  with check (auth.uid() = user_id);

create policy "Customers can update own cart items"
  on public.cart_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Customers can delete own cart items"
  on public.cart_items for delete
  using (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 6. ADDRESSES — customer delivery addresses
-- ═══════════════════════════════════════════════════════════════════════

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,
  street text not null,
  city text not null,
  county text,
  postal_code text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index
create index idx_addresses_user on public.addresses (user_id);

-- Ensure only one default address per user
create unique index idx_addresses_default_per_user
  on public.addresses (user_id)
  where is_default = true;

-- RLS: Customer can only access their own addresses
alter table public.addresses enable row level security;

create policy "Customers can view own addresses"
  on public.addresses for select
  using (auth.uid() = user_id);

create policy "Customers can manage own addresses"
  on public.addresses for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 7. INVENTORY_ITEMS — batch-level stock tracking
-- ═══════════════════════════════════════════════════════════════════════

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  batch_number text not null,
  quantity integer not null check (quantity >= 0),
  expiry_date date,
  status text not null default 'healthy' check (status in ('healthy', 'low', 'out_of_stock')),
  last_updated timestamptz not null default now(),

  constraint unique_product_batch unique (product_id, batch_number)
);

-- Indexes for expiry queries and stock lookups
create index idx_inventory_product on public.inventory_items (product_id);
create index idx_inventory_expiry on public.inventory_items (expiry_date);
create index idx_inventory_status on public.inventory_items (status);
create index idx_inventory_low_stock on public.inventory_items (status, product_id) where status = 'low';
create index idx_inventory_expiring on public.inventory_items (expiry_date) where expiry_date is not null;

-- Trigger: auto-calculate status based on quantity and low_stock_threshold
create or replace function public.update_inventory_status()
returns trigger as $$
declare
  v_threshold integer := 10; -- Matches config.lowStockThreshold
begin
  if new.quantity <= 0 then
    new.status := 'out_of_stock';
  elsif new.quantity < v_threshold then
    new.status := 'low';
  else
    new.status := 'healthy';
  end if;
  new.last_updated := now();
  return new;
end;
$$ language plpgsql;

create trigger trg_inventory_update_status
  before insert or update on public.inventory_items
  for each row execute function public.update_inventory_status();

-- RLS: Admin only
alter table public.inventory_items enable row level security;

create policy "Admins can view all inventory"
  on public.inventory_items for select
  using (auth.jwt() ->> 'role' = 'admin');

create policy "Admins can manage inventory"
  on public.inventory_items for all
  using (auth.jwt() ->> 'role' = 'admin');

-- ═══════════════════════════════════════════════════════════════════════
-- 8. STOCK_ADJUSTMENTS — inventory change audit trail
-- ═══════════════════════════════════════════════════════════════════════

create table public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  batch_number text not null,
  type text not null check (type in ('increase', 'decrease')),
  quantity integer not null check (quantity > 0),
  reason text not null,
  timestamp timestamptz not null default now(),
  admin_id uuid not null references public.profiles(id) on delete restrict
);

-- Indexes
create index idx_stock_adjustments_product on public.stock_adjustments (product_id);
create index idx_stock_adjustments_admin on public.stock_adjustments (admin_id);
create index idx_stock_adjustments_timestamp on public.stock_adjustments (timestamp);

-- Trigger: update inventory quantity when stock adjustment is inserted
create or replace function public.apply_stock_adjustment()
returns trigger as $$
declare
  v_inventory public.inventory_items%rowtype;
begin
  -- Find the inventory item for this product and batch
  select * into v_inventory
    from public.inventory_items
    where product_id = new.product_id and batch_number = new.batch_number
    for update;

  if found then
    if new.type = 'increase' then
      v_inventory.quantity := v_inventory.quantity + new.quantity;
    else
      -- Ensure we don't go below zero
      v_inventory.quantity := greatest(v_inventory.quantity - new.quantity, 0);
    end if;
    update public.inventory_items
      set quantity = v_inventory.quantity,
          last_updated = now()
      where id = v_inventory.id;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_stock_adjustments_apply
  after insert on public.stock_adjustments
  for each row execute function public.apply_stock_adjustment();

-- RLS: Admin only
alter table public.stock_adjustments enable row level security;

create policy "Admins can view stock adjustments"
  on public.stock_adjustments for select
  using (auth.jwt() ->> 'role' = 'admin');

create policy "Admins can create stock adjustments"
  on public.stock_adjustments for insert
  with check (auth.jwt() ->> 'role' = 'admin');

-- ═══════════════════════════════════════════════════════════════════════
-- 9. ORDERS — customer purchase transactions
-- ═══════════════════════════════════════════════════════════════════════

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  customer_name text not null,
  created_at timestamptz not null default now(),
  status text not null default 'PENDING' check (status in (
    'PENDING', 'CONFIRMED', 'PROCESSING',
    'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED'
  )),
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  delivery_fee numeric(12,2) not null default 150 check (delivery_fee >= 0),
  total numeric(12,2) not null default 0 check (total >= 0),
  payment_method text not null default 'CASH_ON_DELIVERY'
    check (payment_method = 'CASH_ON_DELIVERY'),
  address text not null,
  timeline jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- Indexes for common query patterns
create index idx_orders_customer on public.orders (customer_id);
create index idx_orders_status on public.orders (status);
create index idx_orders_created on public.orders (created_at desc);
create index idx_orders_order_number on public.orders (order_number);

-- RLS: Customer can access own orders; admins can read all
alter table public.orders enable row level security;

create policy "Customers can view own orders"
  on public.orders for select
  using (auth.uid() = customer_id);

create policy "Customers can create orders"
  on public.orders for insert
  with check (auth.uid() = customer_id);

create policy "Admins can view all orders"
  on public.orders for select
  using (auth.jwt() ->> 'role' = 'admin');

create policy "Admins can update order status"
  on public.orders for update
  using (auth.jwt() ->> 'role' = 'admin');

-- Function to generate order_number (ORD-XXXX)
create or replace function public.generate_order_number()
returns text as $$
declare
  v_count integer;
  v_number text;
begin
  select count(*) + 1 into v_count from public.orders;
  v_number := 'ORD-' || lpad(v_count::text, 4, '0');
  return v_number;
end;
$$ language plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
-- 10. ORDER_ITEMS — immutable snapshots of products in an order
-- ═══════════════════════════════════════════════════════════════════════

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text not null,
  quantity integer not null check (quantity >= 1),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  discount_percent integer not null default 0 check (discount_percent >= 0 and discount_percent <= 99),
  total numeric(12,2) not null check (total >= 0),
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_order_items_order on public.order_items (order_id);
create index idx_order_items_product on public.order_items (product_id);

-- RLS: Via parent order access — customer sees own orders, admins see all
alter table public.order_items enable row level security;

create policy "Customers can view own order items"
  on public.order_items for select
  using (auth.uid() in (select customer_id from public.orders where id = order_id));

create policy "Admins can view all order items"
  on public.order_items for select
  using (auth.jwt() ->> 'role' = 'admin');

-- ═══════════════════════════════════════════════════════════════════════
-- 11. RETURN_REQUESTS — customer return requests for delivered orders
-- ═══════════════════════════════════════════════════════════════════════

create table public.return_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  customer_name text not null,
  product_name text not null,
  quantity integer not null check (quantity >= 1),
  reason text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'PROCESSED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index idx_return_requests_order on public.return_requests (order_id);
create index idx_return_requests_customer on public.return_requests (customer_id);
create index idx_return_requests_status on public.return_requests (status);

-- RLS: Customer can access own returns; admins can view all
alter table public.return_requests enable row level security;

create policy "Customers can view own returns"
  on public.return_requests for select
  using (auth.uid() = customer_id);

create policy "Customers can create returns"
  on public.return_requests for insert
  with check (auth.uid() = customer_id);

create policy "Admins can view all returns"
  on public.return_requests for select
  using (auth.jwt() ->> 'role' = 'admin');

create policy "Admins can update return status"
  on public.return_requests for update
  using (auth.jwt() ->> 'role' = 'admin');

-- ═══════════════════════════════════════════════════════════════════════
-- 12. DELIVERY_CYCLES — 24-hour order grouping windows
-- ═══════════════════════════════════════════════════════════════════════

create table public.delivery_cycles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'PENDING' check (status in (
    'PENDING', 'APPROVED', 'CONFIRMED', 'DELIVERED', 'CANCELLED'
  )),
  started_at timestamptz not null default now(),
  closes_at timestamptz not null,
  estimated_total numeric(12,2) not null default 0 check (estimated_total >= 0),
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_delivery_cycles_customer on public.delivery_cycles (customer_id);
create index idx_delivery_cycles_status on public.delivery_cycles (status);

-- RLS: Customer can access own cycles; admins can view all
alter table public.delivery_cycles enable row level security;

create policy "Customers can view own delivery cycles"
  on public.delivery_cycles for select
  using (auth.uid() = customer_id);

create policy "Customers can create delivery cycles"
  on public.delivery_cycles for insert
  with check (auth.uid() = customer_id);

create policy "Admins can view all delivery cycles"
  on public.delivery_cycles for select
  using (auth.jwt() ->> 'role' = 'admin');

-- ═══════════════════════════════════════════════════════════════════════
-- 13. NOTIFICATIONS — in-app notifications for users
-- ═══════════════════════════════════════════════════════════════════════

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  type text not null default 'info' check (type in ('info', 'success', 'warning', 'alert')),
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_notifications_user on public.notifications (user_id);
create index idx_notifications_unread on public.notifications (user_id, read);

-- RLS: Users can access own notifications
alter table public.notifications enable row level security;

create policy "Customers can view own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "Customers can manage own notifications"
  on public.notifications for all
  using (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 14. AUDIT_ENTRIES — immutable system activity log
-- ═══════════════════════════════════════════════════════════════════════

create table public.audit_entries (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null,
  record_type text not null,
  record_id uuid,
  old_value jsonb,
  new_value jsonb,
  timestamp timestamptz not null default now()
);

-- Indexes
create index idx_audit_entries_actor on public.audit_entries (actor_id);
create index idx_audit_entries_timestamp on public.audit_entries (timestamp desc);
create index idx_audit_entries_record on public.audit_entries (record_type, record_id);

-- RLS: Admin only read access
alter table public.audit_entries enable row level security;

create policy "Admins can view audit entries"
  on public.audit_entries for select
  using (auth.jwt() ->> 'role' = 'admin');

-- ═══════════════════════════════════════════════════════════════════════
-- 15. TRIGGERS AND HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════

-- Auto-update updated_at timestamp on relevant tables
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();

create trigger trg_orders_updated_at
  before update on public.orders
  for each row execute function public.update_updated_at();

create trigger trg_cart_items_updated_at
  before update on public.cart_items
  for each row execute function public.update_updated_at();

create trigger trg_addresses_updated_at
  before update on public.addresses
  for each row execute function public.update_updated_at();

create trigger trg_return_requests_updated_at
  before update on public.return_requests
  for each row execute function public.update_updated_at();

-- Auto-generate order_number on insert
create or replace function public.before_insert_order()
returns trigger as $$
begin
  if new.order_number is null then
    new.order_number := public.generate_order_number();
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_orders_generate_number
  before insert on public.orders
  for each row execute function public.before_insert_order();

-- Auto-create profile in public.profiles when a new user signs up via Supabase Auth
-- This function is called by a database function or can be set up via Supabase Auth webhook
create or replace function public.handle_new_user()
returns trigger
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'New User'),
    new.email,
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'role', 'customer')
  );
  return new;
end;
$$ language plpgsql;

create trigger trg_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Auto-sync products.stock with inventory_items.quantity
create or replace function public.sync_product_stock()
returns trigger
security invoker
set search_path = public
as $$
begin
  update public.products
  set stock = (
    select coalesce(sum(quantity), 0)
    from public.inventory_items
    where product_id = NEW.product_id
  )
  where id = NEW.product_id;
  return NEW;
end;
$$ language plpgsql;

create trigger trg_inventory_sync_stock
  after insert or update or delete on public.inventory_items
  for each row execute function public.sync_product_stock();

-- ═══════════════════════════════════════════════════════════════════════
-- 15B. BUSINESS LOGIC FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════

-- Prevent duplicate cart items (merge quantities on insert)
create or replace function public.handle_cart_insert()
returns trigger
security invoker
set search_path = public
as $$
begin
  if exists (
    select 1 from public.cart_items
    where user_id = NEW.user_id and product_id = NEW.product_id
    and id != NEW.id
  ) then
    update public.cart_items
    set quantity = quantity + NEW.quantity,
        updated_at = now()
    where user_id = NEW.user_id and product_id = NEW.product_id;
    return null;
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger trg_cart_merge_duplicate
  before insert on public.cart_items
  for each row execute function public.handle_cart_insert();

create or replace function public.create_order(p_customer_id uuid, p_address_id uuid)
returns uuid
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_delivery_fee numeric := 150;
  v_total numeric := 0;
  v_customer_name text;
  v_cart_item record;
  v_product record;
begin
  select name into v_customer_name from public.profiles where id = p_customer_id;
  if not found then
    raise exception 'Customer not found';
  end if;
  if not exists (select 1 from public.cart_items where user_id = p_customer_id) then
    raise exception 'Cart is empty';
  end if;
  for v_cart_item in select * from public.cart_items where user_id = p_customer_id loop
    select * into v_product from public.products where id = v_cart_item.product_id and is_active = true;
    if not found then
      raise exception 'Product not available';
    end if;
    if v_product.stock < v_cart_item.quantity then
      raise exception 'Insufficient stock for product %', v_product.name;
    end if;
    v_subtotal := v_subtotal + (v_product.price * v_cart_item.quantity);
  end loop;
  v_total := v_subtotal - v_discount + v_delivery_fee;
  insert into public.orders (order_number, customer_id, customer_name, status, subtotal, discount, delivery_fee, total, payment_method, address)
  values (null, p_customer_id, v_customer_name, 'PENDING', v_subtotal, v_discount, v_delivery_fee, v_total, 'CASH_ON_DELIVERY',
    (select street || ', ' || city || coalesce(', ' || county, '') || coalesce(', ' || postal_code, '') from public.addresses where id = p_address_id))
  returning id into v_order_id;
  for v_cart_item in select * from public.cart_items where user_id = p_customer_id loop
    select * into v_product from public.products where id = v_cart_item.product_id;
    insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, discount_percent, total)
    values (v_order_id, v_cart_item.product_id, v_product.name, v_cart_item.quantity, v_product.price, 0, v_product.price * v_cart_item.quantity);
    update public.products set stock = stock - v_cart_item.quantity where id = v_cart_item.product_id;
  end loop;
  delete from public.cart_items where user_id = p_customer_id;
  return v_order_id;
end;
$$ language plpgsql;

create or replace function public.transition_order_status(p_order_id uuid, p_new_status text, p_admin_id uuid)
returns boolean
security definer
set search_path = public
as $$
declare
  v_current_status text;
  v_allowed boolean := false;
begin
  if not exists (select 1 from public.profiles where id = p_admin_id and role = 'admin') then
    raise exception 'Only admins can change order status';
  end if;
  select status into v_current_status from public.orders where id = p_order_id;
  if not found then
    raise exception 'Order not found';
  end if;
  v_allowed := (
    (v_current_status = 'PENDING' and p_new_status in ('CONFIRMED', 'CANCELLED')) or
    (v_current_status = 'CONFIRMED' and p_new_status in ('PROCESSING', 'CANCELLED')) or
    (v_current_status = 'PROCESSING' and p_new_status in ('OUT_FOR_DELIVERY', 'CANCELLED')) or
    (v_current_status = 'OUT_FOR_DELIVERY' and p_new_status in ('DELIVERED')) or
    (v_current_status = 'DELIVERED' and p_new_status in ('RETURNED'))
  );
  if not v_allowed then
    raise exception 'Invalid status transition from % to %', v_current_status, p_new_status;
  end if;
  update public.orders set status = p_new_status, updated_at = now() where id = p_order_id;
  return true;
end;
$$ language plpgsql;

create or replace function public.validate_inventory(p_product_id uuid, p_quantity integer)
returns boolean
security invoker
set search_path = public
as $$
declare
  v_stock integer;
begin
  select stock into v_stock from public.products where id = p_product_id;
  if not found then
    raise exception 'Product not found';
  end if;
  if v_stock < p_quantity then
    raise exception 'Insufficient stock';
  end if;
  return true;
end;
$$ language plpgsql;

create or replace function public.validate_return(p_order_id uuid, p_customer_id uuid)
returns boolean
security definer
set search_path = public
as $$
declare
  v_order_status text;
begin
  select status into v_order_status from public.orders where id = p_order_id;
  if not found then
    raise exception 'Order not found';
  end if;
  if v_order_status != 'DELIVERED' then
    raise exception 'Returns are only allowed for delivered orders';
  end if;
  if not exists (select 1 from public.orders where id = p_order_id and customer_id = p_customer_id) then
    raise exception 'Order does not belong to customer';
  end if;
  return true;
end;
$$ language plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
-- 16. PERMISSIONS
-- ═══════════════════════════════════════════════════════════════════════

-- Ensure authenticated and anon roles can use the public schema
-- RLS policies below enforce all data access control
grant usage on schema public to authenticated, anon;

-- ═══════════════════════════════════════════════════════════════════════
-- END OF MIGRATION
-- ═══════════════════════════════════════════════════════════════════════

-- ===================================================================
-- FILE: supabase/migrations/20260918020000_fix_admin_rls.sql
-- ===================================================================
-- Fix admin RLS: replace JWT-role checks with profiles-based is_admin()
-- Does NOT weaken RLS; makes local admin testable.

-- Helper: true iff current authenticated user has role='admin' in profiles
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Ensure helper runs with definer and is stable
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon;

-- --- profiles ---
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Admins can view all profiles" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- admin insert: allow authenticated to insert own profile is handled by trigger; also allow admin to manage if needed
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id or public.is_admin());

-- --- categories ---
drop policy if exists "Admins can manage categories" on public.categories;
create policy "Admins can manage categories"
  on public.categories for all
  using (public.is_admin())
  with check (public.is_admin());

-- --- manufacturers ---
drop policy if exists "Admins can manage manufacturers" on public.manufacturers;
create policy "Admins can manage manufacturers"
  on public.manufacturers for all
  using (public.is_admin())
  with check (public.is_admin());

-- --- products ---
drop policy if exists "Anyone can view active products" on public.products;
drop policy if exists "Admins can manage products" on public.products;

create policy "Anyone can view active products"
  on public.products for select
  using (is_active = true or public.is_admin());

create policy "Admins can manage products"
  on public.products for all
  using (public.is_admin())
  with check (public.is_admin());

-- Also allow admin to view inactive via same policy above (is_admin covers)
-- Customer should NOT see inactive; enforced by is_active=true OR admin.

-- --- inventory_items ---
drop policy if exists "Admins can view all inventory" on public.inventory_items;
drop policy if exists "Admins can manage inventory" on public.inventory_items;

create policy "Admins can view all inventory"
  on public.inventory_items for select
  using (public.is_admin());

create policy "Admins can manage inventory"
  on public.inventory_items for all
  using (public.is_admin())
  with check (public.is_admin());

-- --- stock_adjustments ---
drop policy if exists "Admins can view stock adjustments" on public.stock_adjustments;
drop policy if exists "Admins can create stock adjustments" on public.stock_adjustments;

create policy "Admins can view stock adjustments"
  on public.stock_adjustments for select
  using (public.is_admin());

create policy "Admins can create stock adjustments"
  on public.stock_adjustments for insert
  with check (public.is_admin());

-- --- orders ---
drop policy if exists "Customers can view own orders" on public.orders;
drop policy if exists "Customers can create orders" on public.orders;
drop policy if exists "Admins can view all orders" on public.orders;
drop policy if exists "Admins can update order status" on public.orders;

create policy "Customers can view own orders"
  on public.orders for select
  using (auth.uid() = customer_id or public.is_admin());

create policy "Customers can create orders"
  on public.orders for insert
  with check (auth.uid() = customer_id);

create policy "Admins can view all orders"
  on public.orders for select
  using (public.is_admin());

create policy "Admins can update orders"
  on public.orders for update
  using (public.is_admin())
  with check (public.is_admin());

-- --- order_items ---
drop policy if exists "Customers can view own order items" on public.order_items;
drop policy if exists "Admins can view all order items" on public.order_items;

create policy "Customers can view own order items"
  on public.order_items for select
  using (
    public.is_admin() or
    auth.uid() in (select customer_id from public.orders where id = order_id)
  );

create policy "Admins can view all order items"
  on public.order_items for select
  using (public.is_admin());

-- Also allow order_items insert via create_order function (definer) - RLS not needed but allow service?
-- Customers cannot directly insert order_items; only via RPC. So no insert policy.
create policy "Admins can manage order items"
  on public.order_items for all
  using (public.is_admin())
  with check (public.is_admin());

-- Enable insert for order_items via authenticated creating order? The RPC is definer, so it bypasses RLS.
-- Keep strict: no direct insert for customers.

-- --- return_requests ---
drop policy if exists "Customers can view own returns" on public.return_requests;
drop policy if exists "Customers can create returns" on public.return_requests;
drop policy if exists "Admins can view all returns" on public.return_requests;
drop policy if exists "Admins can update return status" on public.return_requests;

create policy "Customers can view own returns"
  on public.return_requests for select
  using (auth.uid() = customer_id or public.is_admin());

create policy "Customers can create returns"
  on public.return_requests for insert
  with check (auth.uid() = customer_id);

create policy "Admins can view all returns"
  on public.return_requests for select
  using (public.is_admin());

create policy "Admins can update return status"
  on public.return_requests for update
  using (public.is_admin())
  with check (public.is_admin());

-- --- delivery_cycles ---
drop policy if exists "Customers can view own delivery cycles" on public.delivery_cycles;
drop policy if exists "Customers can create delivery cycles" on public.delivery_cycles;
drop policy if exists "Admins can view all delivery cycles" on public.delivery_cycles;

create policy "Customers can view own delivery cycles"
  on public.delivery_cycles for select
  using (auth.uid() = customer_id or public.is_admin());

create policy "Customers can create delivery cycles"
  on public.delivery_cycles for insert
  with check (auth.uid() = customer_id);

create policy "Admins can view all delivery cycles"
  on public.delivery_cycles for select
  using (public.is_admin());

-- --- notifications ---
-- Keep customer own, but allow admin to view via is_admin? No, notifications are per-user; keep as is, no admin needed.

-- --- audit_entries ---
drop policy if exists "Admins can view audit entries" on public.audit_entries;
create policy "Admins can view audit entries"
  on public.audit_entries for select
  using (public.is_admin());

-- Custom access token hook: inject role into JWT so auth.jwt()->>'role' also works (defense in depth)
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role from public.profiles where id = (event->>'user_id')::uuid;
  if v_role is not null then
    return jsonb_set(event, '{claims,role}', to_jsonb(v_role));
  end if;
  return event;
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- Note: To activate the hook, set in supabase/config.toml:
-- [auth.hook.custom_access_token]
-- enabled = true
-- uri = "pg-functions://postgres/public/custom_access_token_hook"
-- This migration creates the function; activation is in config.toml (see docs/ADMIN_AUTH.md)

-- Also fix handle_new_user to allow admin promotion for local seed email
create or replace function public.handle_new_user()
returns trigger
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role', 'customer');
  insert into public.profiles (id, name, email, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'phone', ''),
    v_role
  )
  on conflict (id) do update set role = excluded.role, email = excluded.email;
  return new;
end;
$$ language plpgsql;

-- Idempotency for profiles phone unique index where phone = '' causes conflicts with '' default.
-- Already handled via handle_new_user, but ensure is_admin works before profile exists (during signup).


-- ===================================================================
-- FILE: supabase/migrations/20260918030000_fix_stock_and_storage.sql
-- ===================================================================
-- Fix Stock integrity, sync trigger, storage buckets, and handle edge cases
-- Part of Step 11 quality pass

-- 1. Fix sync_product_stock to handle INSERT/UPDATE/DELETE correctly (use COALESCE(NEW,OLD))
create or replace function public.sync_product_stock()
returns trigger
security invoker
set search_path = public
as $$
declare
  v_pid uuid;
begin
  v_pid := coalesce(new.product_id, old.product_id);
  update public.products
  set stock = (
    select coalesce(sum(quantity), 0)
    from public.inventory_items
    where product_id = v_pid
  )
  where id = v_pid;
  return coalesce(new, old);
end;
$$ language plpgsql;

drop trigger if exists trg_inventory_sync_stock on public.inventory_items;
create trigger trg_inventory_sync_stock
  after insert or update or delete on public.inventory_items
  for each row execute function public.sync_product_stock();

-- 2. Fix create_order to deduct from inventory_items FIFO (expiry earliest first) instead of direct products.stock
-- This keeps products.stock in sync via the trigger above and ensures batch-level correctness.
create or replace function public.create_order(p_customer_id uuid, p_address_id uuid)
returns uuid
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_delivery_fee numeric := 150;
  v_total numeric := 0;
  v_customer_name text;
  v_address_text text;
  v_cart_item record;
  v_product record;
  v_remaining integer;
  v_inv record;
begin
  select name into v_customer_name from public.profiles where id = p_customer_id;
  if not found then
    raise exception 'Customer not found';
  end if;

  select street || ', ' || city || coalesce(', ' || county, '') || coalesce(', ' || postal_code, '')
    into v_address_text from public.addresses where id = p_address_id and user_id = p_customer_id;
  if v_address_text is null then
    raise exception 'Invalid address';
  end if;

  if not exists (select 1 from public.cart_items where user_id = p_customer_id) then
    raise exception 'Cart is empty';
  end if;

  -- Validate stock and calculate subtotal using inventory sum (authoritative)
  for v_cart_item in select * from public.cart_items where user_id = p_customer_id loop
    select * into v_product from public.products where id = v_cart_item.product_id and is_active = true;
    if not found then
      raise exception 'Product not available';
    end if;
    -- Use sum of inventory_items as authoritative stock, fallback to products.stock if no batches
    declare
      v_total_stock integer;
    begin
      select coalesce(sum(quantity), 0) into v_total_stock from public.inventory_items where product_id = v_cart_item.product_id;
      -- If no inventory rows, fall back to products.stock (legacy), else use inventory sum
      if v_total_stock = 0 and not exists (select 1 from public.inventory_items where product_id = v_cart_item.product_id) then
        v_total_stock := v_product.stock;
      end if;
      if v_total_stock < v_cart_item.quantity then
        raise exception 'Insufficient stock for product %', v_product.name;
      end if;
    end;
    v_subtotal := v_subtotal + (v_product.price * v_cart_item.quantity);
  end loop;

  v_total := v_subtotal - v_discount + v_delivery_fee;

  insert into public.orders (order_number, customer_id, customer_name, status, subtotal, discount, delivery_fee, total, payment_method, address)
  values (null, p_customer_id, v_customer_name, 'PENDING', v_subtotal, v_discount, v_delivery_fee, v_total, 'CASH_ON_DELIVERY', v_address_text)
  returning id into v_order_id;

  for v_cart_item in select * from public.cart_items where user_id = p_customer_id loop
    select * into v_product from public.products where id = v_cart_item.product_id;
    insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, discount_percent, total)
    values (v_order_id, v_cart_item.product_id, v_product.name, v_cart_item.quantity, v_product.price, coalesce(v_product.discount_percent,0), v_product.price * v_cart_item.quantity);

    -- Deduct from inventory FIFO (earliest expiry first, nulls last)
    v_remaining := v_cart_item.quantity;
    for v_inv in
      select id, quantity from public.inventory_items
      where product_id = v_cart_item.product_id and quantity > 0
      order by expiry_date asc nulls last, last_updated asc
      for update
    loop
      exit when v_remaining <= 0;
      if v_inv.quantity >= v_remaining then
        update public.inventory_items set quantity = quantity - v_remaining where id = v_inv.id;
        v_remaining := 0;
      else
        v_remaining := v_remaining - v_inv.quantity;
        update public.inventory_items set quantity = 0 where id = v_inv.id;
      end if;
    end loop;

    -- If no inventory rows exist (legacy product with stock only), keep products.stock update for backward compat
    if not exists (select 1 from public.inventory_items where product_id = v_cart_item.product_id) then
      update public.products set stock = stock - v_cart_item.quantity where id = v_cart_item.product_id;
    end if;
  end loop;

  delete from public.cart_items where user_id = p_customer_id;
  return v_order_id;
end;
$$ language plpgsql;

-- 3. Ensure storage buckets exist for product-images and avatars (idempotent)
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- Storage policies: public read, authenticated write
-- Drop existing if any then recreate
do $$
begin
  -- product-images policies
  if not exists (select 1 from pg_policies where policyname = 'Public read product-images' and tablename='objects' and schemaname='storage') then
    create policy "Public read product-images"
      on storage.objects for select
      using (bucket_id = 'product-images');
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Authenticated write product-images' and tablename='objects') then
    create policy "Authenticated write product-images"
      on storage.objects for insert
      with check (bucket_id = 'product-images' and auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Admin update product-images' and tablename='objects') then
    create policy "Admin update product-images"
      on storage.objects for update
      using (bucket_id = 'product-images' and public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Admin delete product-images' and tablename='objects') then
    create policy "Admin delete product-images"
      on storage.objects for delete
      using (bucket_id = 'product-images' and public.is_admin());
  end if;
  -- avatars policies
  if not exists (select 1 from pg_policies where policyname = 'Public read avatars' and tablename='objects') then
    create policy "Public read avatars"
      on storage.objects for select
      using (bucket_id = 'avatars');
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Authenticated write avatars' and tablename='objects') then
    create policy "Authenticated write avatars"
      on storage.objects for insert
      with check (bucket_id = 'avatars' and auth.role() = 'authenticated');
  end if;
end $$;

-- 4. Backfill products.stock from inventory sums to fix divergence
update public.products p
set stock = sub.total
from (select product_id, coalesce(sum(quantity),0) as total from public.inventory_items group by product_id) sub
where p.id = sub.product_id;


-- ===================================================================
-- FILE: supabase/migrations/20260918040000_fix_cart_and_discount.sql
-- ===================================================================
-- Fix discount silent reset and cart duplicate-quantity edge case

-- 1. Make check_discount strict: reject discount >0 when original_price is null, instead of silently resetting
create or replace function public.check_discount()
returns trigger as $$
begin
  if new.original_price is null and new.discount_percent != 0 then
    raise exception 'discount_percent must be 0 when original_price is null';
  end if;
  return new;
end;
$$ language plpgsql;

-- 2. Harden handle_cart_insert: reject quantity <=0 merges and prevent duplicate insertion from bypassing constraint
create or replace function public.handle_cart_insert()
returns trigger
security invoker
set search_path = public
as $$
begin
  if new.quantity <= 0 then
    raise exception 'quantity must be >= 1';
  end if;
  if exists (
    select 1 from public.cart_items
    where user_id = new.user_id and product_id = new.product_id
    and id != new.id
  ) then
    update public.cart_items
    set quantity = quantity + new.quantity,
        updated_at = now()
    where user_id = new.user_id and product_id = new.product_id;
    return null;
  end if;
  return new;
end;
$$ language plpgsql;


-- ===================================================================
-- FILE: supabase/migrations/20260918050000_expiry_and_concurrency.sql
-- ===================================================================
-- Task 1 & 4: Enforce expiry during checkout and harden concurrency
-- Do NOT edit old migrations

-- Update create_order to:
-- 1. Only consider non-expired inventory (expiry_date IS NULL OR expiry_date >= current_date) for validation and FIFO
-- 2. Lock inventory rows with FOR UPDATE before validation to prevent concurrent oversell
-- 3. Verify v_remaining == 0 after FIFO loop, otherwise raise insufficient stock (concurrent safety)

create or replace function public.create_order(p_customer_id uuid, p_address_id uuid)
returns uuid
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_delivery_fee numeric := 150;
  v_total numeric := 0;
  v_customer_name text;
  v_address_text text;
  v_cart_item record;
  v_product record;
  v_remaining integer;
  v_inv record;
begin
  select name into v_customer_name from public.profiles where id = p_customer_id;
  if not found then
    raise exception 'Customer not found';
  end if;

  select street || ', ' || city || coalesce(', ' || county, '') || coalesce(', ' || postal_code, '')
    into v_address_text from public.addresses where id = p_address_id and user_id = p_customer_id;
  if v_address_text is null then
    raise exception 'Invalid address';
  end if;

  if not exists (select 1 from public.cart_items where user_id = p_customer_id) then
    raise exception 'Cart is empty';
  end if;

  -- Lock inventory rows for all products in cart upfront to serialize concurrent checkouts
  -- This ensures validation and deduction see a consistent snapshot
  perform 1 from public.inventory_items
    where product_id in (select product_id from public.cart_items where user_id = p_customer_id)
    for update;

  -- Validate stock and calculate subtotal using ONLY non-expired inventory
  for v_cart_item in select * from public.cart_items where user_id = p_customer_id loop
    select * into v_product from public.products where id = v_cart_item.product_id and is_active = true;
    if not found then
      raise exception 'Product not available';
    end if;
    declare
      v_total_stock integer;
    begin
      select coalesce(sum(quantity), 0) into v_total_stock
        from public.inventory_items
        where product_id = v_cart_item.product_id
          and (expiry_date is null or expiry_date >= current_date);
      -- If no non-expired inventory rows exist but product has no inventory table at all (legacy), fallback to products.stock
      if v_total_stock = 0 and not exists (select 1 from public.inventory_items where product_id = v_cart_item.product_id) then
        v_total_stock := v_product.stock;
      end if;
      if v_total_stock < v_cart_item.quantity then
        raise exception 'Insufficient stock for product %', v_product.name;
      end if;
    end;
    v_subtotal := v_subtotal + (v_product.price * v_cart_item.quantity);
  end loop;

  v_total := v_subtotal - v_discount + v_delivery_fee;

  insert into public.orders (order_number, customer_id, customer_name, status, subtotal, discount, delivery_fee, total, payment_method, address)
  values (null, p_customer_id, v_customer_name, 'PENDING', v_subtotal, v_discount, v_delivery_fee, v_total, 'CASH_ON_DELIVERY', v_address_text)
  returning id into v_order_id;

  for v_cart_item in select * from public.cart_items where user_id = p_customer_id loop
    select * into v_product from public.products where id = v_cart_item.product_id;
    insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, discount_percent, total)
    values (v_order_id, v_cart_item.product_id, v_product.name, v_cart_item.quantity, v_product.price, coalesce(v_product.discount_percent,0), v_product.price * v_cart_item.quantity);

    -- Deduct from NON-EXPIRED inventory FIFO (NULL expiry = never expires, sorted last but still usable)
    v_remaining := v_cart_item.quantity;
    for v_inv in
      select id, quantity from public.inventory_items
      where product_id = v_cart_item.product_id
        and quantity > 0
        and (expiry_date is null or expiry_date >= current_date)
      order by
        case when expiry_date is null then 1 else 0 end,
        expiry_date asc,
        last_updated asc
      for update
    loop
      exit when v_remaining <= 0;
      if v_inv.quantity >= v_remaining then
        update public.inventory_items set quantity = quantity - v_remaining where id = v_inv.id;
        v_remaining := 0;
      else
        v_remaining := v_remaining - v_inv.quantity;
        update public.inventory_items set quantity = 0 where id = v_inv.id;
      end if;
    end loop;

    -- Concurrent safety: if still remaining, inventory was exhausted between validation and deduction
    if v_remaining > 0 then
      raise exception 'Insufficient stock for product %', v_product.name;
    end if;

    -- Legacy fallback if no inventory rows at all
    if not exists (select 1 from public.inventory_items where product_id = v_cart_item.product_id) then
      update public.products set stock = stock - v_cart_item.quantity where id = v_cart_item.product_id;
    end if;
  end loop;

  delete from public.cart_items where user_id = p_customer_id;
  return v_order_id;
end;
$$ language plpgsql;


-- ===================================================================
-- FILE: supabase/migrations/20260918060000_prod_auth_hardening.sql
-- ===================================================================
-- PRODUCTION AUTHORIZATION HARDENING
-- Admin allowlist: icrmahin@gmail.com, Hibbullah82026@gmail.com (case-insensitive via lower(email))
-- Source of truth: auth.users.email (verified/current), NOT profiles.role, NOT user_metadata, NOT client-supplied
-- This migration is idempotent and preserves existing valid product/order/cart functionality.

-- 1. Hardened is_admin() — single source of truth, SECURITY DEFINER, explicit search_path, fully qualified refs
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public, auth, pg_catalog
as $$
  select exists (
    select 1 from auth.users
    where auth.users.id = auth.uid()
      and lower(auth.users.email) in ('icrmahin@gmail.com', 'hibbullah82026@gmail.com')
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon, service_role;

-- 2. Custom access token hook — derive JWT role from same allowlist, not from profiles table
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_email text;
  v_role text;
begin
  select lower(email) into v_email from auth.users where id = (event->>'user_id')::uuid;
  if v_email in ('icrmahin@gmail.com', 'hibbullah82026@gmail.com') then
    v_role := 'admin';
  else
    v_role := 'customer';
  end if;
  -- Never overwrite claims.role (must remain 'authenticated'); inject app_role/is_admin for optional client use, RLS uses is_admin()
  event := jsonb_set(event, '{claims,app_role}', to_jsonb(v_role));
  event := jsonb_set(event, '{claims,is_admin}', to_jsonb(v_role = 'admin'));
  return event;
exception when others then
  return event;
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- 3. handle_new_user — synchronize profiles.role from allowlist at signup
create or replace function public.handle_new_user()
returns trigger
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_role text := 'customer';
  v_email_lower text;
begin
  v_email_lower := lower(new.email);
  if v_email_lower in ('icrmahin@gmail.com', 'hibbullah82026@gmail.com') then
    v_role := 'admin';
  else
    v_role := 'customer';
  end if;

  insert into public.profiles (id, name, email, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'phone', ''),
    v_role
  )
  on conflict (id) do update set
    email = excluded.email,
    role = excluded.role,
    name = coalesce(public.profiles.name, excluded.name),
    updated_at = now();
  return new;
end;
$$ language plpgsql;

-- 4. Enforce profile role derived from auth.users.email — prevents client escalation
create or replace function public.enforce_profile_role()
returns trigger
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_email text;
  v_allowed_role text;
begin
  -- Prefer auth.users.email as source of truth; fallback to NEW.email if not yet in auth.users (race)
  select lower(email) into v_email from auth.users where id = new.id;
  if v_email is null then
    v_email := lower(new.email);
  end if;

  if v_email in ('icrmahin@gmail.com', 'hibbullah82026@gmail.com') then
    v_allowed_role := 'admin';
  else
    v_allowed_role := 'customer';
  end if;

  if new.role is distinct from v_allowed_role then
    new.role := v_allowed_role;
  end if;
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_profiles_enforce_role on public.profiles;
create trigger trg_profiles_enforce_role
  before insert or update on public.profiles
  for each row execute function public.enforce_profile_role();

-- 5. Sync profiles on auth email change — handles allowlist entry/exit via verified email-change flow
create or replace function public.sync_profile_on_email_change()
returns trigger
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_new_role text;
begin
  if lower(new.email) in ('icrmahin@gmail.com', 'hibbullah82026@gmail.com') then
    v_new_role := 'admin';
  else
    v_new_role := 'customer';
  end if;

  update public.profiles
    set email = new.email,
        role = v_new_role,
        updated_at = now()
    where id = new.id;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_auth_sync_profile on auth.users;
create trigger trg_auth_sync_profile
  after update of email on auth.users
  for each row execute function public.sync_profile_on_email_change();

-- 6. Backfill existing profiles to correct derived roles (idempotent)
update public.profiles p
set role = case
  when lower(coalesce((select email from auth.users where id = p.id), p.email)) in ('icrmahin@gmail.com','hibbullah82026@gmail.com') then 'admin'
  
  else 'customer'
end,
updated_at = now()
where p.role != case
  when lower(coalesce((select email from auth.users where id = p.id), p.email)) in ('icrmahin@gmail.com','hibbullah82026@gmail.com') then 'admin'
  
  else 'customer'
end;

-- Also ensure profiles.email mirrors auth.users.email where diverged
update public.profiles p
set email = u.email, updated_at = now()
from auth.users u
where p.id = u.id and p.email is distinct from u.email;

-- 7. Harden profiles RLS — keep display role but enforce ownership and prevent cross-user writes
-- Re-apply to ensure they use hardened is_admin()
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
-- Note: enforce_profile_role trigger will silently correct any role escalation attempt.

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id or public.is_admin());

-- Add delete protection (only self or admin) if not already restricted
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'Users can delete own profile' and tablename='profiles' and schemaname='public') then
    create policy "Users can delete own profile"
      on public.profiles for delete
      using (auth.uid() = id or public.is_admin());
  end if;
end $$;

-- 8. Harden admin RLS policies — explicitly re-create with is_admin() to ensure no legacy JWT checks remain
-- categories
drop policy if exists "Admins can manage categories" on public.categories;
create policy "Admins can manage categories"
  on public.categories for all
  using (public.is_admin())
  with check (public.is_admin());

-- manufacturers
drop policy if exists "Admins can manage manufacturers" on public.manufacturers;
create policy "Admins can manage manufacturers"
  on public.manufacturers for all
  using (public.is_admin())
  with check (public.is_admin());

-- products
drop policy if exists "Anyone can view active products" on public.products;
drop policy if exists "Admins can manage products" on public.products;
create policy "Anyone can view active products"
  on public.products for select
  using (is_active = true or public.is_admin());
create policy "Admins can manage products"
  on public.products for all
  using (public.is_admin())
  with check (public.is_admin());

-- inventory_items
drop policy if exists "Admins can view all inventory" on public.inventory_items;
drop policy if exists "Admins can manage inventory" on public.inventory_items;
create policy "Admins can view all inventory"
  on public.inventory_items for select
  using (public.is_admin());
create policy "Admins can manage inventory"
  on public.inventory_items for all
  using (public.is_admin())
  with check (public.is_admin());

-- stock_adjustments
drop policy if exists "Admins can view stock adjustments" on public.stock_adjustments;
drop policy if exists "Admins can create stock adjustments" on public.stock_adjustments;
create policy "Admins can view stock adjustments"
  on public.stock_adjustments for select
  using (public.is_admin());
create policy "Admins can create stock adjustments"
  on public.stock_adjustments for insert
  with check (public.is_admin());

-- orders
drop policy if exists "Customers can view own orders" on public.orders;
drop policy if exists "Customers can create orders" on public.orders;
drop policy if exists "Admins can view all orders" on public.orders;
drop policy if exists "Admins can update orders" on public.orders;
create policy "Customers can view own orders"
  on public.orders for select
  using (auth.uid() = customer_id or public.is_admin());
create policy "Customers can create orders"
  on public.orders for insert
  with check (auth.uid() = customer_id);
create policy "Admins can view all orders"
  on public.orders for select
  using (public.is_admin());
create policy "Admins can update orders"
  on public.orders for update
  using (public.is_admin())
  with check (public.is_admin());

-- order_items
drop policy if exists "Customers can view own order items" on public.order_items;
drop policy if exists "Admins can view all order items" on public.order_items;
drop policy if exists "Admins can manage order items" on public.order_items;
create policy "Customers can view own order items"
  on public.order_items for select
  using (
    public.is_admin() or
    auth.uid() in (select customer_id from public.orders where id = order_id)
  );
create policy "Admins can view all order items"
  on public.order_items for select
  using (public.is_admin());
create policy "Admins can manage order items"
  on public.order_items for all
  using (public.is_admin())
  with check (public.is_admin());

-- return_requests
drop policy if exists "Customers can view own returns" on public.return_requests;
drop policy if exists "Customers can create returns" on public.return_requests;
drop policy if exists "Admins can view all returns" on public.return_requests;
drop policy if exists "Admins can update return status" on public.return_requests;
create policy "Customers can view own returns"
  on public.return_requests for select
  using (auth.uid() = customer_id or public.is_admin());
create policy "Customers can create returns"
  on public.return_requests for insert
  with check (auth.uid() = customer_id);
create policy "Admins can view all returns"
  on public.return_requests for select
  using (public.is_admin());
create policy "Admins can update return status"
  on public.return_requests for update
  using (public.is_admin())
  with check (public.is_admin());

-- delivery_cycles
drop policy if exists "Customers can view own delivery cycles" on public.delivery_cycles;
drop policy if exists "Customers can create delivery cycles" on public.delivery_cycles;
drop policy if exists "Admins can view all delivery cycles" on public.delivery_cycles;
create policy "Customers can view own delivery cycles"
  on public.delivery_cycles for select
  using (auth.uid() = customer_id or public.is_admin());
create policy "Customers can create delivery cycles"
  on public.delivery_cycles for insert
  with check (auth.uid() = customer_id);
create policy "Admins can view all delivery cycles"
  on public.delivery_cycles for select
  using (public.is_admin());

-- audit_entries
drop policy if exists "Admins can view audit entries" on public.audit_entries;
create policy "Admins can view audit entries"
  on public.audit_entries for select
  using (public.is_admin());

-- 9. Storage — ensure admin-only write uses hardened is_admin
do $$
begin
  -- These policies were created with IF NOT EXISTS; re-create with hardened check if they used old is_admin, they still use is_admin() so hardening is transitive.
  -- Ensure they exist and are correct
  if not exists (select 1 from pg_policies where policyname='Admin update product-images' and tablename='objects' and schemaname='storage') then
    create policy "Admin update product-images"
      on storage.objects for update
      using (bucket_id = 'product-images' and public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where policyname='Admin delete product-images' and tablename='objects') then
    create policy "Admin delete product-images"
      on storage.objects for delete
      using (bucket_id = 'product-images' and public.is_admin());
  end if;
end $$;

-- 10. Harden RPC: transition_order_status — must verify caller is_admin() via hardened function
create or replace function public.transition_order_status(p_order_id uuid, p_new_status text, p_admin_id uuid)
returns boolean
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_current_status text;
  v_allowed boolean := false;
begin
  -- Caller must be admin via hardened is_admin()
  if not public.is_admin() then
    raise exception 'Only admins can change order status';
  end if;

  -- p_admin_id must be the caller and must be admin by email allowlist
  if p_admin_id is distinct from auth.uid() then
    raise exception 'Admin ID must match authenticated user';
  end if;

  -- Extra defense: verify email allowlist for p_admin_id
  if not exists (select 1 from auth.users where id = p_admin_id and lower(email) in ('icrmahin@gmail.com','hibbullah82026@gmail.com')) then
    raise exception 'Only allowlisted admins can change order status';
  end if;

  select status into v_current_status from public.orders where id = p_order_id;
  if not found then
    raise exception 'Order not found';
  end if;
  v_allowed := (
    (v_current_status = 'PENDING' and p_new_status in ('CONFIRMED', 'CANCELLED')) or
    (v_current_status = 'CONFIRMED' and p_new_status in ('PROCESSING', 'CANCELLED')) or
    (v_current_status = 'PROCESSING' and p_new_status in ('OUT_FOR_DELIVERY', 'CANCELLED')) or
    (v_current_status = 'OUT_FOR_DELIVERY' and p_new_status in ('DELIVERED')) or
    (v_current_status = 'DELIVERED' and p_new_status in ('RETURNED'))
  );
  if not v_allowed then
    raise exception 'Invalid status transition from % to %', v_current_status, p_new_status;
  end if;
  update public.orders set status = p_new_status, updated_at = now() where id = p_order_id;
  return true;
end;
$$ language plpgsql;

-- 11. Fix phone unique index to allow multiple empty phones (partial index) — prevents handle_new_user clash on '' for admins without phone metadata
drop index if exists idx_profiles_phone;
create unique index idx_profiles_phone on public.profiles (phone) where phone <> '';

-- 12. Documented: No new RPC grants admin. Existing create_order/validate_* remain customer-scoped.

-- 13. Ensure is_admin remains executable
grant execute on function public.is_admin() to authenticated, anon, service_role;


-- ===================================================================
-- FILE: supabase/migrations/20260918070000_prod_ecom_no_phone_admin.sql
-- ===================================================================
-- PRODUCTION E-COM: Admin no-phone, User info required at checkout
-- Admin (icrmahin@gmail.com, Hibbullah82026@gmail.com) must be able to sign in without phone
-- User must provide phone/address at checkout; DB must not block admin creation

-- 1. Allow phone to be nullable/empty for admins: relax profiles.phone column
alter table public.profiles alter column phone drop not null;
alter table public.profiles drop constraint if exists profiles_phone_format;
alter table public.profiles add constraint profiles_phone_format
  check (phone is null or phone = '' or phone ~* '^\+?254[17][0-9]{8}$');

-- Partial unique index already allows multiple '' but not multiple nulls with no where; recreate to allow both
drop index if exists idx_profiles_phone;
create unique index idx_profiles_phone on public.profiles (phone) where phone is not null and phone <> '' and phone <> 'null';

-- 2. Update handle_new_user to allow admin without phone, keep customer phone optional at signup (enforced at checkout)
create or replace function public.handle_new_user()
returns trigger
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_role text := 'customer';
  v_email_lower text;
  v_phone text;
begin
  v_email_lower := lower(new.email);
  if v_email_lower in ('icrmahin@gmail.com', 'hibbullah82026@gmail.com') then
    v_role := 'admin';
  else
    v_role := 'customer';
  end if;

  v_phone := coalesce(new.raw_user_meta_data->>'phone', '');
  -- Normalize empty to null for admin convenience (keeps partial index clean)
  if v_phone = '' and v_role = 'admin' then
    v_phone := null;
  end if;

  insert into public.profiles (id, name, email, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    v_phone,
    v_role
  )
  on conflict (id) do update set
    email = excluded.email,
    role = excluded.role,
    name = coalesce(public.profiles.name, excluded.name),
    -- Keep phone if already present, else use new
    phone = coalesce(public.profiles.phone, excluded.phone),
    updated_at = now();
  return new;
end;
$$ language plpgsql;

-- 3. Update enforce_profile_role to allow admin phone null/'' without forcing format
create or replace function public.enforce_profile_role()
returns trigger
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_email text;
  v_allowed_role text;
begin
  select lower(email) into v_email from auth.users where id = new.id;
  if v_email is null then
    v_email := lower(new.email);
  end if;

  if v_email in ('icrmahin@gmail.com', 'hibbullah82026@gmail.com') then
    v_allowed_role := 'admin';
  else
    v_allowed_role := 'customer';
  end if;

  if new.role is distinct from v_allowed_role then
    new.role := v_allowed_role;
  end if;

  -- For admin, allow phone null/'' regardless of format
  if v_allowed_role = 'admin' and (new.phone is null or new.phone = '') then
    new.phone := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_profiles_enforce_role on public.profiles;
create trigger trg_profiles_enforce_role
  before insert or update on public.profiles
  for each row execute function public.enforce_profile_role();

-- 4. Ensure sync on email change preserves phone if admin
create or replace function public.sync_profile_on_email_change()
returns trigger
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_new_role text;
begin
  if lower(new.email) in ('icrmahin@gmail.com', 'hibbullah82026@gmail.com') then
    v_new_role := 'admin';
  else
    v_new_role := 'customer';
  end if;

  update public.profiles
    set email = new.email,
        role = v_new_role,
        updated_at = now()
    where id = new.id;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_auth_sync_profile on auth.users;
create trigger trg_auth_sync_profile
  after update of email on auth.users
  for each row execute function public.sync_profile_on_email_change();

-- 5. Backfill: admins with '' phone -> null; ensure roles still correct
update public.profiles set phone = null, updated_at = now() where role = 'admin' and phone = '';


-- ===================================================================
-- FILE: supabase/migrations/20260918080000_fix_phone_bd_and_seed.sql
-- ===================================================================
-- Fix Bangladeshi phone format: +880 (country code +880, typical 10 digits after: +8801865858544)
-- Previous format was Kenyan +254; now Bangladeshi per request. Example: +8801865858544 -> +8801[0-9]{9}

-- 1. Drop old constraint and create new Bangladeshi format
alter table public.profiles drop constraint if exists profiles_phone_format;
alter table public.profiles add constraint profiles_phone_format
  check (phone is null or phone = '' or phone ~* '^\+?8801[0-9]{9}$');

-- 2. Migrate existing Kenyan seed phones to Bangladeshi equivalents (keep determinism)
-- Map: +254712345678 -> +8801712345678, +254701234567 -> +8801865858544 (user's number), +254722345678 -> +8801923456789
update public.profiles set phone = '+8801712345678', updated_at = now() where phone = '+254712345678';
update public.profiles set phone = '+8801865858544', updated_at = now() where phone = '+254701234567';
update public.profiles set phone = '+8801923456789', updated_at = now() where phone = '+254722345678';

-- Also fix any remaining Kenyan phones that may have been used in tests
update public.profiles set phone = '+8801712345678' where phone ~* '^\+?254';

-- 3. Keep partial unique index (already partial where phone is not null and <>'' and <>'null')
drop index if exists idx_profiles_phone;
create unique index idx_profiles_phone on public.profiles (phone) where phone is not null and phone <> '' and phone <> 'null';


-- ===================================================================
-- FILE: supabase/migrations/20260918090000_is_admin_local_parity.sql
-- ===================================================================
-- Admin allowlist for is_admin(): only the fixed production emails
-- Registering with one of these promotes the profile role to admin.

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public, auth, pg_catalog
as $$
  select exists (
    select 1 from auth.users
    where auth.users.id = auth.uid()
      and lower(auth.users.email) in ('icrmahin@gmail.com', 'hibbullah82026@gmail.com')
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon, service_role;

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_email text;
  v_role text;
begin
  select lower(email) into v_email from auth.users where id = (event->>'user_id')::uuid;
  if v_email in ('icrmahin@gmail.com', 'hibbullah82026@gmail.com') then
    v_role := 'admin';
  else
    v_role := 'customer';
  end if;
  event := jsonb_set(event, '{claims,app_role}', to_jsonb(v_role));
  event := jsonb_set(event, '{claims,is_admin}', to_jsonb(v_role = 'admin'));
  return event;
exception when others then
  return event;
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

create or replace function public.transition_order_status(p_order_id uuid, p_new_status text, p_admin_id uuid)
returns boolean
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_current_status text;
  v_allowed boolean := false;
begin
  if not public.is_admin() then
    raise exception 'Only admins can change order status';
  end if;
  if p_admin_id is distinct from auth.uid() then
    raise exception 'Admin ID must match authenticated user';
  end if;
  if not exists (select 1 from auth.users where id = p_admin_id and lower(email) in ('icrmahin@gmail.com','hibbullah82026@gmail.com')) then
    raise exception 'Only allowlisted admins can change order status';
  end if;
  select status into v_current_status from public.orders where id = p_order_id;
  if not found then
    raise exception 'Order not found';
  end if;
  v_allowed := (
    (v_current_status = 'PENDING' and p_new_status in ('CONFIRMED', 'CANCELLED')) or
    (v_current_status = 'CONFIRMED' and p_new_status in ('PROCESSING', 'CANCELLED')) or
    (v_current_status = 'PROCESSING' and p_new_status in ('OUT_FOR_DELIVERY', 'CANCELLED')) or
    (v_current_status = 'OUT_FOR_DELIVERY' and p_new_status in ('DELIVERED')) or
    (v_current_status = 'DELIVERED' and p_new_status in ('RETURNED'))
  );
  if not v_allowed then
    raise exception 'Invalid status transition from % to %', v_current_status, p_new_status;
  end if;
  update public.orders set status = p_new_status, updated_at = now() where id = p_order_id;
  return true;
end;
$$ language plpgsql;


-- ===================================================================
-- FILE: supabase/migrations/20260918100000_favorites.sql
-- ===================================================================
-- Favorites — customer wishlisted products, recent first
create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint unique_user_product_fav unique (user_id, product_id)
);

create index idx_favorites_user_created on public.favorites (user_id, created_at desc);
create index idx_favorites_product on public.favorites (product_id);

alter table public.favorites enable row level security;

create policy "Customers can view own favorites"
  on public.favorites for select using (auth.uid() = user_id);
create policy "Customers can manage own favorites"
  on public.favorites for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- ===================================================================
-- FILE: supabase/migrations/20260918110000_cost_price.sql
-- ===================================================================
-- cost_price for profit calc: earning = sum((unit_price - cost_price) * qty) last 30d
alter table public.products add column if not exists cost_price numeric(12,2) check (cost_price >= 0);

-- backfill: assume 20% margin if null (cost = price * 0.8)
update public.products set cost_price = round(price * 0.8, 2) where cost_price is null;

-- keep cost_price in sync trigger? leave manual for admin

-- view helper for dashboard (optional, compute in app)


-- ===================================================================
-- FILE: supabase/migrations/20260922120000_storage_buckets.sql
-- ===================================================================
-- Storage buckets for product images and user avatars
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Policies on storage.objects for public read + authenticated write
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Public can view product-images') then
    create policy "Public can view product-images"
      on storage.objects for select using (bucket_id = 'product-images');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Authenticated can upload product-images') then
    create policy "Authenticated can upload product-images"
      on storage.objects for insert with check (bucket_id = 'product-images' and auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Authenticated can update product-images') then
    create policy "Authenticated can update product-images"
      on storage.objects for update using (bucket_id = 'product-images' and auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Authenticated can delete product-images') then
    create policy "Authenticated can delete product-images"
      on storage.objects for delete using (bucket_id = 'product-images' and auth.role() = 'authenticated');
  end if;

  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Public can view avatars') then
    create policy "Public can view avatars"
      on storage.objects for select using (bucket_id = 'avatars');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Authenticated can manage avatars') then
    create policy "Authenticated can manage avatars"
      on storage.objects for all using (bucket_id = 'avatars' and auth.role() = 'authenticated') with check (bucket_id = 'avatars' and auth.role() = 'authenticated');
  end if;
end $$;


-- ===================================================================
-- FILE: supabase/migrations/20260922130000_dashboard_aggregates.sql
-- ===================================================================
-- Dashboard 30-day aggregates moved to server-side RPC to avoid client-side full-table fetches
-- Free-tier friendly: single RPC instead of 11 parallel select('*')
create or replace function public.get_admin_dashboard_sales(p_since timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_sales_qty int := 0;
  v_total_revenue numeric := 0;
  v_total_earning numeric := 0;
  v_sales_trend jsonb := '[]'::jsonb;
  v_earning_trend jsonb := '[]'::jsonb;
begin
  -- only admins can call
  if auth.jwt() ->> 'role' <> 'admin' then
    raise exception 'Only admins can query dashboard sales';
  end if;

  select coalesce(sum(total),0)::numeric into v_total_revenue
  from public.orders
  where created_at >= p_since and status <> 'CANCELLED';

  select
    coalesce(sum(oi.quantity),0)::int,
    coalesce(sum((oi.unit_price - coalesce(p.cost_price, oi.unit_price * 0.8)) * oi.quantity),0)::numeric
  into v_total_sales_qty, v_total_earning
  from public.order_items oi
  join public.products p on p.id = oi.product_id
  where oi.created_at >= p_since;

  -- 7-day trends
  with days as (
    select generate_series((current_date - interval '6 days')::date, current_date::date, '1 day'::interval)::date as d
  ), qty_by_day as (
    select oi.created_at::date as d, sum(oi.quantity)::int as qty
    from public.order_items oi where oi.created_at >= p_since group by 1
  ), earn_by_day as (
    select oi.created_at::date as d, sum((oi.unit_price - coalesce(p.cost_price, oi.unit_price * 0.8)) * oi.quantity)::numeric as earn
    from public.order_items oi join public.products p on p.id = oi.product_id where oi.created_at >= p_since group by 1
  )
  select
    coalesce(jsonb_agg(coalesce(q.qty,0) order by days.d), '[]'::jsonb),
    coalesce(jsonb_agg(round(coalesce(e.earn,0)) order by days.d), '[]'::jsonb)
  into v_sales_trend, v_earning_trend
  from days
  left join qty_by_day q on q.d = days.d
  left join earn_by_day e on e.d = days.d;

  return jsonb_build_object(
    'totalSalesQty', v_total_sales_qty,
    'totalSalesRevenue', v_total_revenue,
    'totalEarning', round(v_total_earning),
    'salesTrend', v_sales_trend,
    'earningTrend', v_earning_trend
  );
end;
$$;

grant execute on function public.get_admin_dashboard_sales(timestamptz) to authenticated;


-- ===================================================================
-- FILE: supabase/migrations/20260922140000_delivery_cycle_items.sql
-- ===================================================================
-- delivery_cycle_items — products in a delivery cycle (was described in docs but not migrated)
create table if not exists public.delivery_cycle_items (
  id uuid primary key default gen_random_uuid(),
  delivery_cycle_id uuid not null references public.delivery_cycles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null check (quantity >= 1),
  created_at timestamptz not null default now(),
  constraint unique_cycle_product unique (delivery_cycle_id, product_id)
);

create index if not exists idx_delivery_cycle_items_cycle on public.delivery_cycle_items (delivery_cycle_id);
create index if not exists idx_delivery_cycle_items_product on public.delivery_cycle_items (product_id);

alter table public.delivery_cycle_items enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='delivery_cycle_items' and policyname='Customers can view own delivery cycle items') then
    create policy "Customers can view own delivery cycle items"
      on public.delivery_cycle_items for select
      using (exists (select 1 from public.delivery_cycles dc where dc.id = delivery_cycle_id and dc.customer_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='delivery_cycle_items' and policyname='Customers can manage own delivery cycle items') then
    create policy "Customers can manage own delivery cycle items"
      on public.delivery_cycle_items for all
      using (exists (select 1 from public.delivery_cycles dc where dc.id = delivery_cycle_id and dc.customer_id = auth.uid()))
      with check (exists (select 1 from public.delivery_cycles dc where dc.id = delivery_cycle_id and dc.customer_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='delivery_cycle_items' and policyname='Admins can view all delivery cycle items') then
    create policy "Admins can view all delivery cycle items"
      on public.delivery_cycle_items for select
      using (auth.jwt() ->> 'role' = 'admin');
  end if;
end $$;

-- Trigger to keep delivery_cycles.estimated_total in sync
create or replace function public.sync_delivery_cycle_total()
returns trigger
language plpgsql
as $$
begin
  update public.delivery_cycles dc
  set estimated_total = (
    select coalesce(sum(p.price * dci.quantity),0)
    from public.delivery_cycle_items dci
    join public.products p on p.id = dci.product_id
    where dci.delivery_cycle_id = coalesce(new.delivery_cycle_id, old.delivery_cycle_id)
  )
  where dc.id = coalesce(new.delivery_cycle_id, old.delivery_cycle_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_delivery_cycle_sync_total on public.delivery_cycle_items;
create trigger trg_delivery_cycle_sync_total
  after insert or update or delete on public.delivery_cycle_items
  for each row execute function public.sync_delivery_cycle_total();


-- ===================================================================
-- FILE: supabase/migrations/20260922150000_notifications_realtime.sql
-- ===================================================================
-- Enable Realtime for notifications (and favorites for cross-device, plus products for stock)
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.favorites;
alter publication supabase_realtime add table public.products;
alter publication supabase_realtime add table public.inventory_items;


-- ===================================================================
-- FILE: supabase/migrations/20260922160000_audit_triggers.sql
-- ===================================================================
-- Audit triggers: populate audit_entries on key mutations (was empty — audit screen showed nothing)

-- Make actor_id nullable to allow system-triggered audits without FK violation fallback
alter table public.audit_entries alter column actor_id drop not null;

create or replace function public.audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_action text;
  v_record_type text := TG_TABLE_NAME;
  v_record_id uuid;
  v_old jsonb;
  v_new jsonb;
begin
  -- Resolve actor: authenticated user or fallback to row owner
  v_actor := auth.uid();
  if v_actor is null then
    -- try to derive from row
    if TG_OP = 'DELETE' then
      v_actor := coalesce((OLD::jsonb ->> 'customer_id')::uuid, (OLD::jsonb ->> 'user_id')::uuid, (OLD::jsonb ->> 'actor_id')::uuid);
    else
      v_actor := coalesce((NEW::jsonb ->> 'customer_id')::uuid, (NEW::jsonb ->> 'user_id')::uuid, (NEW::jsonb ->> 'actor_id')::uuid);
    end if;
  end if;

  if TG_OP = 'INSERT' then
    v_action := 'INSERT';
    v_record_id := coalesce((NEW::jsonb ->> 'id')::uuid, gen_random_uuid());
    v_new := to_jsonb(NEW);
  elsif TG_OP = 'UPDATE' then
    v_action := 'UPDATE';
    v_record_id := coalesce((NEW::jsonb ->> 'id')::uuid, (OLD::jsonb ->> 'id')::uuid);
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  elsif TG_OP = 'DELETE' then
    v_action := 'DELETE';
    v_record_id := (OLD::jsonb ->> 'id')::uuid;
    v_old := to_jsonb(OLD);
  end if;

  -- Only log if we can identify an actor or still log with null (admin will see it)
  insert into public.audit_entries (actor_id, action, record_type, record_id, old_value, new_value)
  values (v_actor, v_action, v_record_type, v_record_id, v_old, v_new);

  return coalesce(NEW, OLD);
exception when others then
  -- Never break main transaction due to audit failure
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trg_audit_orders on public.orders;
create trigger trg_audit_orders after insert or update or delete on public.orders for each row execute function public.audit_log();

drop trigger if exists trg_audit_products on public.products;
create trigger trg_audit_products after insert or update or delete on public.products for each row execute function public.audit_log();

drop trigger if exists trg_audit_inventory on public.inventory_items;
create trigger trg_audit_inventory after insert or update or delete on public.inventory_items for each row execute function public.audit_log();

drop trigger if exists trg_audit_returns on public.return_requests;
create trigger trg_audit_returns after insert or update or delete on public.return_requests for each row execute function public.audit_log();

drop trigger if exists trg_audit_delivery_cycles on public.delivery_cycles;
create trigger trg_audit_delivery_cycles after insert or update or delete on public.delivery_cycles for each row execute function public.audit_log();

drop trigger if exists trg_audit_order_items on public.order_items;
create trigger trg_audit_order_items after insert or update or delete on public.order_items for each row execute function public.audit_log();


-- ===================================================================
-- FILE: supabase/migrations/20260922170000_fix_audit_log.sql
-- ===================================================================
-- Fix audit_log: NEW::jsonb is invalid for record, use to_jsonb(NEW)
create or replace function public.audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_action text;
  v_record_type text := TG_TABLE_NAME;
  v_record_id uuid;
  v_old jsonb;
  v_new jsonb;
begin
  v_actor := auth.uid();
  if v_actor is null then
    if TG_OP = 'DELETE' then
      v_actor := coalesce((to_jsonb(OLD) ->> 'customer_id')::uuid, (to_jsonb(OLD) ->> 'user_id')::uuid, (to_jsonb(OLD) ->> 'actor_id')::uuid);
    else
      v_actor := coalesce((to_jsonb(NEW) ->> 'customer_id')::uuid, (to_jsonb(NEW) ->> 'user_id')::uuid, (to_jsonb(NEW) ->> 'actor_id')::uuid);
    end if;
  end if;

  if TG_OP = 'INSERT' then
    v_action := 'INSERT';
    v_record_id := coalesce((to_jsonb(NEW) ->> 'id')::uuid, gen_random_uuid());
    v_new := to_jsonb(NEW);
  elsif TG_OP = 'UPDATE' then
    v_action := 'UPDATE';
    v_record_id := coalesce((to_jsonb(NEW) ->> 'id')::uuid, (to_jsonb(OLD) ->> 'id')::uuid);
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  elsif TG_OP = 'DELETE' then
    v_action := 'DELETE';
    v_record_id := (to_jsonb(OLD) ->> 'id')::uuid;
    v_old := to_jsonb(OLD);
  end if;

  insert into public.audit_entries (actor_id, action, record_type, record_id, old_value, new_value)
  values (v_actor, v_action, v_record_type, v_record_id, v_old, v_new);

  return coalesce(NEW, OLD);
exception when others then
  return coalesce(NEW, OLD);
end;
$$;


-- ===================================================================
-- FILE: supabase/migrations/20260922180000_customers_stats.sql
-- ===================================================================
-- SVC-02: customers N+1 -> server-side aggregation + pagination
-- Replaces client-side select profiles then select * orders per customer
create or replace function public.get_customers_with_stats(
  p_query text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid,
  name text,
  email text,
  phone text,
  role text,
  created_at timestamptz,
  order_count bigint,
  total_spent numeric
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.name,
    p.email,
    p.phone,
    p.role,
    p.created_at,
    coalesce(o.order_count, 0) as order_count,
    coalesce(o.total_spent, 0) as total_spent
  from public.profiles p
  left join (
    select customer_id, count(*)::bigint as order_count, sum(total)::numeric as total_spent
    from public.orders
    group by customer_id
  ) o on o.customer_id = p.id
  where p.role = 'customer'
    and (
      p_query is null or p_query = ''
      or p.name ilike '%' || p_query || '%'
      or coalesce(p.email,'') ilike '%' || p_query || '%'
      or coalesce(p.phone,'') ilike '%' || p_query || '%'
    )
  order by p.created_at desc
  limit p_limit offset p_offset;
$$;

grant execute on function public.get_customers_with_stats(text, int, int) to authenticated;

-- Also helper for single customer stats (used by fetchCustomerById fallback remains, but keep RPC consistent)
create or replace function public.get_customer_stats(p_customer_id uuid)
returns table (order_count bigint, total_spent numeric)
language sql
security definer
set search_path = public
as $$
  select count(*)::bigint as order_count, coalesce(sum(total),0)::numeric as total_spent
  from public.orders where customer_id = p_customer_id;
$$;

grant execute on function public.get_customer_stats(uuid) to authenticated;


-- ===================================================================
-- FILE: supabase/migrations/20260922200000_create_order_append_pending.sql
-- ===================================================================
-- INV-01: single-invoice rule — append to existing PENDING order instead of creating new ORD-
-- Rule: user = x orders multiple products from one account → all add into one single invoice (PENDING)
-- After client accepts (status != PENDING, e.g. CONFIRMED via transition_order_status), next checkout creates separated invoice
create or replace function public.create_order(p_customer_id uuid, p_address_id uuid)
returns uuid
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_existing_id uuid;
  v_existing_subtotal numeric;
  v_existing_discount numeric;
  v_existing_delivery_fee numeric;
  v_subtotal numeric := 0;
  v_cart_subtotal numeric := 0;
  v_discount numeric := 0;
  v_delivery_fee numeric := 150;
  v_total numeric := 0;
  v_customer_name text;
  v_address_text text;
  v_cart_item record;
  v_product record;
begin
  select name into v_customer_name from public.profiles where id = p_customer_id;
  if not found then
    raise exception 'Customer not found';
  end if;
  if not exists (select 1 from public.cart_items where user_id = p_customer_id) then
    raise exception 'Cart is empty';
  end if;

  select street || ', ' || city || coalesce(', ' || county, '') || coalesce(', ' || postal_code, '')
    into v_address_text from public.addresses where id = p_address_id;
  if v_address_text is null then
    v_address_text := '';
  end if;

  -- Check for existing PENDING invoice for this customer (row-level lock to prevent race)
  select id, subtotal, discount, delivery_fee into v_existing_id, v_existing_subtotal, v_existing_discount, v_existing_delivery_fee
  from public.orders
  where customer_id = p_customer_id and status = 'PENDING'
  order by created_at desc
  limit 1
  for update;

  -- Validate cart items and compute cart subtotal
  for v_cart_item in select * from public.cart_items where user_id = p_customer_id loop
    select * into v_product from public.products where id = v_cart_item.product_id and is_active = true;
    if not found then
      raise exception 'Product not available';
    end if;
    if v_product.stock < v_cart_item.quantity then
      raise exception 'Insufficient stock for product %', v_product.name;
    end if;
    v_cart_subtotal := v_cart_subtotal + (v_product.price * v_cart_item.quantity);
  end loop;

  if v_existing_id is not null then
    -- Append to existing PENDING invoice
    v_order_id := v_existing_id;
    -- Insert new order_items into existing order
    for v_cart_item in select * from public.cart_items where user_id = p_customer_id loop
      select * into v_product from public.products where id = v_cart_item.product_id;
      -- Handle duplicate product in same order: merge quantity if already exists
      if exists (select 1 from public.order_items where order_id = v_order_id and product_id = v_cart_item.product_id) then
        update public.order_items
        set quantity = quantity + v_cart_item.quantity,
            total = (quantity + v_cart_item.quantity) * v_product.price
        where order_id = v_order_id and product_id = v_cart_item.product_id;
      else
        insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, discount_percent, total)
        values (v_order_id, v_cart_item.product_id, v_product.name, v_cart_item.quantity, v_product.price, 0, v_product.price * v_cart_item.quantity);
      end if;
      update public.products set stock = stock - v_cart_item.quantity where id = v_cart_item.product_id;
    end loop;
    -- Recalc totals: subtotal + cart, keep single delivery fee
    v_subtotal := coalesce(v_existing_subtotal, 0) + v_cart_subtotal;
    v_total := v_subtotal - coalesce(v_existing_discount, 0) + coalesce(v_existing_delivery_fee, v_delivery_fee);
    update public.orders
    set subtotal = v_subtotal,
        total = v_total,
        updated_at = now(),
        -- Optionally update address to latest if provided
        address = case when v_address_text <> '' then v_address_text else address end,
        timeline = coalesce(timeline, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('label', 'ITEMS_ADDED', 'time', now()::text, 'note', v_cart_subtotal::text || ' added'))
    where id = v_order_id;
  else
    -- No pending invoice: create new as before
    v_subtotal := v_cart_subtotal;
    v_total := v_subtotal - v_discount + v_delivery_fee;
    insert into public.orders (order_number, customer_id, customer_name, status, subtotal, discount, delivery_fee, total, payment_method, address)
    values (null, p_customer_id, v_customer_name, 'PENDING', v_subtotal, v_discount, v_delivery_fee, v_total, 'CASH_ON_DELIVERY', v_address_text)
    returning id into v_order_id;
    for v_cart_item in select * from public.cart_items where user_id = p_customer_id loop
      select * into v_product from public.products where id = v_cart_item.product_id;
      insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, discount_percent, total)
      values (v_order_id, v_cart_item.product_id, v_product.name, v_cart_item.quantity, v_product.price, 0, v_product.price * v_cart_item.quantity);
      update public.products set stock = stock - v_cart_item.quantity where id = v_cart_item.product_id;
    end loop;
  end if;

  delete from public.cart_items where user_id = p_customer_id;
  return v_order_id;
end;
$$ language plpgsql;


-- ===================================================================
-- FILE: supabase/migrations/20260922210000_stock_auto_deactivate.sql
-- ===================================================================
-- STK-02 + STK-03: auto-deactivate product when stock 0, low-stock warnings, and notifications
-- Extends sync_product_stock to also manage is_active and notifications

create or replace function public.sync_product_stock()
returns trigger
security definer
set search_path = public
as $$
declare
  v_product_id uuid;
  v_new_stock integer;
  v_product_name text;
  v_old_stock integer;
begin
  v_product_id := coalesce(NEW.product_id, OLD.product_id);
  -- Recalc stock
  select coalesce(sum(quantity), 0) into v_new_stock
  from public.inventory_items
  where product_id = v_product_id;

  -- Get product name for notifications
  select name into v_product_name from public.products where id = v_product_id;

  -- Get old stock for threshold comparisons
  if TG_OP = 'DELETE' then
    v_old_stock := coalesce((select stock from public.products where id = v_product_id), v_new_stock + coalesce(OLD.quantity,0));
  elsif TG_OP = 'UPDATE' then
    -- before trigger sync, products.stock still holds old value
    select stock into v_old_stock from public.products where id = v_product_id;
  else
    select stock into v_old_stock from public.products where id = v_product_id;
  end if;

  -- Update products stock and is_active
  update public.products
  set stock = v_new_stock,
      is_active = case
        when v_new_stock <= 0 then false
        when v_old_stock <= 0 and v_new_stock > 0 then true -- auto-reactivate on restock
        else is_active
      end
  where id = v_product_id;

  -- Notifications
  -- Case 1: stock just hit 0 (out of stock) -> deactivate
  if v_new_stock <= 0 and coalesce(v_old_stock, 0) > 0 then
    -- Notify customers with product in cart, favorites, or past orders + all admins
    insert into public.notifications (user_id, title, body, type)
    select distinct user_id, 'Out of stock: ' || v_product_name, v_product_name || ' is now hidden — restock to reactivate. Stock 0.', 'alert'
    from (
      select user_id from public.cart_items where product_id = v_product_id
      union
      select user_id from public.favorites where product_id = v_product_id
      union
      select customer_id as user_id from public.orders o join public.order_items oi on oi.order_id = o.id where oi.product_id = v_product_id
      union
      select id as user_id from public.profiles where role = 'admin'
    ) u;
  -- Case 2: low stock threshold crossed (config.lowStockThreshold = 10)
  elsif v_new_stock > 0 and v_new_stock < 10 and coalesce(v_old_stock, 0) >= 10 then
    insert into public.notifications (user_id, title, body, type)
    select distinct id as user_id, 'Low stock: ' || v_product_name, v_product_name || ' only ' || v_new_stock || ' left — consider restocking.', 'warning'
    from public.profiles where role = 'admin';
  end if;

  return coalesce(NEW, OLD);
end;
$$ language plpgsql;

-- Ensure trigger still exists (it was created in initial_schema); recreate to ensure security definer
drop trigger if exists trg_inventory_sync_stock on public.inventory_items;
create trigger trg_inventory_sync_stock
  after insert or update or delete on public.inventory_items
  for each row execute function public.sync_product_stock();

-- Also handle direct products.stock updates (if admin edits stock directly)
create or replace function public.handle_product_stock_change()
returns trigger
security definer
set search_path = public
as $$
declare
  v_product_name text := NEW.name;
begin
  if NEW.stock <= 0 and OLD.stock > 0 and NEW.is_active = true then
    NEW.is_active := false;
    insert into public.notifications (user_id, title, body, type)
    select distinct user_id, 'Out of stock: ' || v_product_name, v_product_name || ' is now hidden — restock to reactivate. Stock 0.', 'alert'
    from (
      select user_id from public.cart_items where product_id = NEW.id
      union
      select user_id from public.favorites where product_id = NEW.id
      union
      select customer_id as user_id from public.orders o join public.order_items oi on oi.order_id = o.id where oi.product_id = NEW.id
      union
      select id as user_id from public.profiles where role = 'admin'
    ) u;
  elsif NEW.stock > 0 and NEW.stock < 10 and OLD.stock >= 10 then
    insert into public.notifications (user_id, title, body, type)
    select distinct id as user_id, 'Low stock: ' || v_product_name, v_product_name || ' only ' || NEW.stock || ' left — consider restocking.', 'warning'
    from public.profiles where role = 'admin';
  elsif NEW.stock > 0 and OLD.stock <= 0 and NEW.is_active = false then
    -- Auto-reactivate if stock restored and was deactivated due to stock
    NEW.is_active := true;
  end if;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists trg_product_stock_check on public.products;
create trigger trg_product_stock_check
  before update of stock on public.products
  for each row execute function public.handle_product_stock_change();


-- ── Record migrations as applied (so a later `supabase db push` is a no-op) ──
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, name text, statements text[], executed_at timestamptz default now());
insert into supabase_migrations.schema_migrations (version, name) values
('20260918010000_initial_schema'),
('20260918020000_fix_admin_rls'),
('20260918030000_fix_stock_and_storage'),
('20260918040000_fix_cart_and_discount'),
('20260918050000_expiry_and_concurrency'),
('20260918060000_prod_auth_hardening'),
('20260918070000_prod_ecom_no_phone_admin'),
('20260918080000_fix_phone_bd_and_seed'),
('20260918090000_is_admin_local_parity'),
('20260918100000_favorites'),
('20260918110000_cost_price'),
('20260922120000_storage_buckets'),
('20260922130000_dashboard_aggregates'),
('20260922140000_delivery_cycle_items'),
('20260922150000_notifications_realtime'),
('20260922160000_audit_triggers'),
('20260922170000_fix_audit_log'),
('20260922180000_customers_stats'),
('20260922200000_create_order_append_pending'),
('20260922210000_stock_auto_deactivate'),
('20260923090000_fix_order_inventory_sync'),
('20260926100000_phone_e164_canonical'),
('20260926110000_customers_avatar'),
('20260926120000_product_search_indexes'),
('20260926130000_product_browse_search_rpc'),
('20260926140000_create_product_atomic'),
('20260926150000_manufacturer_name_unique')
on conflict (version) do nothing;


-- ══════════════════════════════════════════════════════════════
-- MIGRATION 20260923090000 (bug-hunt fix pass 2)
-- ══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- BUG-HUNT FIX PASS 2 — schema/DB fixes discovered during the project bug-hunt.
-- FIX refs:
--  BUG-B1 create_order no longer decrements inventory_items (replaced the FIFO
--         version) — orders only dropped products.stock, so the batch ledger
--         stayed full. Any later inventory change ran sync_product_stock and
--         snapped products.stock back up (stock "reappared"). Restored FIFO
--         deduction (non-expired, expiry-first) with products.stock fallback
--         only for legacy products that have no inventory rows.
--  BUG-B2 apply_stock_adjustment silently did nothing when batch_number was not
--         found — the adjustment row persisted with zero effect. Now raises.
--  BUG-B3 sync_delivery_cycle_total fired as SECURITY INVOKER, and delivery_cycles
--         had NO customer UPDATE policy — so the trigger's UPDATE was silently
--         filtered by RLS and estimated_total stayed 0 on the customer screen.
--         Added customer update + admin manage policies and made the trigger
--         SECURITY DEFINER.
--  BUG-B4 transition_order_status stopped appending timeline entries — the admin
--         order Timeline only ever showed ITEMS_ADDED. Restored STATUS_CHANGED.
--  BUG-B5 generate_order_number used count(*)+1 with a UNIQUE column — a race
--         between two inserts could collide on ORD-XXXX and fail the order.
--         Serialized with an advisory xact lock.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- BUG-B5: serialize order_number generation
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.generate_order_number()
returns text as $$
declare
  v_count integer;
  v_number text;
begin
  -- Serialize generators so two concurrent create_order calls cannot produce
  -- the same ORD-XXXX (order_number is UNIQUE).
  perform pg_advisory_xact_lock(hashtext('hibbullah_generate_order_number'));
  select count(*) + 1 into v_count from public.orders;
  v_number := 'ORD-' || lpad(v_count::text, 4, '0');
  return v_number;
end;
$$ language plpgsql;

-- ───────────────────────────────────────────────────────────────────────────
-- BUG-B1: create_order — append-to-PENDING + FIFO inventory deduction
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.create_order(p_customer_id uuid, p_address_id uuid)
returns uuid
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_existing_id uuid;
  v_existing_subtotal numeric;
  v_existing_discount numeric;
  v_existing_delivery_fee numeric;
  v_subtotal numeric := 0;
  v_cart_subtotal numeric := 0;
  v_discount numeric := 0;
  v_delivery_fee numeric := 150;
  v_total numeric := 0;
  v_customer_name text;
  v_address_text text;
  v_cart_item record;
  v_product record;
  v_inv record;
  v_remaining integer;
  v_total_stock integer;
begin
  select name into v_customer_name from public.profiles where id = p_customer_id;
  if not found then
    raise exception 'Customer not found';
  end if;
  if not exists (select 1 from public.cart_items where user_id = p_customer_id) then
    raise exception 'Cart is empty';
  end if;

  select street || ', ' || city || coalesce(', ' || county, '') || coalesce(', ' || postal_code, '')
    into v_address_text from public.addresses where id = p_address_id;
  if v_address_text is null then
    v_address_text := '';
  end if;

  -- Check for existing PENDING invoice for this customer (row-level lock to prevent race)
  select id, subtotal, discount, delivery_fee into v_existing_id, v_existing_subtotal, v_existing_discount, v_existing_delivery_fee
  from public.orders
  where customer_id = p_customer_id and status = 'PENDING'
  order by created_at desc
  limit 1
  for update;

  -- Validate cart items and compute cart subtotal (products must exist and be active)
  for v_cart_item in select * from public.cart_items where user_id = p_customer_id loop
    select * into v_product from public.products where id = v_cart_item.product_id and is_active = true;
    if not found then
      raise exception 'Product not available';
    end if;
    -- Authoritative available stock = non-expired inventory sum, falling back to
    -- products.stock only for legacy products with no inventory rows at all.
    select coalesce(sum(quantity), 0) into v_total_stock
    from public.inventory_items
    where product_id = v_cart_item.product_id
      and (expiry_date is null or expiry_date >= current_date);
    if v_total_stock = 0 and not exists (select 1 from public.inventory_items where product_id = v_cart_item.product_id) then
      v_total_stock := v_product.stock;
    end if;
    if v_total_stock < v_cart_item.quantity then
      raise exception 'Insufficient stock for product %', v_product.name;
    end if;
    v_cart_subtotal := v_cart_subtotal + (v_product.price * v_cart_item.quantity);
  end loop;

  if v_existing_id is not null then
    -- Append to existing PENDING invoice
    v_order_id := v_existing_id;
    for v_cart_item in select * from public.cart_items where user_id = p_customer_id loop
      select * into v_product from public.products where id = v_cart_item.product_id;
      -- Handle duplicate product in same order: merge quantity if already exists
      if exists (select 1 from public.order_items where order_id = v_order_id and product_id = v_cart_item.product_id) then
        update public.order_items
        set quantity = quantity + v_cart_item.quantity,
            total = (quantity + v_cart_item.quantity) * v_product.price
        where order_id = v_order_id and product_id = v_cart_item.product_id;
      else
        insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, discount_percent, total)
        values (v_order_id, v_cart_item.product_id, v_product.name, v_cart_item.quantity, v_product.price, 0, v_product.price * v_cart_item.quantity);
      end if;
      perform public.deduct_inventory_fifo(v_cart_item.product_id, v_cart_item.quantity);
    end loop;
    -- Recalc totals: subtotal + cart, keep single delivery fee
    v_subtotal := coalesce(v_existing_subtotal, 0) + v_cart_subtotal;
    v_total := v_subtotal - coalesce(v_existing_discount, 0) + coalesce(v_existing_delivery_fee, v_delivery_fee);
    update public.orders
    set subtotal = v_subtotal,
        total = v_total,
        updated_at = now(),
        -- Optionally update address to latest if provided
        address = case when v_address_text <> '' then v_address_text else address end,
        timeline = coalesce(timeline, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('label', 'ITEMS_ADDED', 'time', now()::text, 'note', v_cart_subtotal::text || ' added'))
    where id = v_order_id;
  else
    -- No pending invoice: create new as before
    v_subtotal := v_cart_subtotal;
    v_total := v_subtotal - v_discount + v_delivery_fee;
    insert into public.orders (order_number, customer_id, customer_name, status, subtotal, discount, delivery_fee, total, payment_method, address)
    values (null, p_customer_id, v_customer_name, 'PENDING', v_subtotal, v_discount, v_delivery_fee, v_total, 'CASH_ON_DELIVERY', v_address_text)
    returning id into v_order_id;
    for v_cart_item in select * from public.cart_items where user_id = p_customer_id loop
      select * into v_product from public.products where id = v_cart_item.product_id;
      insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, discount_percent, total)
      values (v_order_id, v_cart_item.product_id, v_product.name, v_cart_item.quantity, v_product.price, 0, v_product.price * v_cart_item.quantity);
      perform public.deduct_inventory_fifo(v_cart_item.product_id, v_cart_item.quantity);
    end loop;
  end if;

  delete from public.cart_items where user_id = p_customer_id;
  return v_order_id;
end;
$$ language plpgsql;

-- Helper shared by both create_order branches: deduct qty from non-expired
-- inventory FIFO (NULL expiry = never expires, sorted last but still usable).
-- products.stock is kept in sync automatically by trg_inventory_sync_stock
-- (defined in the stock_auto_deactivate migration) which also handles the
-- auto-deactivate/notification side effects. Legacy products with NO inventory
-- rows fall back to a direct products.stock decrement.
create or replace function public.deduct_inventory_fifo(p_product_id uuid, p_quantity integer)
returns void
security definer
set search_path = public
as $$
declare
  v_remaining integer := p_quantity;
  v_inv record;
begin
  -- Lock the batch rows so validation + deduction see a consistent snapshot
  for v_inv in
    select id, quantity from public.inventory_items
    where product_id = p_product_id
      and quantity > 0
      and (expiry_date is null or expiry_date >= current_date)
    order by
      case when expiry_date is null then 1 else 0 end,
      expiry_date asc,
      last_updated asc
    for update
  loop
    exit when v_remaining <= 0;
    if v_inv.quantity >= v_remaining then
      update public.inventory_items set quantity = quantity - v_remaining where id = v_inv.id;
      v_remaining := 0;
    else
      v_remaining := v_remaining - v_inv.quantity;
      update public.inventory_items set quantity = 0 where id = v_inv.id;
    end if;
  end loop;

  -- Concurrent safety: if still remaining, stock was consumed between validation and deduction
  if v_remaining > 0 and exists (select 1 from public.inventory_items where product_id = p_product_id) then
    raise exception 'Insufficient stock for product';
  end if;

  -- Legacy fallback if the product has no inventory rows at all
  if v_remaining = p_quantity then
    update public.products set stock = stock - p_quantity where id = p_product_id;
  end if;
end;
$$ language plpgsql;

-- ───────────────────────────────────────────────────────────────────────────
-- BUG-B2: stock adjustments must not silently no-op
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.apply_stock_adjustment()
returns trigger as $$
declare
  v_inventory public.inventory_items%rowtype;
begin
  select * into v_inventory
    from public.inventory_items
    where product_id = new.product_id and batch_number = new.batch_number
    for update;

  if not found then
    raise exception 'No inventory batch "%" found for this product — adjustment would have no effect', new.batch_number;
  end if;

  if new.type = 'increase' then
    v_inventory.quantity := v_inventory.quantity + new.quantity;
  else
    v_inventory.quantity := greatest(v_inventory.quantity - new.quantity, 0);
  end if;
  update public.inventory_items
    set quantity = v_inventory.quantity,
        last_updated = now()
    where id = v_inventory.id;

  return new;
end;
$$ language plpgsql;

-- ───────────────────────────────────────────────────────────────────────────
-- BUG-B3: delivery cycle totals blocked by RLS
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.sync_delivery_cycle_total()
returns trigger
security definer
set search_path = public
as $$
begin
  update public.delivery_cycles dc
  set estimated_total = (
    select coalesce(sum(p.price * dci.quantity),0)
    from public.delivery_cycle_items dci
    join public.products p on p.id = dci.product_id
    where dci.delivery_cycle_id = dc.id
  )
  where dc.id = coalesce(NEW.delivery_cycle_id, OLD.delivery_cycle_id);
  return null;
end;
$$ language plpgsql;

-- Customers must be able to update their own cycle (the trigger above runs as
-- the invoker — a customer inserting delivery_cycle_items — and needs an UPDATE
-- policy for its estimated_total write; without one RLS silently filtered it).
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='delivery_cycles' and policyname='Customers can update own delivery cycles') then
    create policy "Customers can update own delivery cycles"
      on public.delivery_cycles for update
      using (auth.uid() = customer_id)
      with check (auth.uid() = customer_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='delivery_cycles' and policyname='Admins can manage delivery cycles') then
    create policy "Admins can manage delivery cycles"
      on public.delivery_cycles for all
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- BUG-B4: restore timeline entries for order status transitions
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.transition_order_status(p_order_id uuid, p_new_status text, p_admin_id uuid)
returns boolean
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_current_status text;
  v_allowed boolean := false;
begin
  if not public.is_admin() then
    raise exception 'Only admins can change order status';
  end if;
  if p_admin_id is distinct from auth.uid() then
    raise exception 'Admin ID must match authenticated user';
  end if;
  if not exists (select 1 from auth.users where id = p_admin_id and lower(email) in ('icrmahin@gmail.com','hibbullah82026@gmail.com')) then
    raise exception 'Only allowlisted admins can change order status';
  end if;
  select status into v_current_status from public.orders where id = p_order_id;
  if not found then
    raise exception 'Order not found';
  end if;
  v_allowed := (
    (v_current_status = 'PENDING' and p_new_status in ('CONFIRMED', 'CANCELLED')) or
    (v_current_status = 'CONFIRMED' and p_new_status in ('PROCESSING', 'CANCELLED')) or
    (v_current_status = 'PROCESSING' and p_new_status in ('OUT_FOR_DELIVERY', 'CANCELLED')) or
    (v_current_status = 'OUT_FOR_DELIVERY' and p_new_status in ('DELIVERED')) or
    (v_current_status = 'DELIVERED' and p_new_status in ('RETURNED'))
  );
  if not v_allowed then
    raise exception 'Invalid status transition from % to %', v_current_status, p_new_status;
  end if;
  update public.orders
  set status = p_new_status,
      updated_at = now(),
      timeline = coalesce(timeline, '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object('label', 'STATUS_CHANGED', 'time', now()::text, 'note', v_current_status || ' → ' || p_new_status)
      )
  where id = p_order_id;
  return true;
end;
$$ language plpgsql;


-- ═══════════════════════════════════════════════════════════════════════
-- 20260926100000_phone_e164_canonical.sql
-- ═══════════════════════════════════════════════════════════════════════
-- Canonical E.164 phone storage.
--
-- Problem: the previous check allowed the leading '+' to be optional
-- (phone ~* '^\+?8801[0-9]{9}$'), so '8801865858544' and '+8801865858544'
-- were two different values for the same human number and could occupy two
-- different slots in the partial unique index. The client also had no
-- normalizer, so '01865858544' was rejected outright instead of converted.
--
-- This migration collapses existing rows onto one canonical representation and
-- then makes the database enforce it.

alter table public.profiles drop constraint if exists profiles_phone_format;

-- 1) Collapse rows that normalize to the same E.164 number.
--    The earliest-created row wins; later duplicates get phone = null.
--    This must run before normalization, otherwise the unique index is violated.
with normalized as (
  select
    p.id,
    p.created_at,
    case
      when d like '880%' then '+' || d
      when d like '0%'   then '+880' || substr(d, 2)
      else '+880' || d
    end as e164
  from public.profiles p
  cross join lateral (select regexp_replace(p.phone, '\D', '', 'g') as d) s
  where p.phone is not null and btrim(p.phone) <> ''
),
ranked as (
  select
    id,
    e164,
    row_number() over (partition by e164 order by created_at asc, id asc) as rn
  from normalized
)
update public.profiles p
set phone = null, updated_at = now()
from ranked r
where p.id = r.id and r.rn > 1;

-- 2) Normalize the survivors to '+8801XXXXXXXXX'.
update public.profiles p
set phone = n.e164, updated_at = now()
from (
  select
    id,
    case
      when d like '880%' then '+' || d
      when d like '0%'   then '+880' || substr(d, 2)
      else '+880' || d
    end as e164
  from (
    select id, regexp_replace(phone, '\D', '', 'g') as d
    from public.profiles
    where phone is not null and btrim(phone) <> ''
  ) s
) n
where p.id = n.id and p.phone <> n.e164;

-- 3) The leading '+' is now mandatory. The constraint name is reused so future
--    drop/replace cycles stay a one-liner.
alter table public.profiles
  add constraint profiles_phone_format
  check (phone is null or btrim(phone) = '' or phone ~ '^\+8801[0-9]{9}$');


-- ═══════════════════════════════════════════════════════════════════════
-- 20260926110000_customers_avatar.sql
-- ═══════════════════════════════════════════════════════════════════════
-- Expose profiles.avatar_url through the admin customer RPC.
--
-- get_customers_with_stats is SECURITY DEFINER and is the only data path the
-- admin customer list/detail screens use, so without avatar_url here the
-- admin can never see a customer's profile picture.
--
-- The signature and the body are otherwise identical to the 20260922180000
-- definition: same defaults, same p.role = 'customer' filter, same
-- pre-aggregated subquery (which is what keeps this one round trip instead of
-- N+1). Only the return table and select list gain avatar_url.

-- CREATE OR REPLACE cannot change a function's return type, and adding
-- avatar_url to the return table is exactly that. Postgres rejects it with
-- "cannot change return type of existing function", so the old signature is
-- dropped first. Nothing else depends on this function.
drop function if exists public.get_customers_with_stats(text, int, int);

create or replace function public.get_customers_with_stats(
  p_query text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid,
  name text,
  email text,
  phone text,
  role text,
  avatar_url text,
  created_at timestamptz,
  order_count bigint,
  total_spent numeric
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.name,
    p.email,
    p.phone,
    p.role,
    p.avatar_url,
    p.created_at,
    coalesce(o.order_count, 0) as order_count,
    coalesce(o.total_spent, 0) as total_spent
  from public.profiles p
  left join (
    select customer_id, count(*)::bigint as order_count, sum(total)::numeric as total_spent
    from public.orders
    group by customer_id
  ) o on o.customer_id = p.id
  where p.role = 'customer'
    and (
      p_query is null or p_query = ''
      or p.name ilike '%' || p_query || '%'
      or coalesce(p.email,'') ilike '%' || p_query || '%'
      or coalesce(p.phone,'') ilike '%' || p_query || '%'
    )
  order by p.created_at desc
  limit p_limit offset p_offset;
$$;

-- Postgres grants EXECUTE on new functions to PUBLIC by default. This function
-- is SECURITY DEFINER and reads every customer profile, so close that off.
revoke execute on function public.get_customers_with_stats(text, int, int) from public;
grant execute on function public.get_customers_with_stats(text, int, int) to authenticated;


-- ──────────────────────────────────────────────────────────────────────
-- 20260926120000_product_search_indexes.sql
-- ──────────────────────────────────────────────────────────────────────
-- Indexes for product browsing and search.
--
-- Before this, every list query sorted by products.created_at with no index on
-- it, so each page was a full sort of the filtered set. OFFSET paging over an
-- unindexed sort key also has no stable tiebreaker, which is how rows get
-- skipped or duplicated when two products share a created_at.
--
-- (is_active, created_at desc, id desc) also matches the
-- "Anyone can view active products" RLS predicate, so the visibility filter and
-- the ordering are served by one index.

create index if not exists idx_products_active_created
  on public.products (is_active, created_at desc, id desc);

create index if not exists idx_products_created
  on public.products (created_at desc, id desc);

-- Prefix search support: lower(name) LIKE 'x%' is the query shape the app sends
-- most often, and text_pattern_ops is what makes that an index range scan. The
-- existing trigram GIN indexes (initial_schema.sql:152-155) stay for contains
-- and similarity matching.
create index if not exists idx_products_name_prefix
  on public.products (lower(name) text_pattern_ops);

-- Both are order('name')-sorted by fetchCategories / fetchManufacturers.
create index if not exists idx_categories_name
  on public.categories (lower(name));

create index if not exists idx_manufacturers_name
  on public.manufacturers (lower(name));

-- The two lookups above are searched with ilike '%term%', which cannot use a
-- btree index, so at a few thousand rows each keystroke was a sequential scan.
-- The trigram GIN index turns the substring match into a bitmap scan, and the
-- name column is bounded by 120 characters so the index size stays small.
create extension if not exists pg_trgm;

create index if not exists idx_categories_name_trgm
  on public.categories using gin (name gin_trgm_ops);

create index if not exists idx_manufacturers_name_trgm
  on public.manufacturers using gin (name gin_trgm_ops);


-- ═══════════════════════════════════════════════════════════════════════
-- 20260926130000_product_browse_search_rpc.sql
-- ═══════════════════════════════════════════════════════════════════════
-- Server-side product browse + search.
--
-- Before this, search was a leading-'%' ILIKE OR'd across three columns,
-- duplicated in four places (products.ts:46, products.ts:135, admin.ts:260, plus
-- two client-side .includes filters), fired on every keystroke with no debounce,
-- and paired with count:'exact' — a full table count per keystroke on top of a
-- per-row is_admin() RLS evaluation. PostgREST's .or() + .eq() + .order() +
-- .range() combination also frequently could not reach the existing trigram
-- indexes.
--
-- Two functions rather than one, deliberately: a single merged function would be
-- forced to compute a count(*) over () total, which is exactly the full-count
-- cost this migration exists to remove. Browse mode returns no total at all.

-- ---------------------------------------------------------------------------
-- browse_products: keyset (cursor) paging, no count.
-- ---------------------------------------------------------------------------
create or replace function public.browse_products(
  p_category uuid default null,
  p_manufacturer uuid default null,
  p_status text default null,
  p_stock text default null,
  p_low_stock_threshold integer default 10,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit int default 24
)
returns table (
  id uuid,
  name text,
  brand text,
  generic_name text,
  description text,
  manufacturer_id uuid,
  category_id uuid,
  price numeric,
  original_price numeric,
  discount_percent integer,
  cost_price numeric,
  stock integer,
  unit text,
  image_url text,
  secondary_image_url text,
  is_active boolean,
  is_featured boolean,
  created_at timestamptz,
  updated_at timestamptz,
  category_name text,
  category_slug text,
  manufacturer_name text
)
language sql
stable
-- SECURITY INVOKER is deliberate. It keeps the existing RLS on products
-- (20260918020000_fix_admin_rls.sql:55-68 — active-only for everyone, all rows
-- for admins) in force. A SECURITY DEFINER version would bypass RLS and leak
-- inactive products to customers. Do not "optimize" this into definer.
security invoker
set search_path = public
as $$
  select
    p.id,
    p.name,
    p.brand,
    p.generic_name,
    p.description,
    p.manufacturer_id,
    p.category_id,
    p.price,
    p.original_price,
    p.discount_percent,
    p.cost_price,
    p.stock,
    p.unit,
    p.image_url,
    p.secondary_image_url,
    p.is_active,
    p.is_featured,
    p.created_at,
    p.updated_at,
    c.name,
    c.slug,
    m.name
  from public.products p
  join public.categories c on c.id = p.category_id
  join public.manufacturers m on m.id = p.manufacturer_id
  where (p_category is null or p.category_id = p_category)
    and (p_manufacturer is null or p.manufacturer_id = p_manufacturer)
    and (
      p_status is null
      or (p_status = 'active' and p.is_active)
      or (p_status = 'inactive' and not p.is_active)
    )
    and (
      p_stock is null
      or (p_stock = 'in_stock' and p.stock > 0)
      or (p_stock = 'out' and p.stock <= 0)
      or (
        p_stock = 'low'
        and p.stock > 0
        and p.stock < coalesce(p_low_stock_threshold, 10)
      )
    )
    and (
      p_cursor_created_at is null
      or p_cursor_id is null
      or (p.created_at, p.id) < (p_cursor_created_at, p_cursor_id)
    )
  order by p.created_at desc, p.id desc
  limit least(greatest(coalesce(p_limit, 24), 1), 100);
$$;

-- ---------------------------------------------------------------------------
-- search_products: ranked, total included in the same round trip.
--
-- Ranking ladder, cheapest and most predictable first:
--   0 exact name  1 name prefix  2 brand prefix  3 generic prefix
--   4-6 trigram similarity (typo tolerance)  7 everything else
-- Exact/prefix hits always outrank a fuzzy match, so a short or misspelled term
-- degrades to "close enough" instead of noise.
-- ---------------------------------------------------------------------------
create or replace function public.search_products(
  p_query text,
  p_category uuid default null,
  p_manufacturer uuid default null,
  p_status text default null,
  p_stock text default null,
  p_low_stock_threshold integer default 10,
  p_limit int default 24,
  p_offset int default 0
)
returns table (
  id uuid,
  name text,
  brand text,
  generic_name text,
  description text,
  manufacturer_id uuid,
  category_id uuid,
  price numeric,
  original_price numeric,
  discount_percent integer,
  cost_price numeric,
  stock integer,
  unit text,
  image_url text,
  secondary_image_url text,
  is_active boolean,
  is_featured boolean,
  created_at timestamptz,
  updated_at timestamptz,
  category_name text,
  category_slug text,
  manufacturer_name text,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with term as (
    select lower(btrim(coalesce(p_query, ''))) as v
  ),
  matched as (
    select
      p.*,
      c.name as category_name,
      c.slug as category_slug,
      m.name as manufacturer_name,
      case
        when btrim(coalesce(p_query, '')) = '' then 0
        when lower(p.name) = (select v from term) then 0
        when lower(p.name) like (select v from term) || '%' then 1
        when lower(p.brand) like (select v from term) || '%' then 2
        when lower(p.generic_name) like (select v from term) || '%' then 3
        when p.name % (select v from term) then 4
        when p.generic_name % (select v from term) then 5
        when p.brand % (select v from term) then 6
        else 7
      end as rank
    from public.products p
    join public.categories c on c.id = p.category_id
    join public.manufacturers m on m.id = p.manufacturer_id
    where (p_category is null or p.category_id = p_category)
      and (p_manufacturer is null or p.manufacturer_id = p_manufacturer)
      and (
        p_status is null
        or (p_status = 'active' and p.is_active)
        or (p_status = 'inactive' and not p.is_active)
      )
      and (
        p_stock is null
        or (p_stock = 'in_stock' and p.stock > 0)
        or (p_stock = 'out' and p.stock <= 0)
        or (
          p_stock = 'low'
          and p.stock > 0
          and p.stock < coalesce(p_low_stock_threshold, 10)
        )
      )
      and (
        btrim(coalesce(p_query, '')) = ''
        or lower(p.name) like (select v from term) || '%'
        or p.name % (select v from term)
        or p.generic_name % (select v from term)
        or p.brand % (select v from term)
        or p.description % (select v from term)
      )
  )
  select
    mt.id,
    mt.name,
    mt.brand,
    mt.generic_name,
    mt.description,
    mt.manufacturer_id,
    mt.category_id,
    mt.price,
    mt.original_price,
    mt.discount_percent,
    mt.cost_price,
    mt.stock,
    mt.unit,
    mt.image_url,
    mt.secondary_image_url,
    mt.is_active,
    mt.is_featured,
    mt.created_at,
    mt.updated_at,
    mt.category_name,
    mt.category_slug,
    mt.manufacturer_name,
    count(*) over ()
  from matched mt
  order by mt.rank, mt.name, mt.id
  limit least(greatest(coalesce(p_limit, 24), 1), 100)
  offset least(greatest(coalesce(p_offset, 0), 0), 5000);
$$;

grant execute on function public.browse_products(uuid, uuid, text, text, integer, timestamptz, uuid, int)
  to anon, authenticated;
grant execute on function public.search_products(text, uuid, uuid, text, text, integer, int, int)
  to anon, authenticated;


-- ═══════════════════════════════════════════════════════════════════════
-- 20260926140000_create_product_atomic.sql
-- ═══════════════════════════════════════════════════════════════════════
-- Atomic product creation.
--
-- Before this, createProduct() inserted the product row and then inserted the
-- first inventory_items row as a second round trip (products.ts:146-181). A
-- failure on the second left a product with stock = 0 and the form still on
-- screen with a thrown error.
--
-- The product id is supplied by the caller so the client can upload the product
-- image to a stable Cloudinary public_id (products/<productId>) before the
-- insert, and get a single-row insert carrying the final URL.
--
-- products.stock is deliberately inserted as 0: trg_inventory_sync_stock
-- (AFTER INSERT on inventory_items) is what maintains it, so writing it here
-- would be redundant and could drift from the inventory sum.

-- create_product, hardened (migration 20260926180000_create_product_harden.sql):
create or replace function public.create_product(
  p_id uuid,
  p_name text,
  p_brand text,
  p_generic_name text,
  p_manufacturer_id uuid,
  p_category_id uuid,
  p_price numeric,
  p_description text default '',
  p_original_price numeric default null,
  p_discount_percent integer default 0,
  p_cost_price numeric default null,
  p_unit text default 'pack',
  p_image_url text default null,
  p_secondary_image_url text default null,
  p_is_active boolean default true,
  p_is_featured boolean default false,
  p_initial_stock integer default 0,
  p_batch_number text default null,
  p_expiry_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_batch text;
  v_discount integer;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- Backstop for the strict check_discount trigger: without an original price
  -- any discount is meaningless, so drop it instead of failing the upload.
  v_discount := case
    when p_original_price is null then 0
    else coalesce(p_discount_percent, 0)
  end;

  insert into public.products (
    id,
    name,
    brand,
    generic_name,
    description,
    manufacturer_id,
    category_id,
    price,
    original_price,
    discount_percent,
    cost_price,
    unit,
    image_url,
    secondary_image_url,
    is_active,
    is_featured,
    stock
  ) values (
    p_id,
    p_name,
    p_brand,
    p_generic_name,
    coalesce(p_description, ''),
    p_manufacturer_id,
    p_category_id,
    p_price,
    p_original_price,
    v_discount,
    p_cost_price,
    coalesce(p_unit, 'pack'),
    p_image_url,
    p_secondary_image_url,
    coalesce(p_is_active, true),
    coalesce(p_is_featured, false),
    0
  )
  returning id into v_id;

  if coalesce(p_initial_stock, 0) > 0 then
    -- inventory_items.batch_number is NOT NULL and unique per product, so the
    -- default is derived from the product id.
    v_batch := coalesce(
      nullif(btrim(coalesce(p_batch_number, '')), ''),
      'BATCH-' || upper(left(v_id::text, 8)) || '-001'
    );

    insert into public.inventory_items (product_id, batch_number, quantity, expiry_date)
    values (v_id, v_batch, p_initial_stock, p_expiry_date);
  end if;

  return v_id;
end;
$$;

revoke execute on function public.create_product(
  uuid, text, text, text, uuid, uuid, numeric, text,
  numeric, integer, numeric, text, text, text, boolean, boolean, integer, text, date
) from public;

grant execute on function public.create_product(
  uuid, text, text, text, uuid, uuid, numeric, text,
  numeric, integer, numeric, text, text, text, boolean, boolean, integer, text, date
) to authenticated;


revoke execute on function public.create_product(
  uuid, text, text, text, uuid, uuid, numeric, text,
  numeric, integer, numeric, text, text, text, boolean, boolean, integer, text, date
) from public;

grant execute on function public.create_product(
  uuid, text, text, text, uuid, uuid, numeric, text,
  numeric, integer, numeric, text, text, text, boolean, boolean, integer, text, date
) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════
-- 20260926150000_manufacturer_name_unique.sql
-- ═══════════════════════════════════════════════════════════════════════
-- Stop near-duplicate manufacturer rows.
--
-- Duplicate/near-duplicate manufacturer names pollute ILIKE search results and
-- bloat the trigram index, and the inline "add manufacturer" path in
-- ProductForm (ProductForm.tsx:177-217) can currently create unlimited of them.
--
-- Guarded rather than plain: if duplicates already exist the index creation is
-- skipped with a notice instead of failing the whole migration. Dedupe first,
-- then re-run. This matches how the app behaves — report and continue.

do $$
declare
  v_dupes bigint;
begin
  select count(*) into v_dupes
  from (
    select lower(btrim(name))
    from public.manufacturers
    group by 1
    having count(*) > 1
  ) d;

  if v_dupes > 0 then
    raise notice 'Skipping idx_manufacturers_name_unique: % duplicate manufacturer name group(s) exist. Dedupe then re-run this migration.', v_dupes;
    return;
  end if;

  execute 'create unique index if not exists idx_manufacturers_name_unique
           on public.manufacturers (lower(btrim(name)))';
end $$;


-- ═══════════════════════════════════════════════════════════════════════
-- 20260926160000_backfill_missing_profiles.sql
-- ═══════════════════════════════════════════════════════════════════════
-- Backfill profiles for auth users that have none.
--
-- Problem: public.profiles rows are created by trg_auth_user_created, an
-- AFTER INSERT trigger on auth.users. A user whose profile row was deleted (or who
-- predates that trigger) is left permanently inconsistent: the row never comes back,
-- because nothing re-runs the trigger.
--
-- Why that breaks more than it looks: is_admin() reads auth.users.email, so such a
-- user can still sign in and still pass every admin check. But every read of
-- public.profiles for them returns no row, so updateProfile() updates 0 rows and
-- reports success, the profile editor cannot load, the admin sidebar has no identity,
-- and setAvatarUrl() writes to a row that does not exist. The failure is silent.
--
-- This is the idempotent half of handle_new_user(), run as a set-based backfill.
-- It only inserts rows that are missing, so it is safe to re-run and safe to apply to
-- a database that is already consistent.

insert into public.profiles (id, name, email, phone, role)
select
  u.id,
  coalesce(nullif(u.raw_user_meta_data ->> 'name', ''), split_part(u.email, '@', 1)),
  u.email,
  -- Only carry a phone across when it is already canonical. The raw metadata value
  -- has not been through normalizeBdPhone, and profiles_phone_format rejects
  -- anything that is not '+8801XXXXXXXXX', so a loose value would fail the whole
  -- statement. The user retypes it in the profile editor instead.
  case
    when u.raw_user_meta_data ->> 'phone' ~ '^\+8801[0-9]{9}$'
      then u.raw_user_meta_data ->> 'phone'
    else null
  end,
  -- Mirrors the allowlist in is_admin() and enforce_profile_role(). The trigger
  -- trg_profiles_enforce_role rewrites this on insert anyway; setting it correctly
  -- up front just keeps the value stable.
  case
    when lower(u.email) in ('icrmahin@gmail.com', 'hibbullah82026@gmail.com')
      then 'admin'
    else 'customer'
  end
from auth.users u
where u.email is not null
  and not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- Keep the trigger honest for the future: make profile creation self-healing rather
-- than dependent on a one-shot INSERT trigger. sync_profile_on_email_change already
-- covers email changes, so the only remaining gap was a missing row, handled above.
-- This assertion is the migration's own regression guard: if a new auth user can
-- exist without a profile, the invariant the app relies on is broken again.
do $$
declare
  v_missing integer;
begin
  select count(*) into v_missing
  from auth.users u
  where u.email is not null
    and not exists (select 1 from public.profiles p where p.id = u.id);

  if v_missing > 0 then
    raise warning 'backfill incomplete: % auth user(s) still have no profile row', v_missing;
  end if;
end;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 20260926170000_notifications_and_audit_limits.sql
-- Notifications and the audit log: real wiring, and hard limits.
-- ═══════════════════════════════════════════════════════════════════════════
-- Source of truth: supabase/migrations/20260926170000_notifications_and_audit_limits.sql
-- Keep the two in step; this file is what a fresh hosted project is bootstrapped from.

-- 1. notify_user -- the single way a notification gets created.
--    Every producer goes through this rather than inserting directly, so the type
--    validation and the length clamps are applied once instead of at each call site.
create or replace function public.notify_user(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_type text default 'info'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  -- The table constrains `type` to four values. Validating here turns a typo into a
  -- sensible default instead of aborting the caller's transaction -- and the callers
  -- are triggers on orders and returns, so a raised error would roll back the very
  -- status change the notification is describing.
  v_type text := case
    when p_type in ('info', 'success', 'warning', 'alert') then p_type
    else 'info'
  end;
begin
  if p_user_id is null then
    return null;
  end if;

  insert into public.notifications (user_id, title, body, type)
  values (p_user_id, left(coalesce(p_title, 'Notice'), 200), left(coalesce(p_body, ''), 1000), v_type)
  returning id into v_id;

  return v_id;
end;
$$;

-- 2. Order updates reach the customer.
--    Fires on insert (the order was placed) and on a real status change. A status that
--    has not changed produces nothing: the app also rewrites `timeline` and
--    `updated_at`, and a customer does not need to be told their order was placed every
--    time a status row is appended to.
create or replace function public.notify_order_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number text := coalesce(NEW.order_number, OLD.order_number);
  v_title text;
  v_body text;
  v_type text;
begin
  if tg_op = 'INSERT' then
    v_title := 'Order placed';
    v_body := 'We have received your order ' || v_number || '. We will confirm it shortly.';
    v_type := 'info';
  elsif NEW.status is distinct from OLD.status then
    case NEW.status
      when 'CONFIRMED' then
        v_title := 'Order confirmed';
        v_body := 'Your order ' || v_number || ' has been confirmed.';
        v_type := 'info';
      when 'PROCESSING' then
        v_title := 'Preparing your order';
        v_body := 'We are packing your order ' || v_number || '.';
        v_type := 'info';
      when 'OUT_FOR_DELIVERY' then
        v_title := 'Out for delivery';
        v_body := 'Your order ' || v_number || ' is on the way.';
        v_type := 'success';
      when 'DELIVERED' then
        v_title := 'Order delivered';
        v_body := 'Your order ' || v_number || ' has been delivered.';
        v_type := 'success';
      when 'CANCELLED' then
        v_title := 'Order cancelled';
        v_body := 'Your order ' || v_number || ' has been cancelled. Contact us if this was not expected.';
        v_type := 'alert';
      when 'RETURNED' then
        v_title := 'Order returned';
        v_body := 'Your order ' || v_number || ' has been returned.';
        v_type := 'alert';
      else
        -- A status this app does not narrate yet (PENDING reached by an update rather
        -- than an insert). Nothing useful to say, so say nothing.
        return null;
    end case;
  else
    return null;
  end if;

  perform public.notify_user(NEW.customer_id, v_title, v_body, v_type);
  return null;
end;
$$;

drop trigger if exists trg_orders_notify on public.orders;
create trigger trg_orders_notify
  after insert or update of status on public.orders
  for each row execute function public.notify_order_status();

-- 3. Return requests reach the customer. A customer who has asked for money back wants
--    to know the answer, so the decision notifies, not just the request.
create or replace function public.notify_return_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_body text;
  v_type text;
begin
  if tg_op = 'INSERT' then
    v_title := 'Return requested';
    v_body := 'We received your return request for ' || NEW.product_name || '. We will review it shortly.';
    v_type := 'info';
  elsif NEW.status is distinct from OLD.status then
    case NEW.status
      when 'APPROVED' then
        v_title := 'Return approved';
        v_body := 'Your return request for ' || NEW.product_name || ' has been approved.';
        v_type := 'success';
      when 'REJECTED' then
        v_title := 'Return declined';
        v_body := 'Your return request for ' || NEW.product_name || ' was declined. Contact us if you need help.';
        v_type := 'alert';
      when 'PROCESSED' then
        v_title := 'Return completed';
        v_body := 'Your return for ' || NEW.product_name || ' has been processed.';
        v_type := 'success';
      else
        return null;
    end case;
  else
    return null;
  end if;

  perform public.notify_user(NEW.customer_id, v_title, v_body, v_type);
  return null;
end;
$$;

drop trigger if exists trg_return_requests_notify on public.return_requests;
create trigger trg_return_requests_notify
  after insert or update of status on public.return_requests
  for each row execute function public.notify_return_status();

-- 4. Notifications: keep the newest 50 per user. Per user, not global, so one noisy
--    account cannot empty everyone else's list. AFTER INSERT only, and the trim deletes
--    rather than inserting, so the trigger cannot re-fire on its own work.
create or replace function public.trim_user_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications
  where id in (
    select id
    from public.notifications
    where user_id = NEW.user_id
    order by created_at desc, id desc
    offset 50 -- public.notification_cap()
  );
  return null;
end;
$$;

drop trigger if exists trg_notifications_trim on public.notifications;
create trigger trg_notifications_trim
  after insert on public.notifications
  for each row execute function public.trim_user_notifications();

-- 5. Audit log: keep the newest 20, drop the rest. Deliberately global and
--    deliberately small -- the log is written by a trigger on every product, order,
--    inventory and return mutation, so it is the fastest-growing table in the database
--    once the catalog is large. FOR EACH STATEMENT, because this examines the whole
--    table and there is no reason to run it once per row of a bulk import. Nothing has
--    a foreign key onto audit_entries, so deleting is safe.
create or replace function public.trim_audit_entries()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.audit_entries
  where id in (
    select id
    from public.audit_entries
    order by timestamp desc, id desc
    offset 20 -- public.audit_log_cap()
  );
  return null;
end;
$$;

drop trigger if exists trg_audit_entries_trim on public.audit_entries;
create trigger trg_audit_entries_trim
  after insert on public.audit_entries
  for each statement execute function public.trim_audit_entries();

-- Apply the audit cap to what is already there, so the invariant holds immediately
-- rather than only after the next write.
delete from public.audit_entries
where id in (
  select id from public.audit_entries order by timestamp desc, id desc offset 20
);

-- 6. Clients may read, mark read, and clear their own notifications. Nothing else.
--    The old FOR ALL policy read as "a customer can do anything to their own
--    notifications". Notably absent: INSERT. A notification is a claim that something
--    happened, so it may only come from the triggers above; leaving INSERT permitted
--    would let any signed-in client invent an "Out of stock" alert for themselves.
drop policy if exists "Customers can manage own notifications" on public.notifications;

create policy "Customers can mark own notifications read"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Customers can clear own notifications"
  on public.notifications for delete
  using (auth.uid() = user_id);

-- The triggers above are SECURITY DEFINER, so they write as the table owner and are
-- unaffected by these revokes.
revoke insert, truncate on public.notifications from anon, authenticated;

-- ================================================================================
-- Orders require a delivery address the customer actually owns
-- (migration 20260927010000_create_order_require_own_address.sql)
--
-- Applies the same three guards described there, so a rebuilt environment cannot accept
-- the orders the live one refuses:
--   * p_address_id IS NULL      -> refused, instead of silently becoming ''
--   * a non-existent address id -> refused
--   * ANOTHER customer's address -> refused. create_order is SECURITY DEFINER, so it reads
--     any addresses row regardless of RLS; without the ownership predicate in the lookup,
--     anyone who learned an address id could read that stranger's street address back out
--     of their own order.
-- ================================================================================
create or replace function public.create_order(p_customer_id uuid, p_address_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_order_id uuid;
  v_existing_id uuid;
  v_existing_subtotal numeric;
  v_existing_discount numeric;
  v_existing_delivery_fee numeric;
  v_subtotal numeric := 0;
  v_cart_subtotal numeric := 0;
  v_discount numeric := 0;
  v_delivery_fee numeric := 150;
  v_total numeric := 0;
  v_customer_name text;
  v_address_text text;
  v_cart_item record;
  v_product record;
  v_inv record;
  v_remaining integer;
  v_total_stock integer;
begin
  select name into v_customer_name from public.profiles where id = p_customer_id;
  if not found then
    raise exception 'Customer not found';
  end if;
  if not exists (select 1 from public.cart_items where user_id = p_customer_id) then
    raise exception 'Cart is empty';
  end if;

  -- Refuse a missing address outright rather than defaulting it to an empty string.
  if p_address_id is null then
    raise exception 'Delivery address is required';
  end if;

  -- Ownership is part of the lookup, not a separate check afterwards. SECURITY DEFINER
  -- bypasses RLS on `addresses`, so the `user_id = p_customer_id` predicate here is the
  -- ONLY thing standing between a caller and another customer's address.
  --
  -- An address that does not exist and one that belongs to somebody else are deliberately
  -- reported the same way, so this cannot be used to confirm whether an id is real.
  select street || ', ' || city || coalesce(', ' || county, '') || coalesce(', ' || postal_code, '')
    into v_address_text
  from public.addresses
  where id = p_address_id and user_id = p_customer_id;

  if v_address_text is null then
    raise exception 'Delivery address not found';
  end if;

  -- NOT NULL on street/city does not stop an empty string, and the client-side check is
  -- bypassable, so an unusable address is refused here rather than at delivery time.
  if btrim(v_address_text) in ('', ',') then
    raise exception 'Delivery address is incomplete';
  end if;

  -- Check for existing PENDING invoice for this customer (row-level lock to prevent race)
  select id, subtotal, discount, delivery_fee into v_existing_id, v_existing_subtotal, v_existing_discount, v_existing_delivery_fee
  from public.orders
  where customer_id = p_customer_id and status = 'PENDING'
  order by created_at desc
  limit 1
  for update;

  -- Validate cart items and compute cart subtotal (products must exist and be active)
  for v_cart_item in select * from public.cart_items where user_id = p_customer_id loop
    select * into v_product from public.products where id = v_cart_item.product_id and is_active = true;
    if not found then
      raise exception 'Product not available';
    end if;
    -- Authoritative available stock = non-expired inventory sum, falling back to
    -- products.stock only for legacy products with no inventory rows at all.
    select coalesce(sum(quantity), 0) into v_total_stock
    from public.inventory_items
    where product_id = v_cart_item.product_id
      and (expiry_date is null or expiry_date >= current_date);
    if v_total_stock = 0 and not exists (select 1 from public.inventory_items where product_id = v_cart_item.product_id) then
      v_total_stock := v_product.stock;
    end if;
    if v_total_stock < v_cart_item.quantity then
      raise exception 'Insufficient stock for product %', v_product.name;
    end if;
    v_cart_subtotal := v_cart_subtotal + (v_product.price * v_cart_item.quantity);
  end loop;

  if v_existing_id is not null then
    -- Append to existing PENDING invoice
    v_order_id := v_existing_id;
    for v_cart_item in select * from public.cart_items where user_id = p_customer_id loop
      select * into v_product from public.products where id = v_cart_item.product_id;
      -- Handle duplicate product in same order: merge quantity if already exists
      if exists (select 1 from public.order_items where order_id = v_order_id and product_id = v_cart_item.product_id) then
        update public.order_items
        set quantity = quantity + v_cart_item.quantity,
            total = (quantity + v_cart_item.quantity) * v_product.price
        where order_id = v_order_id and product_id = v_cart_item.product_id;
      else
        insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, discount_percent, total)
        values (v_order_id, v_cart_item.product_id, v_product.name, v_cart_item.quantity, v_product.price, 0, v_product.price * v_cart_item.quantity);
      end if;
      perform public.deduct_inventory_fifo(v_cart_item.product_id, v_cart_item.quantity);
    end loop;
    -- Recalc totals: subtotal + cart, keep single delivery fee
    v_subtotal := coalesce(v_existing_subtotal, 0) + v_cart_subtotal;
    v_total := v_subtotal - coalesce(v_existing_discount, 0) + coalesce(v_existing_delivery_fee, v_delivery_fee);
    update public.orders
    set subtotal = v_subtotal,
        total = v_total,
        updated_at = now(),
        -- Always the address just validated. This used to be
        -- `case when v_address_text <> '' then v_address_text else address end`, which kept
        -- whatever was there before; with the guard above v_address_text is never empty,
        -- so the fallback is dead code that would only ever preserve a stale address.
        address = v_address_text,
        timeline = coalesce(timeline, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('label', 'ITEMS_ADDED', 'time', now()::text, 'note', v_cart_subtotal::text || ' added'))
    where id = v_order_id;
  else
    -- No pending invoice: create new as before
    v_subtotal := v_cart_subtotal;
    v_total := v_subtotal - v_discount + v_delivery_fee;
    insert into public.orders (order_number, customer_id, customer_name, status, subtotal, discount, delivery_fee, total, payment_method, address)
    values (null, p_customer_id, v_customer_name, 'PENDING', v_subtotal, v_discount, v_delivery_fee, v_total, 'CASH_ON_DELIVERY', v_address_text)
    returning id into v_order_id;
    for v_cart_item in select * from public.cart_items where user_id = p_customer_id loop
      select * into v_product from public.products where id = v_cart_item.product_id;
      insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, discount_percent, total)
      values (v_order_id, v_cart_item.product_id, v_product.name, v_cart_item.quantity, v_product.price, 0, v_product.price * v_cart_item.quantity);
      perform public.deduct_inventory_fifo(v_cart_item.product_id, v_cart_item.quantity);
    end loop;
  end if;

  delete from public.cart_items where user_id = p_customer_id;
  return v_order_id;
end;
$fn$;

-- Cancel PENDING orders that predate the guard above and can never be delivered. The ids
-- are collected first and the notification is driven off that list, so it cannot
-- accidentally notify about an unrelated old non-PENDING order with an empty address.
do $$
declare
  v_ids uuid[];
begin
  select coalesce(array_agg(id), '{}'::uuid[])
    into v_ids
  from public.orders
  where btrim(coalesce(address, '')) in ('', ',')
    and status = 'PENDING';

  if coalesce(array_length(v_ids, 1), 0) = 0 then
    return;
  end if;

  update public.orders
  set status = 'CANCELLED',
      updated_at = now(),
      timeline = coalesce(timeline, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'label', 'CANCELLED',
        'time', now()::text,
        'note', 'No delivery address was recorded for this order, so it could not be delivered. Please place a new order.'))
  where id = any(v_ids);

  insert into public.notifications (user_id, title, body, type)
  select o.customer_id,
    'Order ' || coalesce(o.order_number, left(o.id::text, 8)) || ' cancelled',
    'We could not deliver this order because no delivery address was recorded. Please add an address and place a new order.',
    'info'
  from public.orders o
  where o.id = any(v_ids)
    and o.customer_id is not null;
end;
$$;

-- ================================================================================
-- One owner for the admin allowlist, and returns that match their order
-- (migration 20260927020000_admin_allowlist_single_source_and_return_rls.sql)
-- ================================================================================

-- The list of addresses that may hold admin used to be hard-coded inline in SIX function
-- bodies. Six copies of the decision that decides who is an administrator is how a new
-- admin gets half-promoted, and it already caused a test suite to report green while every
-- order transition failed. It lives here now, and the other five ask it.
-- ================================================================================
-- A third administrator: hibbullah2027@gmail.com
-- (migration 20260927030000_add_third_admin.sql)
--
-- Applied after the single-source section above, so it re-states the list with three
-- addresses. Nothing else in the file changes: the other five functions that decide admin
-- rights delegate to is_admin_email, which is what makes adding an admin a one-line change
-- rather than six edits that must all agree.
-- ================================================================================
create or replace function public.is_admin_email(p_email text)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $fn$
  select lower(coalesce(p_email, '')) in (
    'icrmahin@gmail.com',
    'hibbullah82026@gmail.com',
    'hibbullah2027@gmail.com'
  )
$fn$;

comment on function public.is_admin_email(text) is
  'The single owner of the admin allowlist. No other function may hard-code an admin email; they must call this, so the list cannot drift between code paths. To add or remove an administrator, change it here only -- supabase/verify-sql-sync.mjs fails if any other function grows its own copy, or if the client-side ADMIN_EMAILS sets in src/providers/AuthProvider.tsx and src/components/auth/UnifiedAuth.tsx stop matching this list.';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = 'public', 'auth', 'pg_catalog'
as $fn$
  select exists (
    select 1
    from auth.users
    where auth.users.id = auth.uid()
      and public.is_admin_email(auth.users.email)
  )
$fn$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_catalog'
as $fn$
declare
  v_role text := 'customer';
  v_email_lower text;
  v_phone text;
begin
  v_email_lower := lower(new.email);
  if public.is_admin_email(v_email_lower) then
    v_role := 'admin';
  else
    v_role := 'customer';
  end if;

  v_phone := coalesce(new.raw_user_meta_data->>'phone', '');
  -- Normalize empty to null for admin convenience (keeps partial index clean)
  if v_phone = '' and v_role = 'admin' then
    v_phone := null;
  end if;

  insert into public.profiles (id, name, email, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    v_phone,
    v_role
  )
  on conflict (id) do update set
    email = excluded.email,
    role = excluded.role,
    name = coalesce(public.profiles.name, excluded.name),
    -- Keep phone if already present, else use new
    phone = coalesce(public.profiles.phone, excluded.phone),
    updated_at = now();
  return new;
end;
$fn$;

create or replace function public.sync_profile_on_email_change()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_catalog'
as $fn$
declare
  v_new_role text;
begin
  if public.is_admin_email(lower(new.email)) then
    v_new_role := 'admin';
  else
    v_new_role := 'customer';
  end if;

  update public.profiles
    set email = new.email,
        role = v_new_role,
        updated_at = now()
    where id = new.id;

  return new;
end;
$fn$;

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_catalog'
as $fn$
declare
  v_email text;
  v_role text;
begin
  select lower(email) into v_email from auth.users where id = (event->>'user_id')::uuid;
  if public.is_admin_email(v_email) then
    v_role := 'admin';
  else
    v_role := 'customer';
  end if;
  event := jsonb_set(event, '{claims,app_role}', to_jsonb(v_role));
  event := jsonb_set(event, '{claims,is_admin}', to_jsonb(v_role = 'admin'));
  return event;
exception when others then
  return event;
end;
$fn$;

create or replace function public.enforce_profile_role()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_catalog'
as $fn$
declare
  v_email text;
  v_allowed_role text;
begin
  select lower(email) into v_email from auth.users where id = new.id;
  if v_email is null then
    v_email := lower(new.email);
  end if;

  if public.is_admin_email(v_email) then
    v_allowed_role := 'admin';
  else
    v_allowed_role := 'customer';
  end if;

  if new.role is distinct from v_allowed_role then
    new.role := v_allowed_role;
  end if;

  -- For admin, allow phone null/'' regardless of format
  if v_allowed_role = 'admin' and (new.phone is null or new.phone = '') then
    new.phone := null;
  end if;

  new.updated_at := now();
  return new;
end;
$fn$;

create or replace function public.transition_order_status(p_order_id uuid, p_new_status text, p_admin_id uuid)
returns boolean
language plpgsql
security definer
set search_path = 'public', 'auth', 'pg_catalog'
as $fn$
declare
  v_current_status text;
  v_allowed boolean := false;
begin
  if not public.is_admin() then
    raise exception 'Only admins can change order status';
  end if;
  if p_admin_id is distinct from auth.uid() then
    raise exception 'Admin ID must match authenticated user';
  end if;
  if not exists (select 1 from auth.users where id = p_admin_id and public.is_admin_email(email)) then
    raise exception 'Only allowlisted admins can change order status';
  end if;
  select status into v_current_status from public.orders where id = p_order_id;
  if not found then
    raise exception 'Order not found';
  end if;
  v_allowed := (
    (v_current_status = 'PENDING' and p_new_status in ('CONFIRMED', 'CANCELLED')) or
    (v_current_status = 'CONFIRMED' and p_new_status in ('PROCESSING', 'CANCELLED')) or
    (v_current_status = 'PROCESSING' and p_new_status in ('OUT_FOR_DELIVERY', 'CANCELLED')) or
    (v_current_status = 'OUT_FOR_DELIVERY' and p_new_status in ('DELIVERED')) or
    (v_current_status = 'DELIVERED' and p_new_status in ('RETURNED'))
  );
  if not v_allowed then
    raise exception 'Invalid status transition from % to %', v_current_status, p_new_status;
  end if;
  update public.orders
  set status = p_new_status,
      updated_at = now(),
      timeline = coalesce(timeline, '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object('label', 'STATUS_CHANGED', 'time', now()::text, 'note', v_current_status || ' → ' || p_new_status)
      )
  where id = p_order_id;
  return true;
end;
$fn$;

-- A return request must belong to the order it names. The old INSERT policy checked only
-- `auth.uid() = customer_id` -- that the row claims to belong to whoever is inserting it --
-- and never that the ORDER belongs to that customer, so any signed-in user could file a
-- return against any order in the shop. The app calls validate_return() first, which does
-- check, but that is a client-side call, so it is advice rather than enforcement.
drop policy if exists "Customers can create returns" on public.return_requests;

create policy "Customers can create returns"
on public.return_requests
for insert
to public
with check (
  auth.uid() = customer_id
  and exists (
    select 1
    from public.orders o
    where o.id = return_requests.order_id
      and o.customer_id = return_requests.customer_id
      and o.status = 'DELIVERED'
  )
);

-- ══════════════════════════════════════════════════════════════════════════════
-- 20260927040000_district_delivery_fee.sql
-- District-priced delivery: 80 inside Dhaka District, 150 outside it.
-- Appended verbatim from migrations/; verify:sql-sync compares every function below
-- against the migration and fails if the two ever differ.
-- ══════════════════════════════════════════════════════════════════════════════

-- Price delivery by destination district: ৳80 inside Dhaka District, ৳150 outside it.
--
-- One rule, on the server, because the server is what charges the customer. `create_order`
-- writes `delivery_fee` onto the order row and the client only ever *shows* a figure; if
-- the two implementations disagreed, the customer would be quoted one total at checkout
-- and charged another, with no error anywhere in the app to explain it. The order would
-- simply look wrong when it arrived. supabase/verify-sql-sync.mjs compares these literals
-- against src/constants/config.ts so the split cannot open.
--
-- Dhaka District only, not the 13 districts of Dhaka Division. Gazipur and Narayanganj are
-- large and close to the city, but they are genuinely further out, and pricing them at the
-- Dhaka rate would undercharge a large share of orders for the convenience of a wider
-- bracket. Naming the qualifying district as a single value keeps the rule one comparison
-- rather than a list that could later be edited inconsistently in one place and not the
-- other.
--
-- Defaulting to the higher rate is deliberate. An address with no district, a misspelled
-- one, or one saved before the picker existed charges 150. Undercharging 70 on an unknown
-- district is a rounding error; billing every unrecognised address at 80 would be a
-- systematic leak with nothing anywhere able to surface it.
--
-- The `create_order` body below is the definition from
-- 20260927010000_create_order_require_own_address.sql with four changes and nothing else:
-- the district is read out of the address row, the fee is computed from it, the removed
-- `v_existing_delivery_fee` variable is gone, and the append path reprices instead of
-- carrying the old fee forward. Rewriting the function rather than patching it is
-- deliberate -- a migration that only adjusted the fee would leave a second copy of
-- `create_order` in the repo, and two copies of the address guard are how those and this
-- rule would eventually drift apart.

-- The inputs first, as functions rather than bare literals inside the rule, so each value
-- exists in exactly one place and a verify check can read it out by name. They have to be
-- created BEFORE the rule that calls them: a `language sql` body is parsed and validated
-- when the function is created, not on first call, so a rule that references a function
-- defined further down this file fails outright with
-- "function public.inside_dhaka_district() does not exist".
create or replace function public.inside_dhaka_delivery_fee()
returns numeric language sql immutable as $fn$ select 80::numeric $fn$;

create or replace function public.outside_dhaka_delivery_fee()
returns numeric language sql immutable as $fn$ select 150::numeric $fn$;

create or replace function public.inside_dhaka_district()
returns text language sql immutable as $fn$ select 'Dhaka'::text $fn$;

create or replace function public.delivery_fee_for_district(p_district text)
returns numeric
language sql
immutable
as $fn$
  select case
    when lower(btrim(coalesce(p_district, ''))) = lower(btrim(public.inside_dhaka_district()))
      then public.inside_dhaka_delivery_fee()
    else public.outside_dhaka_delivery_fee()
  end
$fn$;

comment on function public.delivery_fee_for_district(text) is
  'The single owner of the delivery pricing rule. Returns 80 for Dhaka District and 150 for every other district, including a null or unrecognised one. Must stay identical to deliveryFeeForDistrict() in src/utils/deliveryFee.ts; verify:sql-sync fails if the two drift.';

create or replace function public.create_order(p_customer_id uuid, p_address_id uuid)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $fn$
declare
  v_order_id uuid;
  v_existing_id uuid;
  v_existing_subtotal numeric;
  v_existing_discount numeric;
  v_subtotal numeric := 0;
  v_cart_subtotal numeric := 0;
  v_discount numeric := 0;
  v_delivery_fee numeric;
  v_total numeric := 0;
  v_customer_name text;
  v_address_text text;
  v_address_district text;
  v_cart_item record;
  v_product record;
  v_inv record;
  v_remaining integer;
  v_total_stock integer;
begin
  select name into v_customer_name from public.profiles where id = p_customer_id;
  if not found then
    raise exception 'Customer not found';
  end if;
  if not exists (select 1 from public.cart_items where user_id = p_customer_id) then
    raise exception 'Cart is empty';
  end if;

  -- Refuse a missing address outright rather than defaulting it to an empty string.
  if p_address_id is null then
    raise exception 'Delivery address is required';
  end if;

  -- Ownership is part of the lookup, not a separate check afterwards. SECURITY DEFINER
  -- bypasses RLS on `addresses`, so the `user_id = p_customer_id` predicate here is the
  -- ONLY thing standing between a caller and another customer's address.
  --
  -- An address that does not exist and one that belongs to somebody else are deliberately
  -- reported the same way, so this cannot be used to confirm whether an id is real.
  select street || ', ' || city || coalesce(', ' || county, '') || coalesce(', ' || postal_code, ''),
         county
    into v_address_text, v_address_district
  from public.addresses
  where id = p_address_id and user_id = p_customer_id;

  if v_address_text is null then
    raise exception 'Delivery address not found';
  end if;

  -- NOT NULL on street/city does not stop an empty string, and the client-side check is
  -- bypassable, so an unusable address is refused here rather than at delivery time.
  if btrim(v_address_text) in ('', ',') then
    raise exception 'Delivery address is incomplete';
  end if;

  -- Priced from the district, not hard-coded. A null or unrecognised district falls to the
  -- standard rate inside delivery_fee_for_district() rather than needing a guard here.
  v_delivery_fee := public.delivery_fee_for_district(v_address_district);

  -- Check for existing PENDING invoice for this customer (row-level lock to prevent race)
  --
  -- `delivery_fee` is deliberately no longer selected out. It used to be read into
  -- `v_existing_delivery_fee` and carried into the recalculated total, which kept the old
  -- charge on an order whose address had changed. The fee is now recomputed from the
  -- address passed to this call, so there is nothing here for the existing row to
  -- contribute.
  select id, subtotal, discount into v_existing_id, v_existing_subtotal, v_existing_discount
  from public.orders
  where customer_id = p_customer_id and status = 'PENDING'
  order by created_at desc
  limit 1
  for update;

  -- Validate cart items and compute cart subtotal (products must exist and be active)
  for v_cart_item in select * from public.cart_items where user_id = p_customer_id loop
    select * into v_product from public.products where id = v_cart_item.product_id and is_active = true;
    if not found then
      raise exception 'Product not available';
    end if;
    -- Authoritative available stock = non-expired inventory sum, falling back to
    -- products.stock only for legacy products with no inventory rows at all.
    select coalesce(sum(quantity), 0) into v_total_stock
    from public.inventory_items
    where product_id = v_cart_item.product_id
      and (expiry_date is null or expiry_date >= current_date);
    if v_total_stock = 0 and not exists (select 1 from public.inventory_items where product_id = v_cart_item.product_id) then
      v_total_stock := v_product.stock;
    end if;
    if v_total_stock < v_cart_item.quantity then
      raise exception 'Insufficient stock for product %', v_product.name;
    end if;
    v_cart_subtotal := v_cart_subtotal + (v_product.price * v_cart_item.quantity);
  end loop;

  if v_existing_id is not null then
    -- Append to existing PENDING invoice
    v_order_id := v_existing_id;
    for v_cart_item in select * from public.cart_items where user_id = p_customer_id loop
      select * into v_product from public.products where id = v_cart_item.product_id;
      -- Handle duplicate product in same order: merge quantity if already exists
      if exists (select 1 from public.order_items where order_id = v_order_id and product_id = v_cart_item.product_id) then
        update public.order_items
        set quantity = quantity + v_cart_item.quantity,
            total = (quantity + v_cart_item.quantity) * v_product.price
        where order_id = v_order_id and product_id = v_cart_item.product_id;
      else
        insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, discount_percent, total)
        values (v_order_id, v_cart_item.product_id, v_product.name, v_cart_item.quantity, v_product.price, 0, v_product.price * v_cart_item.quantity);
      end if;
      perform public.deduct_inventory_fifo(v_cart_item.product_id, v_cart_item.quantity);
    end loop;
    -- Recalc totals: subtotal + cart, one delivery fee.
    --
    -- The fee is REPRICED from the address passed in here, rather than carried over from
    -- the existing order. This line used to read
    -- `coalesce(v_existing_delivery_fee, v_delivery_fee)`, which was harmless while the fee
    -- was a constant and is wrong now: a customer who first ordered to Chattogram and then
    -- added an item while switching to a Dhaka address would keep paying the 150 they were
    -- quoted, against an 80 rate. `delivery_fee` is written explicitly below too, so the
    -- stored row and the new total cannot disagree with each other either.
    v_subtotal := coalesce(v_existing_subtotal, 0) + v_cart_subtotal;
    v_total := v_subtotal - coalesce(v_existing_discount, 0) + v_delivery_fee;
    update public.orders
    set subtotal = v_subtotal,
        delivery_fee = v_delivery_fee,
        total = v_total,
        updated_at = now(),
        -- Always the address just validated. This used to be
        -- `case when v_address_text <> '' then v_address_text else address end`, which kept
        -- whatever was there before; with the guard above v_address_text is never empty,
        -- so the fallback is dead code that would only ever preserve a stale address.
        address = v_address_text,
        timeline = coalesce(timeline, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('label', 'ITEMS_ADDED', 'time', now()::text, 'note', v_cart_subtotal::text || ' added'))
    where id = v_order_id;
  else
    -- No pending invoice: create new as before
    v_subtotal := v_cart_subtotal;
    v_total := v_subtotal - v_discount + v_delivery_fee;
    insert into public.orders (order_number, customer_id, customer_name, status, subtotal, discount, delivery_fee, total, payment_method, address)
    values (null, p_customer_id, v_customer_name, 'PENDING', v_subtotal, v_discount, v_delivery_fee, v_total, 'CASH_ON_DELIVERY', v_address_text)
    returning id into v_order_id;
    for v_cart_item in select * from public.cart_items where user_id = p_customer_id loop
      select * into v_product from public.products where id = v_cart_item.product_id;
      insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, discount_percent, total)
      values (v_order_id, v_cart_item.product_id, v_product.name, v_cart_item.quantity, v_product.price, 0, v_product.price * v_cart_item.quantity);
      perform public.deduct_inventory_fifo(v_cart_item.product_id, v_cart_item.quantity);
    end loop;
  end if;

  delete from public.cart_items where user_id = p_customer_id;
  return v_order_id;
end;
$fn$;

comment on function public.create_order(uuid, uuid) is
  'Places an order for the signed-in customer. Requires one of the customer''s own addresses and prices delivery from that address''s district. Reuses and re-prices an existing PENDING order rather than creating a second one.';

-- ── Re-price PENDING orders quoted under the old flat rate ─────────────────────────
-- Every order still sitting at PENDING was quoted the flat 150 before this change and
-- would keep that 150 written on it, so the customer's checkout total would show 80 for a
-- Dhaka address while the order row said 150. There are none today, but the repair runs
-- unconditionally so a database that was mid-checkout at deploy time is also corrected.
--
-- `orders` keeps the rendered address text and not the address id, so the district has to
-- be recovered from that text. create_order builds it as
--
--     street || ', ' || city || coalesce(', ' || county, '') || coalesce(', ' || postal_code, '')
--
-- which means the district is always the *third* comma-separated component -- the county
-- slot. Reading it as component 3 rather than searching the whole string for "Dhaka" is
-- what keeps a street called "Dhaka" from being mistaken for the district.
--
-- Where the text has only two components there was no district, and the repair charges the
-- standard rate, which is the safe direction. This is a best-effort repair of pre-existing
-- rows and not the pricing rule: the rule is delivery_fee_for_district() above, and it is
-- what every new and appended order uses.
do $$
declare
  v_row record;
  v_district text;
  v_fee numeric;
begin
  for v_row in
    select id, address
    from public.orders
    where status = 'PENDING' and coalesce(address, '') <> ''
  loop
    v_district := nullif(btrim(split_part(v_row.address, ',', 3)), '');

    v_fee := public.delivery_fee_for_district(v_district);

    update public.orders
    set delivery_fee = v_fee,
        total = coalesce(subtotal, 0) - coalesce(discount, 0) + v_fee,
        updated_at = now()
    where id = v_row.id
      -- Only rewrite a row that actually changes, so `updated_at` keeps meaning
      -- "something happened here" rather than moving on every deploy.
      and delivery_fee is distinct from v_fee;
  end loop;
end;
$$;


-- ==============================================================================
-- From migration 20260928010000_secdef_grants_and_guards.sql
-- Appended verbatim so a rebuilt project gets the same guards and grants. Without
-- this, a rebuild replays every SECURITY DEFINER function with the default
-- EXECUTE-to-PUBLIC grant and none of the in-body checks, i.e. exactly the state
-- that leaked the customer list to a logged-out visitor.
-- ==============================================================================
-- Generated by supabase/build-lockdown.mjs — do not hand-edit, re-run the generator.
--
-- Every SECURITY DEFINER function here was created without an explicit GRANT, so Postgres
-- applied its default: EXECUTE to PUBLIC. A definer function runs as its owner and so
-- ignores the RLS protecting the tables underneath, which turned each of these into a way
-- past those policies. All of the following were confirmed working for a logged-out
-- visitor holding only the project's public anon key — a key that ships inside the web
-- bundle by design, so "anonymous" here means anyone who has ever opened the site:
--
--   get_customers_with_stats   every customer's name, email, phone, order count and
--                              lifetime spend, pageable with p_limit / p_offset
--   get_customer_stats         the same figures for any single customer id
--   deduct_inventory_fifo      decremented real stock (98 -> 97 on a live product)
--   notify_user                wrote an arbitrary notification into a real admin account
--   is_admin_email             confirmed which email addresses are administrators
--
-- The two order-path functions took a customer id on trust, so a caller could name
-- somebody else and have the ownership check further down validate the wrong pair.
--
-- Guards are added alongside the grants, not instead of them: a GRANT revoked today can
-- be re-granted tomorrow by a migration that assumed a default it did not check, and a
-- function with no in-body authorisation is then wide open again.


-- ==========================================================================
-- get_customers_with_stats — admin only
-- ==========================================================================
create or replace function public.get_customers_with_stats(p_query text DEFAULT NULL::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
returns TABLE(id uuid, name text, email text, phone text, role text, avatar_url text, created_at timestamp with time zone, order_count bigint, total_spent numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Anon-callable and unguarded: any logged-out visitor could page the whole customer
  -- list out of this, because SECURITY DEFINER ignores the RLS on profiles and orders.
  if not public.is_admin() then
    raise exception 'Only admins can query customers';
  end if;
  return query

  select
    p.id,
    p.name,
    p.email,
    p.phone,
    p.role,
    p.avatar_url,
    p.created_at,
    coalesce(o.order_count, 0) as order_count,
    coalesce(o.total_spent, 0) as total_spent
  from public.profiles p
  left join (
    select customer_id, count(*)::bigint as order_count, sum(total)::numeric as total_spent
    from public.orders
    group by customer_id
  ) o on o.customer_id = p.id
  where p.role = 'customer'
    and (
      p_query is null or p_query = ''
      or p.name ilike '%' || p_query || '%'
      or coalesce(p.email,'') ilike '%' || p_query || '%'
      or coalesce(p.phone,'') ilike '%' || p_query || '%'
    )
  order by p.created_at desc
  limit p_limit offset p_offset;
end;
$$;


-- ==========================================================================
-- get_customer_stats — admin only
-- ==========================================================================
create or replace function public.get_customer_stats(p_customer_id uuid)
returns TABLE(order_count bigint, total_spent numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Anon-callable and unguarded: any logged-out visitor could page the whole customer
  -- list out of this, because SECURITY DEFINER ignores the RLS on profiles and orders.
  if not public.is_admin() then
    raise exception 'Only admins can query customers';
  end if;
  return query

  select count(*)::bigint as order_count, coalesce(sum(total),0)::numeric as total_spent
  from public.orders where customer_id = p_customer_id;
end;
$$;


-- ==========================================================================
-- create_order — caller must be the customer they name
-- ==========================================================================
create or replace function public.create_order(p_customer_id uuid, p_address_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$

declare
  v_order_id uuid;
  v_existing_id uuid;
  v_existing_subtotal numeric;
  v_existing_discount numeric;
  v_subtotal numeric := 0;
  v_cart_subtotal numeric := 0;
  v_discount numeric := 0;
  v_delivery_fee numeric;
  v_total numeric := 0;
  v_customer_name text;
  v_address_text text;
  v_address_district text;
  v_cart_item record;
  v_product record;
  v_inv record;
  v_remaining integer;
  v_total_stock integer;
begin
  -- This took p_customer_id on trust, so a caller could name a different customer and
  -- have the ownership check further down validate that wrong pair. The app only ever
  -- passes the signed-in user's own id, so requiring that costs nothing and closes
  -- the impersonation.
  if auth.uid() is distinct from p_customer_id then
    raise exception 'Customer ID must match authenticated user';
  end if;
  select name into v_customer_name from public.profiles where id = p_customer_id;
  if not found then
    raise exception 'Customer not found';
  end if;
  if not exists (select 1 from public.cart_items where user_id = p_customer_id) then
    raise exception 'Cart is empty';
  end if;

  -- Refuse a missing address outright rather than defaulting it to an empty string.
  if p_address_id is null then
    raise exception 'Delivery address is required';
  end if;

  -- Ownership is part of the lookup, not a separate check afterwards. SECURITY DEFINER
  -- bypasses RLS on `addresses`, so the `user_id = p_customer_id` predicate here is the
  -- ONLY thing standing between a caller and another customer's address.
  --
  -- An address that does not exist and one that belongs to somebody else are deliberately
  -- reported the same way, so this cannot be used to confirm whether an id is real.
  select street || ', ' || city || coalesce(', ' || county, '') || coalesce(', ' || postal_code, ''),
         county
    into v_address_text, v_address_district
  from public.addresses
  where id = p_address_id and user_id = p_customer_id;

  if v_address_text is null then
    raise exception 'Delivery address not found';
  end if;

  -- NOT NULL on street/city does not stop an empty string, and the client-side check is
  -- bypassable, so an unusable address is refused here rather than at delivery time.
  if btrim(v_address_text) in ('', ',') then
    raise exception 'Delivery address is incomplete';
  end if;

  -- Priced from the district, not hard-coded. A null or unrecognised district falls to the
  -- standard rate inside delivery_fee_for_district() rather than needing a guard here.
  v_delivery_fee := public.delivery_fee_for_district(v_address_district);

  -- Check for existing PENDING invoice for this customer (row-level lock to prevent race)
  --
  -- `delivery_fee` is deliberately no longer selected out. It used to be read into
  -- `v_existing_delivery_fee` and carried into the recalculated total, which kept the old
  -- charge on an order whose address had changed. The fee is now recomputed from the
  -- address passed to this call, so there is nothing here for the existing row to
  -- contribute.
  select id, subtotal, discount into v_existing_id, v_existing_subtotal, v_existing_discount
  from public.orders
  where customer_id = p_customer_id and status = 'PENDING'
  order by created_at desc
  limit 1
  for update;

  -- Validate cart items and compute cart subtotal (products must exist and be active)
  for v_cart_item in select * from public.cart_items where user_id = p_customer_id loop
    select * into v_product from public.products where id = v_cart_item.product_id and is_active = true;
    if not found then
      raise exception 'Product not available';
    end if;
    -- Authoritative available stock = non-expired inventory sum, falling back to
    -- products.stock only for legacy products with no inventory rows at all.
    select coalesce(sum(quantity), 0) into v_total_stock
    from public.inventory_items
    where product_id = v_cart_item.product_id
      and (expiry_date is null or expiry_date >= current_date);
    if v_total_stock = 0 and not exists (select 1 from public.inventory_items where product_id = v_cart_item.product_id) then
      v_total_stock := v_product.stock;
    end if;
    if v_total_stock < v_cart_item.quantity then
      raise exception 'Insufficient stock for product %', v_product.name;
    end if;
    v_cart_subtotal := v_cart_subtotal + (v_product.price * v_cart_item.quantity);
  end loop;

  if v_existing_id is not null then
    -- Append to existing PENDING invoice
    v_order_id := v_existing_id;
    for v_cart_item in select * from public.cart_items where user_id = p_customer_id loop
      select * into v_product from public.products where id = v_cart_item.product_id;
      -- Handle duplicate product in same order: merge quantity if already exists
      if exists (select 1 from public.order_items where order_id = v_order_id and product_id = v_cart_item.product_id) then
        update public.order_items
        set quantity = quantity + v_cart_item.quantity,
            total = (quantity + v_cart_item.quantity) * v_product.price
        where order_id = v_order_id and product_id = v_cart_item.product_id;
      else
        insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, discount_percent, total)
        values (v_order_id, v_cart_item.product_id, v_product.name, v_cart_item.quantity, v_product.price, 0, v_product.price * v_cart_item.quantity);
      end if;
      perform public.deduct_inventory_fifo(v_cart_item.product_id, v_cart_item.quantity);
    end loop;
    -- Recalc totals: subtotal + cart, one delivery fee.
    --
    -- The fee is REPRICED from the address passed in here, rather than carried over from
    -- the existing order. This line used to read
    -- `coalesce(v_existing_delivery_fee, v_delivery_fee)`, which was harmless while the fee
    -- was a constant and is wrong now: a customer who first ordered to Chattogram and then
    -- added an item while switching to a Dhaka address would keep paying the 150 they were
    -- quoted, against an 80 rate. `delivery_fee` is written explicitly below too, so the
    -- stored row and the new total cannot disagree with each other either.
    v_subtotal := coalesce(v_existing_subtotal, 0) + v_cart_subtotal;
    v_total := v_subtotal - coalesce(v_existing_discount, 0) + v_delivery_fee;
    update public.orders
    set subtotal = v_subtotal,
        delivery_fee = v_delivery_fee,
        total = v_total,
        updated_at = now(),
        -- Always the address just validated. This used to be
        -- `case when v_address_text <> '' then v_address_text else address end`, which kept
        -- whatever was there before; with the guard above v_address_text is never empty,
        -- so the fallback is dead code that would only ever preserve a stale address.
        address = v_address_text,
        timeline = coalesce(timeline, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('label', 'ITEMS_ADDED', 'time', now()::text, 'note', v_cart_subtotal::text || ' added'))
    where id = v_order_id;
  else
    -- No pending invoice: create new as before
    v_subtotal := v_cart_subtotal;
    v_total := v_subtotal - v_discount + v_delivery_fee;
    insert into public.orders (order_number, customer_id, customer_name, status, subtotal, discount, delivery_fee, total, payment_method, address)
    values (null, p_customer_id, v_customer_name, 'PENDING', v_subtotal, v_discount, v_delivery_fee, v_total, 'CASH_ON_DELIVERY', v_address_text)
    returning id into v_order_id;
    for v_cart_item in select * from public.cart_items where user_id = p_customer_id loop
      select * into v_product from public.products where id = v_cart_item.product_id;
      insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, discount_percent, total)
      values (v_order_id, v_cart_item.product_id, v_product.name, v_cart_item.quantity, v_product.price, 0, v_product.price * v_cart_item.quantity);
      perform public.deduct_inventory_fifo(v_cart_item.product_id, v_cart_item.quantity);
    end loop;
  end if;

  delete from public.cart_items where user_id = p_customer_id;
  return v_order_id;
end;

$$;


-- ==========================================================================
-- validate_return — caller must be the customer they name
-- ==========================================================================
create or replace function public.validate_return(p_order_id uuid, p_customer_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$

declare
  v_order_status text;
begin
  -- This took p_customer_id on trust, so a caller could name a different customer and
  -- have the ownership check further down validate that wrong pair. The app only ever
  -- passes the signed-in user's own id, so requiring that costs nothing and closes
  -- the impersonation.
  if auth.uid() is distinct from p_customer_id then
    raise exception 'Customer ID must match authenticated user';
  end if;
  select status into v_order_status from public.orders where id = p_order_id;
  if not found then
    raise exception 'Order not found';
  end if;
  if v_order_status != 'DELIVERED' then
    raise exception 'Returns are only allowed for delivered orders';
  end if;
  if not exists (select 1 from public.orders where id = p_order_id and customer_id = p_customer_id) then
    raise exception 'Order does not belong to customer';
  end if;
  return true;
end;

$$;


-- ==========================================================================
-- Grants. Postgres handed EXECUTE to PUBLIC on each of these at creation time; the
-- default is why none of them was ever reviewed.
-- ==========================================================================
revoke all on function public.deduct_inventory_fifo(p_product_id uuid, p_quantity integer) from public, anon, authenticated;
revoke all on function public.notify_user(p_user_id uuid, p_title text, p_body text, p_type text) from public, anon, authenticated;
revoke all on function public.is_admin_email(p_email text) from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

-- The two customer RPCs stay callable by a signed-in admin — that is who uses them — but
-- the anon/public grant they inherited goes away. The in-body is_admin() is the real
-- check; this only removes the path that had no check at all.
revoke all on function public.get_customers_with_stats(text, integer, integer) from public, anon;
revoke all on function public.get_customer_stats(uuid) from public, anon;


-- ==============================================================================
-- From migration 20260928020000_reports_and_customer_spend.sql
-- ==============================================================================
-- Reports that aggregate in the database, and customer spend that stops counting cancelled
-- orders as money taken.
--
-- Two problems, both in the reporting the admin dashboard shows.
--
-- 1. `src/services/reports.ts` fetched every row of `orders`, `products` and
--    `inventory_items` into the phone and added them up in JavaScript. The project is
--    specified for a 4,000-product catalogue, so the inventory report alone was pulling
--    4,000 product rows plus every batch on each visit, and a report that degrades with
--    the size of the shop is not a report. The row cap is also not a defence here: with
--    `db-max-rows` unset, PostgREST returns everything, and if an operator ever does set
--    a cap the totals would silently under-report instead of failing.
--
-- 2. `get_customers_with_stats` and `get_customer_stats` summed `orders.total` across
--    every status, so a cancelled order showed up as money the customer had spent.
--
-- Scope is deliberately different in the two places, because they answer different
-- questions, and the two used to be conflated:
--
--   "Revenue" on the sales report is settled income, so it counts DELIVERED only, and
--     "Discounts given" is now counted over that same DELIVERED set. Before this the two
--     tiles sat side by side on one card while being computed over different populations,
--     so their difference did not mean anything.
--   "Total spent" on a customer is lifetime value, so it counts everything the customer
--     committed to and did not cancel. An order still PENDING is money the customer
--     intends to pay; a CANCELLED one is money nobody is going to see.

-- ==========================================================================
-- get_reports — sales and inventory totals, aggregated in the database
-- ==========================================================================
--
-- The thresholds are parameters rather than constants so that `config.lowStockThreshold`
-- and `config.expiryWarningDays` stay the only place they are defined. Hardcoding 10 and
-- 90 here is what let the reports screen disagree with the rest of the app: the expiry
-- screen counted 90 days while `config.expiryWarningDays` says 60, so an admin was shown
-- two different answers to "what is expiring soon" on two screens in the same app.
create or replace function public.get_reports(
  p_low_stock_threshold integer default 10,
  p_expiry_warning_days  integer default 60
)
returns table (
  revenue         numeric,
  delivered_orders bigint,
  discounts       numeric,
  low_stock       bigint,
  out_of_stock    bigint,
  expiring        bigint,
  inventory_value numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_low  integer;
  v_days integer;
begin
  -- SECURITY DEFINER ignores RLS, so without this the numbers would be the whole shop's
  -- for anyone who reached it. Reports are an admin view by definition.
  if not public.is_admin() then
    raise exception 'Only admins can query reports';
  end if;

  -- A caller passing a negative or absurd window should get a report, not an error and
  -- not a wrong answer, so both inputs are clamped to a sane range here.
  v_low := greatest(coalesce(p_low_stock_threshold, 10), 0);
  v_days := least(greatest(coalesce(p_expiry_warning_days, 60), 0), 3650);

  return query
  with delivered as (
    -- `total` is subtotal - discount + delivery fee, so this revenue figure includes the
    -- delivery charges. That is the money that actually came in and is what an owner
    -- reconciles against, so it is left inclusive rather than quietly redefining
    -- "revenue" to mean product sales only.
    select coalesce(sum(total), 0)::numeric   as revenue,
           count(*)::bigint                    as delivered_orders,
           coalesce(sum(discount), 0)::numeric as discounts
      from public.orders
     where status = 'DELIVERED'
  ),
  stock as (
    -- Counted per product, not per batch: a shop with one product split across four
    -- batches needs one low-stock warning, not four.
    select count(*) filter (where stock > 0 and stock < v_low)::bigint as low_stock,
           count(*) filter (where stock <= 0)::bigint                   as out_of_stock
      from public.products
  ),
  batches as (
    -- Zero-quantity batches are left out. A batch is emptied when it is consumed or
    -- written off but its row is kept, and counting those as "expiring soon" reported
    -- stock that no longer existed. It does not change the inventory value, since those
    -- rows contribute nothing to the sum either way.
    select b.product_id, b.quantity, b.expiry_date
      from public.inventory_items b
     where b.quantity > 0
  ),
  soon as (
    -- Already-expired batches are excluded rather than counted as "expiring": an admin
    -- chasing expiry warnings wants the stock still sellable, and a batch past its date
    -- is a withdrawal problem, not a warning.
    select count(*)::bigint as expiring
      from batches
     where expiry_date is not null
       and expiry_date >= current_date
       and expiry_date <= current_date + v_days
  ),
  value as (
    -- Valued at the current selling price. Left joins so a batch whose product row has
    -- gone is valued at zero rather than dropping the whole batch out of the total.
    select coalesce(sum(b.quantity * coalesce(p.price, 0)), 0)::numeric as inventory_value
      from batches b
      left join public.products p on p.id = b.product_id
  )
  select d.revenue, d.delivered_orders, d.discounts,
         s.low_stock, s.out_of_stock, n.expiring, v.inventory_value
    from delivered d
    cross join stock   s
    cross join soon    n
    cross join value   v;
end;
$$;


-- ==========================================================================
-- Customer spend — a cancelled order is not money spent
-- ==========================================================================
--
-- The order count below deliberately still counts every order, cancelled included: "how
-- many orders has this customer placed" is a question about their history, and the shop
-- owner still placed and cancelled it. Only the money total is filtered, because a
-- cancelled order is one where no payment is ever collected.
create or replace function public.get_customers_with_stats(p_query text DEFAULT NULL::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
returns TABLE(id uuid, name text, email text, phone text, role text, avatar_url text, created_at timestamp with time zone, order_count bigint, total_spent numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Anon-callable and unguarded: any logged-out visitor could page the whole customer
  -- list out of this, because SECURITY DEFINER ignores the RLS on profiles and orders.
  if not public.is_admin() then
    raise exception 'Only admins can query customers';
  end if;
  return query

  select
    p.id,
    p.name,
    p.email,
    p.phone,
    p.role,
    p.avatar_url,
    p.created_at,
    coalesce(o.order_count, 0) as order_count,
    coalesce(o.total_spent, 0) as total_spent
  from public.profiles p
  left join (
    select customer_id,
           count(*)::bigint as order_count,
           sum(total) filter (where status <> 'CANCELLED')::numeric as total_spent
    from public.orders
    group by customer_id
  ) o on o.customer_id = p.id
  where p.role = 'customer'
    and (
      p_query is null or p_query = ''
      or p.name ilike '%' || p_query || '%'
      or coalesce(p.email,'') ilike '%' || p_query || '%'
      or coalesce(p.phone,'') ilike '%' || p_query || '%'
    )
  order by p.created_at desc
  limit p_limit offset p_offset;
end;
$$;

create or replace function public.get_customer_stats(p_customer_id uuid)
returns TABLE(order_count bigint, total_spent numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Anon-callable and unguarded: any logged-out visitor could page the whole customer
  -- list out of this, because SECURITY DEFINER ignores the RLS on profiles and orders.
  if not public.is_admin() then
    raise exception 'Only admins can query customers';
  end if;
  return query

  select count(*)::bigint as order_count,
         coalesce(sum(total) filter (where status <> 'CANCELLED'), 0)::numeric as total_spent
  from public.orders where customer_id = p_customer_id;
end;
$$;

-- ==========================================================================
-- Real profit, and stock that comes back when an order is cancelled or a return
-- approved.
-- ==========================================================================
--
-- Appended verbatim from 20260930010000_real_profit_and_stock_restore.sql. Kept as a
-- byte-for-byte copy so `verify-sql-sync.mjs` can hold the two files to each other;
-- if the two ever differ, a rebuilt project would run different rules from the one
-- being tested and nothing would say so until the numbers disagreed.

-- Real profit, and stock that comes back when an order is cancelled or a return approved.
--
-- Four separate defects are fixed here. Each was found by reading the live database rather
-- than the client, and two of them had been hiding behind each other.
--
--   1. `get_admin_dashboard_sales` guarded itself with `auth.jwt() ->> 'role' <> 'admin'`.
--      The custom access token hook is DISABLED on this project, and the hook function --
--      even if it were enabled -- writes `app_role`, never `role`. So the claim is always
--      the Postgres role, 'authenticated', the comparison is always true, and the function
--      raised on every single call. It could never return a number to anybody.
--
--   2. Because it always failed, `fetchSalesAggregates` in the client caught the error and
--      re-aggregated in JavaScript. That fallback summed `order_items` with no join to
--      `orders` and no status filter, so CANCELLED orders counted as sales, and it
--      substituted `unit_price * 0.8` for a missing cost price -- inventing a 20% margin
--      and reporting the difference as earnings.
--
--   3. `transition_order_status` set the status and wrote a timeline note. Cancelling an
--      order never returned the deducted units to `inventory_items`, so the stock was gone
--      from inventory permanently.
--
--   4. Approving a return did nothing at all -- no restock, no profit reversal -- and
--      `return_requests` had no `product_id`, only a denormalised `product_name`, so the
--      database could not even tell which product to put back.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Remember which batches each order line drew from
-- ─────────────────────────────────────────────────────────────────────────────
--
-- "Undo exactly" needs the allocation to be recorded, and it has to be recorded at
-- deduction time because the FIFO walk is the only moment the mapping is known. One row
-- per (order line, batch) pair; a line that spans three batches has three rows.
create table if not exists public.order_item_allocations (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  -- The idempotency guard. A line can never give back more than it took, and never twice.
  restocked_quantity integer not null default 0
    check (restocked_quantity >= 0 and restocked_quantity <= quantity),
  created_at timestamptz not null default now()
);

create index if not exists idx_allocations_order_item
  on public.order_item_allocations (order_item_id);
create index if not exists idx_allocations_order
  on public.order_item_allocations (order_id);

comment on table public.order_item_allocations is
  'Which inventory batches each order line was deducted from, so a cancelled order or an approved return can be undone exactly. restocked_quantity makes a double restock impossible.';

-- No policies: the table is reachable only from the SECURITY DEFINER functions below.
-- Nothing in the app reads it directly.
alter table public.order_item_allocations enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. deduct_inventory_fifo records the allocation
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The 2-argument form is dropped rather than left as an overload: an old 2-arg version
-- would still deduct stock without recording where it went, which is the exact bug being
-- fixed. `default null` keeps existing 2-argument calls working -- the default applies to
-- the single 3-argument function, not to a second function.
drop function if exists public.deduct_inventory_fifo(uuid, integer);

create or replace function public.deduct_inventory_fifo(
  p_product_id uuid,
  p_quantity integer,
  p_order_item_id uuid default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_remaining integer := p_quantity;
  v_inv record;
  v_taken integer;
begin
  -- Lock the batch rows so validation + deduction see a consistent snapshot
  for v_inv in
    select id, quantity from public.inventory_items
    where product_id = p_product_id
      and quantity > 0
      and (expiry_date is null or expiry_date >= current_date)
    order by
      case when expiry_date is null then 1 else 0 end,
      expiry_date asc,
      last_updated asc
    for update
  loop
    exit when v_remaining <= 0;
    if v_inv.quantity >= v_remaining then
      v_taken := v_remaining;
      update public.inventory_items set quantity = quantity - v_remaining where id = v_inv.id;
      v_remaining := 0;
    else
      v_taken := v_inv.quantity;
      v_remaining := v_remaining - v_inv.quantity;
      update public.inventory_items set quantity = 0 where id = v_inv.id;
    end if;

    -- Record which batch this line just drew from. `on conflict ... do update` because a
    -- cart holding the same product twice merges into ONE order line and calls this
    -- function twice, so the same (line, batch) pair can legitimately appear twice.
    if p_order_item_id is not null then
      insert into public.order_item_allocations
        (order_item_id, order_id, inventory_item_id, quantity)
      values
        (p_order_item_id,
         (select order_id from public.order_items where id = p_order_item_id),
         v_inv.id, v_taken)
      on conflict (order_item_id, inventory_item_id) do update
        set quantity = public.order_item_allocations.quantity + excluded.quantity;
    end if;
  end loop;

  -- Concurrent safety: if still remaining, stock was consumed between validation and deduction
  if v_remaining > 0 and exists (select 1 from public.inventory_items where product_id = p_product_id) then
    raise exception 'Insufficient stock for product';
  end if;

  -- Legacy fallback if the product has no inventory rows at all. Nothing is recorded,
  -- because there is no batch to record against -- restock_order_lines() handles that
  -- case separately rather than pretending the undo was exact.
  if v_remaining = p_quantity then
    update public.products set stock = stock - p_quantity where id = p_product_id;
  end if;
end;
$$;

create unique index if not exists idx_allocations_line_batch
  on public.order_item_allocations (order_item_id, inventory_item_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. restock_order_lines -- the undo
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Walks the allocation newest-first, so the units go back to the batches they most
-- recently came out of, and stops at what the line actually took. Two cases it must not
-- silently paper over:
--
--   * An order placed before this migration has no allocation rows. Falling back to the
--     earliest-expiry non-empty batch is near-correct, not exact, and says so.
--   * The original batch may have expired since. The units go back into it and are then
--     correctly excluded from future sales by the same expiry test the deduction used.
create or replace function public.restock_order_lines(
  p_order_id uuid,
  p_order_item_id uuid,
  p_quantity integer,
  p_reason text default 'return'
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_remaining integer := p_quantity;
  v_alloc record;
  v_take integer;
  v_alloc_rows integer;
  v_fallback record;
  v_result text;
begin
  if p_quantity is null or p_quantity <= 0 then
    return 'nothing to restock (' || p_reason || ')';
  end if;

  -- Without a line there is no product, no batch and no allocation, so every statement
  -- below would quietly match zero rows. Said plainly, instead of by omission.
  if p_order_item_id is null then
    return 'NOT restocked: this return is not linked to an order line, so there is no stock to put back (' || p_reason || ')';
  end if;

  for v_alloc in
    select a.id, a.inventory_item_id, a.quantity, a.restocked_quantity
    from public.order_item_allocations a
    where a.order_item_id = p_order_item_id
      and a.restocked_quantity < a.quantity
    order by a.created_at desc, a.id desc
    for update
  loop
    exit when v_remaining <= 0;
    v_take := least(v_remaining, v_alloc.quantity - v_alloc.restocked_quantity);
    update public.order_item_allocations
      set restocked_quantity = restocked_quantity + v_take
      where id = v_alloc.id;
    update public.inventory_items
      set quantity = quantity + v_take
      where id = v_alloc.inventory_item_id;
    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    -- The remaining units can only be placed if this line has NO allocation record at all.
    --
    -- "Nothing left to draw on" has two quite different meanings, and conflating them
    -- invents stock. Either the order predates the allocation table and there is nothing to
    -- undo against, or the line's allocations exist and have *already* been fully returned
    -- -- a cancelled order being asked for a second time, or a restock for more units than
    -- the line ever took. In the second case topping up an unrelated batch creates units
    -- that were never bought. (This is not hypothetical: the first version of this function
    -- fell through to the batch fallback in both cases, and the suite caught it adding five
    -- tablets to a batch on an order that had already been cancelled.)
    select count(*) into v_alloc_rows
    from public.order_item_allocations
    where order_item_id = p_order_item_id;

    if v_alloc_rows > 0 then
      v_result := format(
        'NOT restocked: %s unit(s) were asked for but this line has only %s left to give back, so none were added',
        p_quantity, p_quantity - v_remaining
      );
    else
      -- No allocation record: an order placed before this table existed. The earliest
      -- expiry batch is the best guess available and the note says it is a guess.
      select i.id into v_fallback
      from public.inventory_items i
      where i.product_id = (select product_id from public.order_items where id = p_order_item_id)
      order by
        case when i.expiry_date is null then 1 else 0 end,
        i.expiry_date asc,
        i.last_updated asc
      limit 1
      for update;

      if v_fallback is not null then
        update public.inventory_items set quantity = quantity + v_remaining where id = v_fallback.id;
        v_result := format('restocked %s into the earliest-expiry batch, not the original (this order has no allocation record)', v_remaining);
      else
        -- Legacy product with no batch rows: mirror the deduction's own fallback.
        update public.products
        set stock = stock + v_remaining
        where id = (select product_id from public.order_items where id = p_order_item_id);
        v_result := format('restocked %s onto products.stock (no batch rows exist)', v_remaining);
      end if;
    end if;
  else
    v_result := format('restocked %s into the original batch(es)', p_quantity);
  end if;

  return coalesce(v_result, '') || ' (' || p_reason || ')';
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. create_order passes the order line through
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.create_order(p_customer_id uuid, p_address_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$

declare
  v_order_id uuid;
  v_existing_id uuid;
  v_existing_subtotal numeric;
  v_existing_discount numeric;
  v_subtotal numeric := 0;
  v_cart_subtotal numeric := 0;
  v_discount numeric := 0;
  v_delivery_fee numeric;
  v_total numeric := 0;
  v_customer_name text;
  v_address_text text;
  v_address_district text;
  v_cart_item record;
  v_product record;
  v_order_item_id uuid;
  v_total_stock integer;
begin
  -- This took p_customer_id on trust, so a caller could name a different customer and
  -- have the ownership check further down validate that wrong pair. The app only ever
  -- passes the signed-in user's own id, so requiring that costs nothing and closes
  -- the impersonation.
  if auth.uid() is distinct from p_customer_id then
    raise exception 'Customer ID must match authenticated user';
  end if;
  select name into v_customer_name from public.profiles where id = p_customer_id;
  if not found then
    raise exception 'Customer not found';
  end if;
  if not exists (select 1 from public.cart_items where user_id = p_customer_id) then
    raise exception 'Cart is empty';
  end if;

  -- Refuse a missing address outright rather than defaulting it to an empty string.
  if p_address_id is null then
    raise exception 'Delivery address is required';
  end if;

  -- Ownership is part of the lookup, not a separate check afterwards. SECURITY DEFINER
  -- bypasses RLS on `addresses`, so the `user_id = p_customer_id` predicate here is the
  -- ONLY thing standing between a caller and another customer's address.
  --
  -- An address that does not exist and one that belongs to somebody else are deliberately
  -- reported the same way, so this cannot be used to confirm whether an id is real.
  select street || ', ' || city || coalesce(', ' || county, '') || coalesce(', ' || postal_code, ''),
         county
    into v_address_text, v_address_district
  from public.addresses
  where id = p_address_id and user_id = p_customer_id;

  if v_address_text is null then
    raise exception 'Delivery address not found';
  end if;

  -- NOT NULL on street/city does not stop an empty string, and the client-side check is
  -- bypassable, so an unusable address is refused here rather than at delivery time.
  if btrim(v_address_text) in ('', ',') then
    raise exception 'Delivery address is incomplete';
  end if;

  -- Priced from the district, not hard-coded. A null or unrecognised district falls to the
  -- standard rate inside delivery_fee_for_district() rather than needing a guard here.
  v_delivery_fee := public.delivery_fee_for_district(v_address_district);

  -- Check for existing PENDING invoice for this customer (row-level lock to prevent race)
  --
  -- `delivery_fee` is deliberately no longer selected out. It used to be read into
  -- `v_existing_delivery_fee` and carried into the recalculated total, which kept the old
  -- charge on an order whose address had changed. The fee is now recomputed from the
  -- address passed to this call, so there is nothing here for the existing row to
  -- contribute.
  select id, subtotal, discount into v_existing_id, v_existing_subtotal, v_existing_discount
  from public.orders
  where customer_id = p_customer_id and status = 'PENDING'
  order by created_at desc
  limit 1
  for update;

  -- Validate cart items and compute cart subtotal (products must exist and be active)
  for v_cart_item in select * from public.cart_items where user_id = p_customer_id loop
    select * into v_product from public.products where id = v_cart_item.product_id and is_active = true;
    if not found then
      raise exception 'Product not available';
    end if;
    -- Authoritative available stock = non-expired inventory sum, falling back to
    -- products.stock only for legacy products with no inventory rows at all.
    select coalesce(sum(quantity), 0) into v_total_stock
    from public.inventory_items
    where product_id = v_cart_item.product_id
      and (expiry_date is null or expiry_date >= current_date);
    if v_total_stock = 0 and not exists (select 1 from public.inventory_items where product_id = v_cart_item.product_id) then
      v_total_stock := v_product.stock;
    end if;
    if v_total_stock < v_cart_item.quantity then
      raise exception 'Insufficient stock for product %', v_product.name;
    end if;
    v_cart_subtotal := v_cart_subtotal + (v_product.price * v_cart_item.quantity);
  end loop;

  if v_existing_id is not null then
    -- Append to existing PENDING invoice
    v_order_id := v_existing_id;
    for v_cart_item in select * from public.cart_items where user_id = p_customer_id loop
      select * into v_product from public.products where id = v_cart_item.product_id;
      -- Handle duplicate product in same order: merge quantity if already exists
      if exists (select 1 from public.order_items where order_id = v_order_id and product_id = v_cart_item.product_id) then
        update public.order_items
        set quantity = quantity + v_cart_item.quantity,
            total = (quantity + v_cart_item.quantity) * v_product.price
        where order_id = v_order_id and product_id = v_cart_item.product_id;
        -- The merge means there is no RETURNING clause to read an id from, so it is looked
        -- up. This is the id the allocation is recorded against, which is what makes the
        -- eventual cancel an exact undo rather than a guess.
        select id into v_order_item_id
        from public.order_items
        where order_id = v_order_id and product_id = v_cart_item.product_id;
      else
        insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, discount_percent, total)
        values (v_order_id, v_cart_item.product_id, v_product.name, v_cart_item.quantity, v_product.price, 0, v_product.price * v_cart_item.quantity)
        returning id into v_order_item_id;
      end if;
      perform public.deduct_inventory_fifo(v_cart_item.product_id, v_cart_item.quantity, v_order_item_id);
    end loop;
    -- Recalc totals: subtotal + cart, one delivery fee.
    --
    -- The fee is REPRICED from the address passed in here, rather than carried over from
    -- the existing order. This line used to read
    -- `coalesce(v_existing_delivery_fee, v_delivery_fee)`, which was harmless while the fee
    -- was a constant and is wrong now: a customer who first ordered to Chattogram and then
    -- added an item while switching to a Dhaka address would keep paying the 150 they were
    -- quoted, against an 80 rate. `delivery_fee` is written explicitly below too, so the
    -- stored row and the new total cannot disagree with each other either.
    v_subtotal := coalesce(v_existing_subtotal, 0) + v_cart_subtotal;
    v_total := v_subtotal - coalesce(v_existing_discount, 0) + v_delivery_fee;
    update public.orders
    set subtotal = v_subtotal,
        delivery_fee = v_delivery_fee,
        total = v_total,
        updated_at = now(),
        -- Always the address just validated. This used to be
        -- `case when v_address_text <> '' then v_address_text else address end`, which kept
        -- whatever was there before; with the guard above v_address_text is never empty,
        -- so the fallback is dead code that would only ever preserve a stale address.
        address = v_address_text,
        timeline = coalesce(timeline, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('label', 'ITEMS_ADDED', 'time', now()::text, 'note', v_cart_subtotal::text || ' added'))
    where id = v_order_id;
  else
    -- No pending invoice: create new as before
    v_subtotal := v_cart_subtotal;
    v_total := v_subtotal - v_discount + v_delivery_fee;
    insert into public.orders (order_number, customer_id, customer_name, status, subtotal, discount, delivery_fee, total, payment_method, address)
    values (null, p_customer_id, v_customer_name, 'PENDING', v_subtotal, v_discount, v_delivery_fee, v_total, 'CASH_ON_DELIVERY', v_address_text)
    returning id into v_order_id;
    for v_cart_item in select * from public.cart_items where user_id = p_customer_id loop
      select * into v_product from public.products where id = v_cart_item.product_id;
      insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, discount_percent, total)
      values (v_order_id, v_cart_item.product_id, v_product.name, v_cart_item.quantity, v_product.price, 0, v_product.price * v_cart_item.quantity)
      returning id into v_order_item_id;
      perform public.deduct_inventory_fifo(v_cart_item.product_id, v_cart_item.quantity, v_order_item_id);
    end loop;
  end if;

  delete from public.cart_items where user_id = p_customer_id;
  return v_order_id;
end;

$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Cancelling an order gives the stock back
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.transition_order_status(
  p_order_id uuid,
  p_new_status text,
  p_admin_id uuid
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_catalog'
as $$
declare
  v_current_status text;
  v_allowed boolean := false;
  v_line record;
  v_note text := '';
begin
  if not public.is_admin() then
    raise exception 'Only admins can change order status';
  end if;
  if p_admin_id is distinct from auth.uid() then
    raise exception 'Admin ID must match authenticated user';
  end if;
  if not exists (select 1 from auth.users where id = p_admin_id and public.is_admin_email(email)) then
    raise exception 'Only allowlisted admins can change order status';
  end if;

  select status into v_current_status from public.orders where id = p_order_id;
  if not found then
    raise exception 'Order not found';
  end if;

  v_allowed := (
      (v_current_status = 'PENDING'     and p_new_status in ('CONFIRMED', 'CANCELLED'))
   or (v_current_status = 'CONFIRMED'   and p_new_status in ('PROCESSING', 'CANCELLED'))
   or (v_current_status = 'PROCESSING'  and p_new_status in ('OUT_FOR_DELIVERY', 'CANCELLED'))
   or (v_current_status = 'OUT_FOR_DELIVERY' and p_new_status in ('DELIVERED'))
   or (v_current_status = 'DELIVERED'   and p_new_status in ('RETURNED'))
  );
  if not v_allowed then
    raise exception 'Invalid status transition from % to %', v_current_status, p_new_status;
  end if;

  update public.orders
  set status = p_new_status,
      updated_at = now(),
      timeline = coalesce(timeline, '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object('label', 'STATUS_CHANGED', 'time', now()::text, 'note', v_current_status || ' → ' || p_new_status)
      )
  where id = p_order_id;

  -- Cancelling used to move the order and nothing else. Every unit the order had drawn
  -- out of `inventory_items` stayed out, permanently, so the stock level silently drifted
  -- below the truth for the rest of time. Each line is put back separately, because
  -- restock_order_lines() stops at what that line actually took.
  if p_new_status = 'CANCELLED' then
    for v_line in
      select id, quantity from public.order_items where order_id = p_order_id
    loop
      v_note := v_note || public.restock_order_lines(p_order_id, v_line.id, v_line.quantity, 'order cancelled') || '; ';
    end loop;

    update public.orders
    set timeline = coalesce(timeline, '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object('label', 'STOCK_RESTOCKED', 'time', now()::text, 'note', v_note)
    )
    where id = p_order_id;
  end if;

  return true;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. A return can identify its product, and approval restores the stock
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.return_requests add column if not exists product_id uuid references public.products(id) on delete set null;
alter table public.return_requests add column if not exists order_item_id uuid references public.order_items(id) on delete set null;
alter table public.return_requests add column if not exists approved_at timestamptz;
alter table public.return_requests add column if not exists restock_note text;

comment on column public.return_requests.product_id is
  'Denormalised product_name could not identify a row to restock. Backfilled by matching the name against the order''s own lines.';
comment on column public.return_requests.approved_at is
  'When the return was approved. Profit is reversed at this timestamp, not at the order''s date.';
comment on column public.return_requests.restock_note is
  'What happened to the stock when this return was approved, in one line of plain words. Written whether or not it worked, so an approval that could not restore stock is visible on the returns screen instead of being a silent no-op.';

-- Backfill by matching the name against the lines of THAT order. Guessing from the
-- product table alone could pick a different product that happens to share a name.
update public.return_requests r
set order_item_id = oi.id,
    product_id = oi.product_id
from public.order_items oi
where r.order_id = oi.order_id
  and r.order_item_id is null
  and lower(trim(r.product_name)) = lower(trim(oi.product_name));

-- ─────────────────────────────────────────────────────────────────────────────
-- 6b. Approving a return gives the units back
-- ─────────────────────────────────────────────────────────────────────────────
--
-- This deliberately never raises.
--
-- It is tempting to `raise exception` when a return cannot be restocked, and it was the
-- first version. That is the wrong shape: the trigger runs inside the admin's PATCH, so a
-- raise takes down the whole approval and leaves the return stuck in PENDING with no way
-- out. The admin has judged the return legitimate; the fact that this particular row cannot
-- be matched to a batch is a bookkeeping gap, and it should not be able to veto them.
--
-- So the rule is: approve, restock as much as can be justified, and write down exactly
-- what happened in `restock_note`. The returns screen shows that note, so a return whose
-- stock did not come back is visible to the shop instead of quietly eating inventory.
create or replace function public.approve_return_stock(p_return_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ret public.return_requests%rowtype;
  v_line_quantity integer;
  v_already_returned integer;
  v_quantity integer;
  v_requested integer;
begin
  select * into v_ret from public.return_requests where id = p_return_id;
  if not found then
    return 'NOT restocked: the return request no longer exists';
  end if;

  if v_ret.order_item_id is null then
    -- The only case the app can still produce, and only for rows that predate this
    -- migration. `product_name` is text, so there is nothing to restock from.
    return format(
      'NOT restocked: this return names "%s" but is not linked to an order line, so the units could not be identified. Match it to the order''s line by hand, or the stock stays short.',
      coalesce(v_ret.product_name, '(no product recorded)')
    );
  end if;

  select quantity into v_line_quantity from public.order_items where id = v_ret.order_item_id;
  v_requested := coalesce(v_ret.quantity, 0);

  -- Never restock more than the line held, even across several separate returns. Without
  -- this a second return on the same line would put back stock that was never sold. The
  -- shortfall is reported rather than refused, for the reason above.
  select coalesce(sum(quantity), 0) into v_already_returned
  from public.return_requests
  where order_item_id = v_ret.order_item_id
    and id <> v_ret.id
    and status in ('APPROVED', 'PROCESSED');

  v_quantity := least(v_requested, coalesce(v_line_quantity, 0) - v_already_returned);

  if v_quantity <= 0 then
    return format(
      'NOT restocked: %s unit(s) were requested but %s of %s had already been returned on this order line',
      v_requested, v_already_returned, coalesce(v_line_quantity, 0)
    );
  end if;

  if v_quantity < v_requested then
    return format(
      'partly restocked: %s of %s unit(s) — %s had already been returned on this order line. %s',
      v_quantity, v_requested, v_already_returned,
      public.restock_order_lines(v_ret.order_id, v_ret.order_item_id, v_quantity, 'return approved')
    );
  end if;

  return public.restock_order_lines(v_ret.order_id, v_ret.order_item_id, v_quantity, 'return approved');
end;
$$;

-- A trigger rather than a new RPC, because the app approves a return by PATCHing
-- `return_requests` directly. Firing on the status crossing to APPROVED -- and only then
-- -- means a second approval cannot restock twice, with no separate bookkeeping to keep in
-- step with the status. The `old.status is distinct from` half is the idempotency: a
-- re-save that leaves the status at APPROVED does nothing, so approving twice is harmless
-- without the admin having to know that.
create or replace function public.trg_return_restock()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'APPROVED' and (old.status is distinct from 'APPROVED') then
    new.approved_at := now();
    new.restock_note := public.approve_return_stock(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_return_restock on public.return_requests;
create trigger trg_return_restock
  before update of status on public.return_requests
  for each row execute function public.trg_return_restock();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Real profit
-- ─────────────────────────────────────────────────────────────────────────────
--
-- One function, used by both the dashboard card and the reports screen, so the two cannot
-- drift apart again.
--
-- The rules, in the order they matter:
--
--   * Only DELIVERED orders count. A PENDING order has not been sold, so it has earned
--     nothing. Cancelling therefore needs no profit reversal at all -- the order was never
--     in the figure to begin with. That is the whole reason the cancel path above only
--     touches stock.
--   * An approved return comes off at its APPROVAL date, not the order's date, so
--     approving a return today reduces this month's number and leaves last month's
--     settled figure alone.
--   * A line with no cost price contributes NOTHING. The old code substituted
--     `unit_price * 0.8` and reported the difference as earnings, which is not a
--     measurement. The count is returned so the card can say which products to price.
create or replace function public.profit_since(p_since timestamptz)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_profit numeric := 0;
  v_returned_profit numeric := 0;
  v_unpriced_items integer := 0;
  v_unpriced_qty integer := 0;
  v_unlinked_returns integer := 0;
  v_trend jsonb := '[]'::jsonb;
begin
  -- Gross: delivered lines only, real cost price required. The FULL line quantity counts
  -- here. Returns are subtracted once, separately, dated by approval -- also netting them
  -- into the line would count the same refund twice whenever the sale and the refund fall
  -- inside one window.
  -- `count(distinct p.id)`, not `count(*)`. The card says "N products have no cost price
  -- set", and `count(*)` counted order *lines*: one product sold three times in the window
  -- reported as 3 products, so the number the owner acted on did not match anything they
  -- could see in the catalog they were being sent to. `v_unpriced_qty` stays a line sum,
  -- because there the quantity is the point -- it is how many units of earnings are
  -- missing rather than how many rows were skipped.
  select
    coalesce(sum((oi.unit_price - p.cost_price) * oi.quantity), 0)::numeric,
    count(distinct p.id) filter (where p.cost_price is null),
    coalesce(sum(oi.quantity) filter (where p.cost_price is null), 0)::int
  into v_profit, v_unpriced_items, v_unpriced_qty
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  join public.products p on p.id = oi.product_id
  where o.status = 'DELIVERED'
    and oi.created_at >= p_since;

  -- Reversals, dated by when the return was APPROVED rather than when the order was
  -- placed. A line that was never priced contributes nothing here either: reversing a
  -- guess would still be a guess.
  select coalesce(sum((oi.unit_price - p.cost_price) * r.quantity), 0)::numeric
  into v_returned_profit
  from public.return_requests r
  join public.order_items oi on oi.id = r.order_item_id
  join public.products p on p.id = oi.product_id
  where r.status in ('APPROVED', 'PROCESSED')
    and r.approved_at is not null
    and r.approved_at >= p_since
    and p.cost_price is not null;

  -- An approved return with no order line has no unit price and no cost price, so the join
  -- above skips it and the figure above is not reversed. That is the correct direction to
  -- err in -- guessing a margin is worse than a known gap -- but a gap that cannot be seen
  -- is a gap nobody fixes, so it is counted and reported. The returns screen shows the
  -- same problem on each row, as `restock_note`.
  select count(*)::int
  into v_unlinked_returns
  from public.return_requests
  where status in ('APPROVED', 'PROCESSED')
    and approved_at is not null
    and approved_at >= p_since
    and order_item_id is null;

  -- 7-day net trend, obeying exactly the same two rules as the headline figure, so the
  -- sparkline and the number above can never disagree.
  with days as (
    select generate_series((current_date - interval '6 days')::date, current_date::date, '1 day'::interval)::date as d
  ), gross as (
    select oi.created_at::date as d,
           sum((oi.unit_price - p.cost_price) * oi.quantity)::numeric as earn
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    join public.products p on p.id = oi.product_id
    where o.status = 'DELIVERED'
      and oi.created_at >= p_since
      and p.cost_price is not null
    group by 1
  ), ret as (
    select r.approved_at::date as d,
           sum((oi.unit_price - p.cost_price) * r.quantity)::numeric as earn
    from public.return_requests r
    join public.order_items oi on oi.id = r.order_item_id
    join public.products p on p.id = oi.product_id
    where r.status in ('APPROVED', 'PROCESSED')
      and r.approved_at is not null
      and r.approved_at >= p_since
      and p.cost_price is not null
    group by 1
  )
  select coalesce(
           jsonb_agg(round(coalesce(g.earn, 0) - coalesce(rt.earn, 0)) order by days.d),
           '[]'::jsonb
         )
  into v_trend
  from days
  left join gross g on g.d = days.d
  left join ret rt on rt.d = days.d;

  return jsonb_build_object(
    'profit', round(coalesce(v_profit, 0) - coalesce(v_returned_profit, 0), 2),
    'grossProfit', round(coalesce(v_profit, 0), 2),
    'returnedProfit', round(coalesce(v_returned_profit, 0), 2),
    'unpricedItems', v_unpriced_items,
    'unpricedQty', v_unpriced_qty,
    'unlinkedReturns', v_unlinked_returns,
    'profitTrend', v_trend
  );
end;
$$;



-- ─────────────────────────────────────────────────────────────────────────────
-- 8. The dashboard aggregate, finally able to answer
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_admin_dashboard_sales(p_since timestamptz)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_total_sales_qty int := 0;
  v_total_revenue numeric := 0;
  v_sales_trend jsonb := '[]'::jsonb;
  v_profit jsonb;
begin
  -- is_admin() reads the email allowlist, which is the one place an administrator is
  -- defined. This used to read `auth.jwt() ->> 'role'`, a claim this project has never
  -- had: the access token hook is disabled, and the hook function writes `app_role`, not
  -- `role`. So it raised for everybody, and the client silently fell back to a
  -- JavaScript re-aggregation that counted cancelled orders and invented a 20% margin.
  if not public.is_admin() then
    raise exception 'Only admins can query dashboard sales';
  end if;

  select coalesce(sum(total), 0)::numeric
  into v_total_revenue
  from public.orders
  where created_at >= p_since
    and status = 'DELIVERED';

  with days as (
    select generate_series((current_date - interval '6 days')::date, current_date::date, '1 day'::interval)::date as d
  ), qty_by_day as (
    select oi.created_at::date as d, sum(oi.quantity)::int as qty
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.created_at >= p_since and o.status = 'DELIVERED'
    group by 1
  )
  select coalesce(jsonb_agg(coalesce(q.qty, 0) order by days.d), '[]'::jsonb)
  into v_sales_trend
  from days
  left join qty_by_day q on q.d = days.d;

  select count(*)::int into v_total_sales_qty
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.created_at >= p_since and o.status = 'DELIVERED';

  v_profit := public.profit_since(p_since);

  return jsonb_build_object(
    'totalSalesQty', v_total_sales_qty,
    'totalSalesRevenue', v_total_revenue,
    'totalEarning', v_profit->'profit',
    'grossProfit', v_profit->'grossProfit',
    'returnedProfit', v_profit->'returnedProfit',
    'deliveredQty', v_profit->'deliveredQty',
    'unpricedItems', v_profit->'unpricedItems',
    'unpricedQty', v_profit->'unpricedQty',
    'unlinkedReturns', v_profit->'unlinkedReturns',
    'salesTrend', v_sales_trend,
    'earningTrend', v_profit->'profitTrend',
    'returnTrend', v_profit->'returnTrend'
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Grants
-- ─────────────────────────────────────────────────────────────────────────────
-- The lockdown migration revoked these from anon/public. Redone here because
-- `deduct_inventory_fifo` gained an argument, which makes it a DIFFERENT function to
-- PostgreSQL -- the old revoke would not apply to it and it would be wide open again.
--
-- `authenticated` is revoked alongside anon, and that is the part worth writing down.
-- This project's default privileges are
--     {postgres=X, anon=X, authenticated=X, service_role=X} to PUBLIC
-- for every new function, applied at CREATE time. So `revoke ... from public` does NOT
-- close a function: PUBLIC loses the grant, but the explicit `authenticated=X` entry
-- stays, and every signed-in customer inherits it. On the first pass at this migration
-- that left `restock_order_lines` callable by any customer -- which would have let a
-- stranger add stock to any batch just by knowing a product id. Revoking from anon and
-- public is only half the job on a Supabase project; the role has to be named.
revoke all on function public.deduct_inventory_fifo(uuid, integer, uuid) from public, anon, authenticated;
revoke all on function public.restock_order_lines(uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.approve_return_stock(uuid) from public, anon, authenticated;
revoke all on function public.profit_since(timestamptz) from public, anon, authenticated;
revoke all on function public.trg_return_restock() from public, anon, authenticated;

-- Only these three are the app's actual entry points, and each is reachable only from
-- inside a guarded function or from the app as the signed-in user it is meant to be.
--   create_order                    -> the customer, and refuses a p_customer_id that is not auth.uid()
--   transition_order_status         -> is_admin() plus an allowlist check on the email
--   get_admin_dashboard_sales       -> is_admin()
--
-- anon and PUBLIC are revoked from all three as well, which they were not before. Each
-- already refused a logged-out caller through the in-function guard, so this changes no
-- message the app shows -- it just stops an anonymous request from getting far enough to
-- run the guard, and keeps the guard as the second line rather than the only one.
revoke all on function public.get_admin_dashboard_sales(timestamptz) from public, anon;
revoke all on function public.create_order(uuid, uuid) from public, anon;
revoke all on function public.transition_order_status(uuid, text, uuid) from public, anon;

grant execute on function public.get_admin_dashboard_sales(timestamptz) to authenticated;
grant execute on function public.create_order(uuid, uuid) to authenticated;
grant execute on function public.transition_order_status(uuid, text, uuid) to authenticated;
