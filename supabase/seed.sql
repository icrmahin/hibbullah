-- Hibbullah — deterministic local seed (empty)
-- Run via: npx supabase db reset (local only)
-- No mock data: admins are the fixed allowlist emails (icrmahin@gmail.com,
-- hibbullah82026@gmail.com, hibbullah2027@gmail.com) and are promoted to role=admin
-- automatically by handle_new_user on signup. That list lives in public.is_admin_email()
-- and nowhere else. Products/categories/manufacturers are added by
-- the admin from the app; the catalog starts empty.

-- Ensure extensions exist (idempotent)
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;