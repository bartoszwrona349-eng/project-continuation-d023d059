create table public.ngo_profiles (
  user_id uuid primary key,
  name text,
  krs text,
  emails text,
  phone text,
  address text,
  updated_at timestamptz not null default now(),
  constraint krs_format check (krs is null or krs ~ '^[0-9]{10}$')
);
grant select, insert, update on public.ngo_profiles to authenticated;
grant all on public.ngo_profiles to service_role;
alter table public.ngo_profiles enable row level security;
create policy "own or admin read profile" on public.ngo_profiles for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "insert own profile" on public.ngo_profiles for insert to authenticated with check (user_id = auth.uid());
create policy "update own or admin profile" on public.ngo_profiles for update to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin')) with check (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare _krs text := nullif(regexp_replace(coalesce(new.raw_user_meta_data->>'krs',''), '\D', '', 'g'), '');
begin
  insert into public.user_roles(user_id, role) values (new.id, 'user');
  if not exists (select 1 from public.user_roles where role='admin') then
    insert into public.user_roles(user_id, role) values (new.id, 'admin');
  end if;
  if _krs is not null and length(_krs) <> 10 then _krs := null; end if;
  insert into public.ngo_profiles(user_id, name, krs, emails)
  values (new.id, nullif(trim(left(coalesce(new.raw_user_meta_data->>'organization',''), 200)), ''), _krs, new.email)
  on conflict (user_id) do nothing;
  return new;
end $$;