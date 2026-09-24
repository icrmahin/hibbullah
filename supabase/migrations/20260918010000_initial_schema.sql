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