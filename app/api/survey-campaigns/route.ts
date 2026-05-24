import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_SURVEY_CAMPAIGN_ID } from '../../services';
import { ADMIN_SURVEY_COOKIE, formatServerError, getSupabase, getSurveyScope } from '../../supabase-server';

type CampaignRow = {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  description: string | null;
  active: boolean | null;
};

const campaignSlug = (name: string) => name
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80);

const mapCampaign = (row: CampaignRow) => ({
  id: row.id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  name: row.name,
  description: row.description ?? '',
  active: row.active ?? true,
});

const defaultCampaign = {
  id: DEFAULT_SURVEY_CAMPAIGN_ID,
  createdAt: '',
  updatedAt: '',
  name: 'Biro Hubungan Masyarakat',
  description: 'Survey Kepuasan Layanan Biro Hubungan Masyarakat',
  active: true,
};

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('survey_campaigns')
      .select('id, created_at, updated_at, name, description, active')
      .eq('active', true)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const campaigns = (data as CampaignRow[]).map(mapCampaign);
    const activeId = getSurveyScope(request);
    return NextResponse.json({
      activeId,
      campaigns: campaigns.length ? campaigns : [defaultCampaign],
    });
  } catch (error) {
    return NextResponse.json({
      activeId: getSurveyScope(request),
      campaigns: [defaultCampaign],
      warning: formatServerError(error, 'Tabel survey belum siap. Jalankan supabase-schema.sql untuk mengaktifkan tambah survey.'),
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { name?: string; description?: string };
    const name = body.name?.trim() || '';
    const description = body.description?.trim() || '';
    if (!name) return NextResponse.json({ error: 'Nama survey wajib diisi.' }, { status: 400 });
    if (name.length > 180 || description.length > 500) {
      return NextResponse.json({ error: 'Nama atau deskripsi survey terlalu panjang.' }, { status: 400 });
    }

    const supabase = getSupabase();
    const baseId = campaignSlug(name) || crypto.randomUUID();
    let id = baseId;
    let suffix = 2;

    while (true) {
      const { data: existing, error: existingError } = await supabase
        .from('survey_campaigns')
        .select('id')
        .eq('id', id)
        .maybeSingle();
      if (existingError) throw existingError;
      if (!existing) break;
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }

    const { data, error } = await supabase
      .from('survey_campaigns')
      .insert({
        id,
        name,
        description,
        active: true,
      })
      .select('id, created_at, updated_at, name, description, active')
      .single();

    if (error) throw error;

    return NextResponse.json({ campaign: mapCampaign(data as CampaignRow) });
  } catch (error) {
    return NextResponse.json(
      { error: formatServerError(error, 'Gagal menambahkan survey.') },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as { id?: string; name?: string; description?: string };
    const id = body.id?.trim() || '';
    const name = body.name?.trim() || '';
    const description = body.description?.trim() || '';

    if (!id) return NextResponse.json({ error: 'Survey tidak ditemukan.' }, { status: 400 });
    if (!name) return NextResponse.json({ error: 'Nama survey wajib diisi.' }, { status: 400 });
    if (name.length > 180 || description.length > 500) {
      return NextResponse.json({ error: 'Nama atau deskripsi survey terlalu panjang.' }, { status: 400 });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('survey_campaigns')
      .update({
        name,
        description,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, created_at, updated_at, name, description, active')
      .single();

    if (error) throw error;

    return NextResponse.json({ campaign: mapCampaign(data as CampaignRow) });
  } catch (error) {
    return NextResponse.json(
      { error: formatServerError(error, 'Gagal memperbarui survey.') },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id')?.trim() || '';
    if (!id) return NextResponse.json({ error: 'Survey tidak ditemukan.' }, { status: 400 });
    const supabase = getSupabase();
    const { error } = await supabase
      .from('survey_campaigns')
      .delete()
      .eq('id', id);

    if (error) throw error;

    const response = NextResponse.json({ ok: true });
    if (getSurveyScope(request) === id) {
      response.cookies.set(ADMIN_SURVEY_COOKIE, DEFAULT_SURVEY_CAMPAIGN_ID, {
        httpOnly: true,
        sameSite: 'lax',
        secure: request.nextUrl.protocol === 'https:',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: formatServerError(error, 'Gagal menghapus survey.') },
      { status: 500 },
    );
  }
}
