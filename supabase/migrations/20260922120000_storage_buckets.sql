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
