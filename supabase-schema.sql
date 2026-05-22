create table if not exists public.survey_records (
  id text primary key,
  created_at timestamptz not null default now(),
  profile jsonb not null,
  responses jsonb not null,
  comments text not null default ''
);

create index if not exists survey_records_created_at_idx
  on public.survey_records (created_at desc);

alter table public.survey_records enable row level security;

drop policy if exists "service role can manage survey records" on public.survey_records;

create policy "service role can manage survey records"
  on public.survey_records
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

alter table public.survey_records
  add column if not exists blast_id text;

create table if not exists public.blast_records (
  id text primary key,
  created_at timestamptz not null default now(),
  channel text not null,
  person_name text not null,
  whatsapp text not null default '',
  email text not null default '',
  service_type text not null,
  survey_link text not null,
  message text not null default '',
  send_status text not null default 'Pending',
  error text not null default '',
  sent_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  submitted_at timestamptz
);

create index if not exists blast_records_created_at_idx
  on public.blast_records (created_at desc);

create index if not exists blast_records_email_service_idx
  on public.blast_records (email, service_type);

alter table public.blast_records enable row level security;

drop policy if exists "service role can manage blast records" on public.blast_records;

create policy "service role can manage blast records"
  on public.blast_records
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

notify pgrst, 'reload schema';
