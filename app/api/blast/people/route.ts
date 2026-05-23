import { NextRequest, NextResponse } from 'next/server';
import { formatServerError, getSupabase } from '../../../supabase-server';

type BlastPersonRow = {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  whatsapp: string;
  email: string;
  service_types: unknown;
};

const normalizeServices = (value: unknown) => (
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
);

const mapPersonRow = (row: BlastPersonRow) => ({
  id: row.id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  name: row.name,
  whatsapp: row.whatsapp,
  email: row.email,
  serviceTypes: normalizeServices(row.service_types),
});

export async function GET() {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('blast_people')
      .select('id, created_at, updated_at, name, whatsapp, email, service_types')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ people: (data as BlastPersonRow[]).map(mapPersonRow) });
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
      whatsapp?: string;
      email?: string;
      serviceTypes?: unknown;
    };
    const name = body.name?.trim() || '';
    const whatsapp = body.whatsapp?.trim() || '';
    const email = body.email?.trim() || '';
    const serviceTypes = normalizeServices(body.serviceTypes);

    if (!name) {
      return NextResponse.json({ error: 'Nama wajib diisi.' }, { status: 400 });
    }
    if (serviceTypes.length === 0) {
      return NextResponse.json({ error: 'Pilih minimal satu layanan.' }, { status: 400 });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('blast_people')
      .insert({
        id: crypto.randomUUID(),
        name,
        whatsapp,
        email,
        service_types: serviceTypes,
      })
      .select('id, created_at, updated_at, name, whatsapp, email, service_types')
      .single();

    if (error) throw error;

    return NextResponse.json({ person: mapPersonRow(data as BlastPersonRow) });
  } catch (error) {
    return NextResponse.json(
      { error: formatServerError(error, 'Gagal menambahkan orang.') },
      { status: 500 },
    );
  }
}
