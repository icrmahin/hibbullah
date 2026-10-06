-- is_blocked() is referenced inside RLS policies that anonymous callers evaluate
-- (orders/order_items/return_requests SELECT). Without EXECUTE for anon, every
-- anonymous read fails closed with 42501 instead of returning zero rows.
-- The function leaks nothing: with no session auth.uid() is null and it returns false.
grant execute on function public.is_blocked() to anon;
