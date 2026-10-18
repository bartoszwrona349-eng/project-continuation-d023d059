create type public.app_role as enum ('admin','user');
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique(user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "own roles" on public.user_roles for select to authenticated using (user_id = auth.uid());

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id=_user_id and role=_role)
$$;

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  capacity int not null,
  description text,
  created_at timestamptz not null default now()
);
grant select on public.venues to anon, authenticated;
grant insert, update, delete on public.venues to authenticated;
grant all on public.venues to service_role;
alter table public.venues enable row level security;
create policy "venues readable" on public.venues for select to anon, authenticated using (true);
create policy "admins manage venues" on public.venues for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references public.venues(id) on delete cascade not null,
  user_id uuid not null,
  kind text not null default 'request',
  status text not null default 'pending',
  start_at timestamptz not null,
  end_at timestamptz not null,
  organization text not null,
  contact_name text,
  contact_email text,
  event_name text not null,
  participants int not null default 1,
  description text,
  created_at timestamptz not null default now(),
  constraint valid_range check (end_at > start_at),
  constraint valid_kind check (kind in ('request','event')),
  constraint valid_status check (status in ('pending','approved','rejected'))
);
create index on public.bookings(venue_id, start_at);
grant select, insert, update, delete on public.bookings to authenticated;
grant all on public.bookings to service_role;
alter table public.bookings enable row level security;
create policy "own or admin read" on public.bookings for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "insert own" on public.bookings for insert to authenticated with check (user_id = auth.uid() and (kind='request' or public.has_role(auth.uid(),'admin')));
create policy "admin update" on public.bookings for update to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "delete own or admin" on public.bookings for delete to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));

create or replace function public.check_booking_overlap() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status <> 'rejected' and exists (
    select 1 from public.bookings b where b.venue_id=new.venue_id and b.id<>new.id and b.status<>'rejected'
      and b.start_at < new.end_at and b.end_at > new.start_at) then
    raise exception 'Wybrany termin jest już zajęty';
  end if;
  return new;
end $$;
create trigger bookings_overlap before insert or update on public.bookings for each row execute function public.check_booking_overlap();

create or replace function public.get_busy_slots(_from timestamptz, _to timestamptz)
returns table(id uuid, venue_id uuid, start_at timestamptz, end_at timestamptz, is_mine boolean)
language sql stable security definer set search_path=public as $$
  select b.id, b.venue_id, b.start_at, b.end_at, (b.user_id = auth.uid()) as is_mine
  from public.bookings b
  where b.status <> 'rejected' and b.start_at < _to and b.end_at > _from
$$;
grant execute on function public.get_busy_slots(timestamptz, timestamptz) to anon, authenticated;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.user_roles(user_id, role) values (new.id, 'user');
  if not exists (select 1 from public.user_roles where role='admin') then
    insert into public.user_roles(user_id, role) values (new.id, 'admin');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

insert into public.venues(name, capacity, description) values
 ('Sala Kameralna', 15, 'Mała sala na spotkania i warsztaty'),
 ('Sala Konferencyjna', 50, 'Sala z projektorem i nagłośnieniem'),
 ('Aula Główna', 200, 'Duża aula na konferencje i koncerty'),
 ('Pracownia Kreatywna', 25, 'Przestrzeń warsztatowa ze stołami');

alter table public.bookings add column rejection_reason text;

create table public.booking_history (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null,
  action text not null,
  actor_id uuid,
  actor_email text,
  owner_id uuid,
  changes jsonb,
  created_at timestamptz not null default now()
);
create index on public.booking_history(booking_id, created_at);
grant select on public.booking_history to authenticated;
grant all on public.booking_history to service_role;
alter table public.booking_history enable row level security;
create policy "admins read history" on public.booking_history for select to authenticated using (public.has_role(auth.uid(),'admin'));

create or replace function public.log_booking_change() returns trigger language plpgsql security definer set search_path=public as $$
declare diff jsonb := '{}'::jsonb; k text; act text;
begin
  if tg_op = 'INSERT' then
    act := 'created'; diff := to_jsonb(new) - 'id' - 'user_id' - 'created_at';
  elsif tg_op = 'DELETE' then
    act := 'deleted'; diff := to_jsonb(old) - 'id' - 'user_id' - 'created_at';
  else
    for k in select jsonb_object_keys(to_jsonb(new)) loop
      if to_jsonb(new)->k is distinct from to_jsonb(old)->k then
        diff := diff || jsonb_build_object(k, jsonb_build_object('old', to_jsonb(old)->k, 'new', to_jsonb(new)->k));
      end if;
    end loop;
    if diff = '{}'::jsonb then return new; end if;
    act := case when new.status is distinct from old.status then 'status:' || new.status else 'updated' end;
  end if;
  insert into public.booking_history(booking_id, action, actor_id, actor_email, owner_id, changes)
  values (coalesce(new.id, old.id), act, auth.uid(), auth.jwt()->>'email', coalesce(new.user_id, old.user_id), diff);
  return coalesce(new, old);
end $$;
create trigger bookings_history after insert or update or delete on public.bookings for each row execute function public.log_booking_change();