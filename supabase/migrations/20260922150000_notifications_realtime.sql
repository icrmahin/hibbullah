-- Enable Realtime for notifications (and favorites for cross-device, plus products for stock)
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.favorites;
alter publication supabase_realtime add table public.products;
alter publication supabase_realtime add table public.inventory_items;
