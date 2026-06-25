import { NextRequest, NextResponse } from 'next/server';
import { formatServerError, getSupabase, scopeFilter } from '../../../../supabase-server';

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
  return new Set((data as Array<{ name?: string }>).map((row) => row.name).filter(Boolean));
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json() as {
      name?: string;
      email?: string;
      whatsappNumber?: string;
      serviceTypes?: unknown;
    };
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof body.name === 'string') updates.name = body.name.trim();
    if (typeof body.email === 'string') updates.email = body.email.trim();
    if (typeof body.whatsappNumber === 'string') updates.whatsapp_number = body.whatsappNumber.trim();
    if (body.serviceTypes !== undefined) updates.service_types = normalizeServices(body.serviceTypes);

    if (updates.name === '') {
      return NextResponse.json({ error: 'Nama wajib diisi.' }, { status: 400 });
    }
    if (
      typeof updates.whatsapp_number === 'string'
      && updates.whatsapp_number
      && !isValidWhatsAppNumber(updates.whatsapp_number)
    ) {
      return NextResponse.json({ error: 'Nomor WA harus menggunakan format 08... atau 628...' }, { status: 400 });
    }
    if (Array.isArray(updates.service_types) && updates.service_types.length === 0) {
      return NextResponse.json({ error: 'Pilih minimal satu layanan.' }, { status: 400 });
    }
    if (Array.isArray(updates.service_types)) {
      const allowedServices = await getAllowedServices(request);
      if (allowedServices.size > 0 && updates.service_types.some((service) => !allowedServices.has(service))) {
        return NextResponse.json({ error: 'Layanan user tidak sesuai dengan survey aktif.' }, { status: 400 });
      }
    }

    const supabase = getSupabase();
    const query = supabase
      .from('blast_people')
      .update(updates)
      .eq('id', id)
      .select('id, created_at, updated_at, name, email, whatsapp_number, service_types');
    let { data, error }: { data: unknown; error: unknown } = await scopeFilter(query, true, request).single();

    if (error && isMissingWhatsAppColumn(error)) {
      if (typeof updates.whatsapp_number === 'string' && updates.whatsapp_number) {
        return NextResponse.json(
          { error: 'Kolom Nomor WA belum tersedia di Supabase. Jalankan supabase-whatsapp-migration.sql terlebih dahulu.' },
          { status: 503 },
        );
      }
      const { whatsapp_number: _ignored, ...legacyUpdates } = updates;
      const legacyQuery = supabase
        .from('blast_people')
        .update(legacyUpdates)
        .eq('id', id)
        .select('id, created_at, updated_at, name, email, service_types');
      const legacyResult = await scopeFilter(legacyQuery, true, request).single();
      data = legacyResult.data;
      error = legacyResult.error;
    }

    if (error) throw error;

    return NextResponse.json({ person: mapPersonRow(data as BlastPersonRow) });
  } catch (error) {
    return NextResponse.json(
      { error: formatServerError(error, 'Gagal memperbarui orang.') },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = getSupabase();
    const query = supabase
      .from('blast_people')
      .delete()
      .eq('id', id);
    const { error } = await scopeFilter(query, true, request);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: formatServerError(error, 'Gagal menghapus orang.') },
      { status: 500 },
    );
  }
}
