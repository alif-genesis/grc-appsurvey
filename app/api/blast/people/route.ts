import { NextRequest, NextResponse } from 'next/server';
import { formatServerError, getSupabase, getSurveyScope, scopeFilter } from '../../../supabase-server';

type BlastPersonRow = {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  email: string;
  whatsapp_number?: string | null;
  service_types: unknown;
};

const normalizeServices = (value: unknown) => (
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
);
const isValidWhatsAppNumber = (value: string) => {
  const digits = value.replace(/\D/g, '');
  const normalized = digits.startsWith('0') ? `62${digits.slice(1)}` : digits;
  return /^628\d{7,12}$/.test(normalized);
};
const isMissingWhatsAppColumn = (error: unknown) => {
  const value = error as { code?: string; message?: string; details?: string } | null;
  const text = `${value?.message || ''} ${value?.details || ''}`.toLowerCase();
  return value?.code === '42703'
    || value?.code === 'PGRST204'
    || text.includes('whatsapp_number');
};

const getAllowedServices = async (request: NextRequest) => {
  const supabase = getSupabase();
  const query = supabase
    .from('service_catalog')
    .select('name')
    .eq('active', true);
  const { data, error } = await scopeFilter(query, true, request);
  if (error) throw error;
  return new Set((data as Array<{ name?: string }>).map((row) => row.name).filter((name): name is string => Boolean(name)));
};

const mapPersonRow = (row: BlastPersonRow) => ({
  id: row.id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  name: row.name,
  email: row.email,
  whatsappNumber: row.whatsapp_number ?? '',
  serviceTypes: normalizeServices(row.service_types),
});

const syncPersonServices = async (
  supabase: ReturnType<typeof getSupabase>,
  rows: BlastPersonRow[],
  allowedServices: Set<string>,
) => {
  const people = rows.map((row) => ({
    ...row,
    serviceTypes: normalizeServices(row.service_types).filter((service) => allowedServices.has(service)),
  }));
  const updates = await Promise.all(people
    .filter((person) => person.serviceTypes.length !== normalizeServices(person.service_types).length)
    .map((person) => supabase
      .from('blast_people')
      .update({
        service_types: person.serviceTypes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', person.id)));
  const updateError = updates.find((result) => result.error)?.error;
  if (updateError) throw updateError;

  return people.map((person) => ({
    ...person,
    service_types: person.serviceTypes,
  }));
};

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const query = supabase
      .from('blast_people')
      .select('id, created_at, updated_at, name, email, whatsapp_number, service_types')
      .order('created_at', { ascending: false });
    let { data, error }: { data: unknown; error: unknown } = await scopeFilter(query, true, request);

    if (error && isMissingWhatsAppColumn(error)) {
      const legacyQuery = supabase
        .from('blast_people')
        .select('id, created_at, updated_at, name, email, service_types')
        .order('created_at', { ascending: false });
      const legacyResult = await scopeFilter(legacyQuery, true, request);
      data = legacyResult.data;
      error = legacyResult.error;
    }

    if (error) throw error;
    const rows = (data as BlastPersonRow[]).map((row) => ({
      ...row,
      whatsapp_number: row.whatsapp_number ?? '',
    }));

    if (request.nextUrl.searchParams.get('sync') === '0') {
      return NextResponse.json({ people: rows.map(mapPersonRow) });
    }

    const allowedServices = await getAllowedServices(request);
    const syncedRows = await syncPersonServices(supabase, rows, allowedServices);
    return NextResponse.json({ people: syncedRows.map(mapPersonRow) });
  } catch (error) {
    return NextResponse.json(
      { error: formatServerError(error, 'Gagal mengambil daftar orang.') },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      name?: string;
      email?: string;
      whatsappNumber?: string;
      serviceTypes?: unknown;
    };
    const name = body.name?.trim() || '';
    const email = body.email?.trim() || '';
    const whatsappNumber = body.whatsappNumber?.trim() || '';
    const serviceTypes = normalizeServices(body.serviceTypes);

    if (!name) {
      return NextResponse.json({ error: 'Nama wajib diisi.' }, { status: 400 });
    }
    if (serviceTypes.length === 0) {
      return NextResponse.json({ error: 'Pilih minimal satu layanan.' }, { status: 400 });
    }
    if (whatsappNumber && !isValidWhatsAppNumber(whatsappNumber)) {
      return NextResponse.json({ error: 'Nomor WA harus menggunakan format 08... atau 628...' }, { status: 400 });
    }
    const allowedServices = await getAllowedServices(request);
    if (allowedServices.size > 0 && serviceTypes.some((service) => !allowedServices.has(service))) {
      return NextResponse.json({ error: 'Layanan user tidak sesuai dengan survey aktif.' }, { status: 400 });
    }

    const supabase = getSupabase();
    let { data, error }: { data: unknown; error: unknown } = await supabase
      .from('blast_people')
      .insert({
        id: crypto.randomUUID(),
        campaign_id: getSurveyScope(request),
        name,
        email,
        whatsapp_number: whatsappNumber,
        service_types: serviceTypes,
      })
      .select('id, created_at, updated_at, name, email, whatsapp_number, service_types')
      .single();

    if (error && isMissingWhatsAppColumn(error)) {
      if (whatsappNumber) {
        return NextResponse.json(
          { error: 'Kolom Nomor WA belum tersedia di Supabase. Jalankan supabase-whatsapp-migration.sql terlebih dahulu.' },
          { status: 503 },
        );
      }
      const legacyResult = await supabase
        .from('blast_people')
        .insert({
          id: crypto.randomUUID(),
          campaign_id: getSurveyScope(request),
          name,
          email,
          service_types: serviceTypes,
        })
        .select('id, created_at, updated_at, name, email, service_types')
        .single();
      data = legacyResult.data;
      error = legacyResult.error;
    }

    if (error) throw error;

    return NextResponse.json({ person: mapPersonRow(data as BlastPersonRow) });
  } catch (error) {
    return NextResponse.json(
      { error: formatServerError(error, 'Gagal menambahkan orang.') },
      { status: 500 },
    );
  }
}
