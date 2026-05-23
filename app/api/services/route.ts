import { NextRequest, NextResponse } from 'next/server';
import { defaultServiceTypes } from '../../services';
import { formatServerError, getSupabase } from '../../supabase-server';

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

const fallbackServices = () => defaultServiceTypes.map((name, index) => ({
  id: `default-${index + 1}`,
  createdAt: '',
  updatedAt: '',
  name,
  sortOrder: index + 1,
  active: true,
}));

export async function GET() {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('service_catalog')
      .select('id, created_at, updated_at, name, sort_order, active')
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw error;

    const services = (data as ServiceRow[]).map(mapServiceRow);
    return NextResponse.json({ services: services.length > 0 ? services : fallbackServices() });
  } catch (error) {
    return NextResponse.json({
      services: fallbackServices(),
      warning: formatServerError(error, 'Menggunakan daftar layanan bawaan.'),
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { name?: string };
    const name = body.name?.trim() || '';
    if (!name) return NextResponse.json({ error: 'Nama layanan wajib diisi.' }, { status: 400 });
    if (name.length > 220) return NextResponse.json({ error: 'Nama layanan terlalu panjang.' }, { status: 400 });

    const supabase = getSupabase();
    const { data: maxData } = await supabase
      .from('service_catalog')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1);
    const nextSortOrder = ((maxData?.[0]?.sort_order as number | undefined) ?? 0) + 1;

    const { data, error } = await supabase
      .from('service_catalog')
      .insert({
        id: crypto.randomUUID(),
        name,
        sort_order: nextSortOrder,
        active: true,
      })
      .select('id, created_at, updated_at, name, sort_order, active')
      .single();

    if (error) throw error;

    return NextResponse.json({ service: mapServiceRow(data as ServiceRow) });
  } catch (error) {
    return NextResponse.json(
      { error: formatServerError(error, 'Gagal menambahkan layanan.') },
      { status: 500 },
    );
  }
}
