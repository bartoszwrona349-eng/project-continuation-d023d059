alter table public.bookings add column request_id uuid not null default gen_random_uuid();
create index bookings_request_id_idx on public.bookings(request_id);