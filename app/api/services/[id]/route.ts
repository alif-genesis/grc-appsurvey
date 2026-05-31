import { NextRequest, NextResponse } from 'next/server';
import { formatServerError, getSupabase, scopeFilter } from '../../../supabase-server';

type ServiceRow = {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  sort_order: number | null;
  active: boolean | null;
};

type BlastPersonRow = {
  id: string;
  service_types: unknown;
};

const mapServiceRow = (row: ServiceRow) => ({
  id: row.id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  name: row.name,
  sortOrder: row.sort_order ?? 0,
  active: row.active ?? true,
});

const normalizeServices = (value: unknown) => (
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
);

const removeServiceFromPeople = async (request: NextRequest, serviceName: string) => {
  const supabase = getSupabase();
  const peopleQuery = supabase
    .from('blast_people')
    .select('id, service_types');
  const { data, error } = await scopeFilter(peopleQuery, true, request);
  if (error) throw error;

  const affectedPeople = ((data ?? []) as BlastPersonRow[])
    .map((person) => ({
      id: person.id,
      serviceTypes: normalizeServices(person.service_types),
    }))
    .filter((person) => person.serviceTypes.includes(serviceName));

  const updates = await Promise.all(affectedPeople.map((person) => (
    supabase
      .from('blast_people')
      .update({
        service_types: person.serviceTypes.filter((service) => service !== serviceName),
        updated_at: new Date().toISOString(),
      })
      .eq('id', person.id)
  )));
  const updateError = updates.find((result) => result.error)?.error;
  if (updateError) throw updateError;
};

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json() as { name?: string };
    const name = body.name?.trim() || '';

    if (!name) return NextResponse.json({ error: 'Nama layanan wajib diisi.' }, { status: 400 });
    if (name.length > 220) return NextResponse.json({ error: 'Nama layanan terlalu panjang.' }, { status: 400 });

    const supabase = getSupabase();
    const query = supabase
      .from('service_catalog')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, created_at, updated_at, name, sort_order, active');
    const { data, error } = await scopeFilter(query, true, request).single();

    if (error) throw error;

    return NextResponse.json({ service: mapServiceRow(data as ServiceRow) });
  } catch (error) {
    return NextResponse.json(
      { error: formatServerError(error, 'Gagal mengubah layanan.') },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({})) as { name?: string };
    const name = body.name?.trim() || '';
    const supabase = getSupabase();
    const query = supabase
      .from('service_catalog')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, name');
    const { data, error } = await scopeFilter(query, true, request);

    if (error) throw error;
    let deletedServiceName = (data?.[0] as Pick<ServiceRow, 'name'> | undefined)?.name || '';
    if (!data?.length && name) {
      const fallbackQuery = supabase
        .from('service_catalog')
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq('name', name)
        .eq('active', true)
        .select('id, name');
      const fallbackResult = await scopeFilter(fallbackQuery, true, request);
      if (fallbackResult.error) throw fallbackResult.error;
      deletedServiceName = (fallbackResult.data?.[0] as Pick<ServiceRow, 'name'> | undefined)?.name || '';
    }

    if (!deletedServiceName) {
      return NextResponse.json({ error: 'Layanan tidak ditemukan di survey aktif.' }, { status: 404 });
    }
    await removeServiceFromPeople(request, deletedServiceName);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: formatServerError(error, 'Gagal menghapus layanan.') },
      { status: 500 },
    );
  }
}
