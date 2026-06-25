create table if not exists public.survey_campaigns (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null unique,
  description text not null default '',
  active boolean not null default true
);

alter table public.survey_campaigns enable row level security;

drop policy if exists "service role can manage survey campaigns" on public.survey_campaigns;

create policy "service role can manage survey campaigns"
  on public.survey_campaigns
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

insert into public.survey_campaigns (id, name, description, active)
values ('biro-humas', 'Biro Hubungan Masyarakat', 'Survey Kepuasan Layanan Biro Hubungan Masyarakat', true)
on conflict (id) do update
set name = excluded.name,
    description = excluded.description,
    active = true,
    updated_at = now();

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

alter table public.survey_records
  add column if not exists blast_group_id text;

alter table public.survey_records
  add column if not exists campaign_id text not null default 'biro-humas';

update public.survey_records
set campaign_id = 'biro-humas'
where campaign_id is null or campaign_id = 'komdigi-default';

create index if not exists survey_records_campaign_created_idx
  on public.survey_records (campaign_id, created_at desc);

create table if not exists public.blast_records (
  id text primary key,
  blast_group_id text,
  created_at timestamptz not null default now(),
  channel text not null,
  person_name text not null,
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

alter table public.blast_records
  add column if not exists blast_group_id text;

alter table public.blast_records
  add column if not exists campaign_id text not null default 'biro-humas';

alter table public.blast_records
  add column if not exists sender_id text not null default '';

alter table public.blast_records
  add column if not exists sender_label text not null default '';

alter table public.blast_records
  add column if not exists sender_email text not null default '';

alter table public.blast_records
  add column if not exists whatsapp_number text not null default '';

update public.blast_records
set campaign_id = 'biro-humas'
where campaign_id is null or campaign_id = 'komdigi-default';

create index if not exists blast_records_group_idx
  on public.blast_records (blast_group_id);

create index if not exists blast_records_campaign_created_idx
  on public.blast_records (campaign_id, created_at desc);

create index if not exists blast_records_campaign_email_service_idx
  on public.blast_records (campaign_id, email, service_type);

create index if not exists blast_records_campaign_whatsapp_service_idx
  on public.blast_records (campaign_id, whatsapp_number, service_type);

alter table public.blast_records enable row level security;

drop policy if exists "service role can manage blast records" on public.blast_records;

create policy "service role can manage blast records"
  on public.blast_records
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create table if not exists public.blast_people (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  email text not null default '',
  service_types jsonb not null default '[]'::jsonb
);

create index if not exists blast_people_created_at_idx
  on public.blast_people (created_at desc);

alter table public.blast_people
  add column if not exists campaign_id text not null default 'biro-humas';

alter table public.blast_people
  add column if not exists whatsapp_number text not null default '';

update public.blast_people
set campaign_id = 'biro-humas'
where campaign_id is null or campaign_id = 'komdigi-default';

create index if not exists blast_people_campaign_created_idx
  on public.blast_people (campaign_id, created_at desc);

alter table public.blast_people enable row level security;

drop policy if exists "service role can manage blast people" on public.blast_people;

create policy "service role can manage blast people"
  on public.blast_people
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create table if not exists public.service_catalog (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null unique,
  sort_order integer not null default 0,
  active boolean not null default true
);

create index if not exists service_catalog_active_sort_idx
  on public.service_catalog (active, sort_order, created_at);

alter table public.service_catalog
  add column if not exists campaign_id text not null default 'biro-humas';

update public.service_catalog
set campaign_id = 'biro-humas'
where campaign_id is null or campaign_id = 'komdigi-default';

alter table public.service_catalog
  drop constraint if exists service_catalog_name_key;

create unique index if not exists service_catalog_campaign_name_key
  on public.service_catalog (campaign_id, name);

create index if not exists service_catalog_campaign_active_sort_idx
  on public.service_catalog (campaign_id, active, sort_order, created_at);

alter table public.service_catalog enable row level security;

drop policy if exists "service role can manage service catalog" on public.service_catalog;

create policy "service role can manage service catalog"
  on public.service_catalog
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

insert into public.service_catalog (id, name, sort_order, active)
values
  ('default-001', 'Layanan Pengajuan Pembayaran Permintaan LS Belanja Non Pegawai dan LS Pihak Ketiga', 1, true),
  ('default-002', 'Layanan Pengajuan Revisi POK Anggaran', 2, true),
  ('default-003', 'Layanan Pengajuan Revisi Anggaran Melalui Kementerian Keuangan', 3, true),
  ('default-004', 'Layanan Pembuatan Konten Media Sosial/Media Luar Ruang Ditjen Ekosistem Digital', 4, true),
  ('default-005', 'Layanan Peminjaman Arsip', 5, true),
  ('default-006', 'Layanan Permohonan Pemeliharaan Barang Milik Negara', 6, true),
  ('default-007', 'Layanan Permohonan Kebutuhan Persediaan', 7, true),
  ('default-008', 'Layanan Permohonan Usulan Kebutuhan BMN', 8, true),
  ('default-009', 'Layanan Penyusunan Penelaahan Permasalahan Hukum Bidang Ekosistem Digital', 9, true),
  ('default-010', 'Layanan Pengusulan Surat Izin Perjalanan Dinas Luar Negeri Ditjen Ekosistem Digital', 10, true),
  ('default-011', 'Layanan Penyusunan/Penyempurnaan Rancangan Peraturan dan Instrumen Hukum', 11, true),
  ('default-012', 'Layanan Pengajuan Cuti Di Luar Tanggungan Negara', 12, true),
  ('default-013', 'Layanan Pengajuan KP4 (Kartu Permohonan Penambahan Penghasilan Pegawai)', 13, true),
  ('default-014', 'Layanan Pengajuan Pensiun', 14, true),
  ('default-015', 'Layanan Pengajuan Usulan Perpindahan Pegawai', 15, true),
  ('default-016', 'Layanan Pengajuan Tugas Belajar', 16, true),
  ('default-017', 'Layanan Pencantuman Gelar', 17, true),
  ('default-018', 'Layanan Kenaikan Pangkat', 18, true),
  ('default-019', 'Layanan Kenaikan Gaji Berkala', 19, true),
  ('default-020', 'Layanan Pengajuan Izin Perceraian', 20, true),
  ('default-021', 'Layanan Penanganan Insiden Website DJED', 21, true)
on conflict (id) do nothing;

create table if not exists public.work_unit_catalog (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  campaign_id text not null default 'biro-humas'
);

create unique index if not exists work_unit_catalog_campaign_name_key
  on public.work_unit_catalog (campaign_id, name);

create index if not exists work_unit_catalog_campaign_active_sort_idx
  on public.work_unit_catalog (campaign_id, active, sort_order, created_at);

alter table public.work_unit_catalog enable row level security;

drop policy if exists "service role can manage work unit catalog" on public.work_unit_catalog;

create policy "service role can manage work unit catalog"
  on public.work_unit_catalog
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

insert into public.work_unit_catalog (id, campaign_id, name, sort_order, active)
values
  ('biro-humas-work-unit-001', 'biro-humas', 'Biro Hubungan Masyarakat', 1, true)
on conflict (id) do update
set campaign_id = excluded.campaign_id,
    name = excluded.name,
    sort_order = excluded.sort_order,
    active = true,
    updated_at = now();

insert into public.work_unit_catalog (id, campaign_id, name, sort_order, active)
values
  ('survei-infrastruktur-digital-work-unit-001', 'survei-infrastruktur-digital', 'Tim Kerja Keuangan', 1, true),
  ('survei-infrastruktur-digital-work-unit-002', 'survei-infrastruktur-digital', 'Tim Kerja Umum', 2, true),
  ('survei-infrastruktur-digital-work-unit-003', 'survei-infrastruktur-digital', 'Tim Kerja Perencanaan, Program dan Pelaporan', 3, true),
  ('survei-infrastruktur-digital-work-unit-004', 'survei-infrastruktur-digital', 'Tim Kerja SDM dan Organisasi', 4, true),
  ('survei-infrastruktur-digital-work-unit-005', 'survei-infrastruktur-digital', 'Tim Kerja Hukum dan Kerjasama', 5, true),
  ('survei-infrastruktur-digital-work-unit-006', 'survei-infrastruktur-digital', 'Tim Kerja Manajemen Risiko dan Kepatuhan Internal', 6, true)
on conflict (id) do update
set campaign_id = excluded.campaign_id,
    name = excluded.name,
    sort_order = excluded.sort_order,
    active = true,
    updated_at = now();

notify pgrst, 'reload schema';
