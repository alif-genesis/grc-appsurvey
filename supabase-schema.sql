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
