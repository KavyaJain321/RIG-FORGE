-- Belt-and-suspenders: enable Row-Level Security on EVERY base table in the
-- public schema that doesn't already have it. Idempotent + future-proof — run
-- it after adding new Prisma models (Prisma never enables RLS itself, which is
-- how `CustomRole` ended up publicly readable via the Supabase anon key / REST).
--
-- Safe for the app: Prisma connects as the table OWNER (the project `postgres`
-- role), which BYPASSES RLS — so all server data access is unaffected. This only
-- closes the anon/`authenticated` PostgREST + Realtime surface. Chat tables get
-- their scoped SELECT policies separately in chat-rls.sql (needed for Realtime).
--
-- Apply per environment (dev AND prod are separate Supabase projects):
--   Supabase dashboard → SQL editor → paste → Run.
do $$
declare t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not c.relrowsecurity
      and c.relname not like '\_prisma%'   -- skip Prisma's migration bookkeeping
  loop
    execute format('alter table public.%I enable row level security', t.relname);
    raise notice 'RLS enabled: %', t.relname;
  end loop;
end $$;
