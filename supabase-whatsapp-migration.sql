alter table public.blast_people
  add column if not exists whatsapp_number text not null default '';

alter table public.blast_records
  add column if not exists whatsapp_number text not null default '';

create index if not exists blast_records_campaign_whatsapp_service_idx
  on public.blast_records (campaign_id, whatsapp_number, service_type);

notify pgrst, 'reload schema';
