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
