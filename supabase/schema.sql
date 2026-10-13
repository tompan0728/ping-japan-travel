create table if not exists public.travel_app_documents (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.travel_app_documents enable row level security;
alter table public.app_admins enable row level security;

drop policy if exists "Authenticated users can read travel data" on public.travel_app_documents;
drop policy if exists "Anyone can read travel data" on public.travel_app_documents;
create policy "Anyone can read travel data"
  on public.travel_app_documents
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins can insert travel data" on public.travel_app_documents;
create policy "Admins can insert travel data"
  on public.travel_app_documents
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.app_admins
      where app_admins.user_id = auth.uid()
    )
  );

drop policy if exists "Admins can update travel data" on public.travel_app_documents;
create policy "Admins can update travel data"
  on public.travel_app_documents
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.app_admins
      where app_admins.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.app_admins
      where app_admins.user_id = auth.uid()
    )
  );

drop policy if exists "Admins can read their admin row" on public.app_admins;
create policy "Admins can read their admin row"
  on public.app_admins
  for select
  to authenticated
  using (user_id = auth.uid());

-- After creating your first Supabase Auth user, copy their user id from
-- Authentication > Users and run:
--
-- insert into public.app_admins (user_id)
-- values ('00000000-0000-0000-0000-000000000000')
-- on conflict (user_id) do nothing;

