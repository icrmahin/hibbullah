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
('20260922210000_stock_auto_deactivate')
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