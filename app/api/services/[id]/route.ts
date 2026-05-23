import { NextRequest, NextResponse } from 'next/server';
import { formatServerError, getSupabase } from '../../../supabase-server';

type ServiceRow = {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  sort_order: number | null;
  active: boolean | null;
};

const mapServiceRow = (row: ServiceRow) => ({
  id: row.id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  name: row.name,
  sortOrder: row.sort_order ?? 0,
  active: row.active ?? true,
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json() as { name?: string };
    const name = body.name?.trim() || '';

    if (!name) return NextResponse.json({ error: 'Nama layanan wajib diisi.' }, { status: 400 });
    if (name.length > 220) return NextResponse.json({ error: 'Nama layanan terlalu panjang.' }, { status: 400 });

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('service_catalog')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, created_at, updated_at, name, sort_order, active')
      .single();

    if (error) throw error;

    return NextResponse.json({ service: mapServiceRow(data as ServiceRow) });
  } catch (error) {
    return NextResponse.json(
      { error: formatServerError(error, 'Gagal mengubah layanan.') },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = getSupabase();
    const { error } = await supabase
      .from('service_catalog')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: formatServerError(error, 'Gagal menghapus layanan.') },
      { status: 500 },
    );
  }
}
