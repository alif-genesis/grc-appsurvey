import { NextRequest, NextResponse } from 'next/server';
import { formatServerError, getSupabase, scopeFilter } from '../../../../supabase-server';

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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json() as {
      name?: string;
      whatsapp?: string;
      email?: string;
      serviceTypes?: unknown;
    };
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof body.name === 'string') updates.name = body.name.trim();
    if (typeof body.whatsapp === 'string') updates.whatsapp = body.whatsapp.trim();
    if (typeof body.email === 'string') updates.email = body.email.trim();
    if (body.serviceTypes !== undefined) updates.service_types = normalizeServices(body.serviceTypes);

    if (updates.name === '') {
      return NextResponse.json({ error: 'Nama wajib diisi.' }, { status: 400 });
    }
    if (Array.isArray(updates.service_types) && updates.service_types.length === 0) {
      return NextResponse.json({ error: 'Pilih minimal satu layanan.' }, { status: 400 });
    }

    const supabase = getSupabase();
    const query = supabase
      .from('blast_people')
      .update(updates)
      .eq('id', id)
      .select('id, created_at, updated_at, name, whatsapp, email, service_types');
    const { data, error } = await scopeFilter(query, true, request).single();

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
