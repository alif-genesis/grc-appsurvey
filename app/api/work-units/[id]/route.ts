import { NextRequest, NextResponse } from 'next/server';
import { formatServerError, getSupabase, scopeFilter } from '../../../supabase-server';

type WorkUnitRow = {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  sort_order: number | null;
  active: boolean | null;
};

const mapWorkUnitRow = (row: WorkUnitRow) => ({
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

    if (!name) return NextResponse.json({ error: 'Nama satuan kerja wajib diisi.' }, { status: 400 });
    if (name.length > 220) return NextResponse.json({ error: 'Nama satuan kerja terlalu panjang.' }, { status: 400 });

    const supabase = getSupabase();
    const query = supabase
      .from('work_unit_catalog')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, created_at, updated_at, name, sort_order, active');
    const { data, error } = await scopeFilter(query, true, request).single();

    if (error) throw error;

    return NextResponse.json({ workUnit: mapWorkUnitRow(data as WorkUnitRow) });
  } catch (error) {
    return NextResponse.json(
      { error: formatServerError(error, 'Gagal mengubah satuan kerja.') },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = getSupabase();
    const query = supabase
      .from('work_unit_catalog')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', id);
    const { error } = await scopeFilter(query, true, request);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: formatServerError(error, 'Gagal menghapus satuan kerja.') },
      { status: 500 },
    );
  }
}
