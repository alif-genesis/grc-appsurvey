import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_SURVEY_CAMPAIGN_ID, defaultServiceTypes } from '../../services';
import { ADMIN_SURVEY_COOKIE, formatServerError, getRequestedSurveyScope, getSupabase, getSurveyScope, scopeFilter } from '../../supabase-server';

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

const getServiceCampaignId = async (request: NextRequest) => {
  const requestedScope = request.nextUrl.searchParams.get('survey')?.trim();
  if (requestedScope) return requestedScope;

  const adminOnly = request.nextUrl.searchParams.get('admin') === '1';
  const adminScope = request.cookies.get(ADMIN_SURVEY_COOKIE)?.value;
  if (adminOnly && adminScope) return adminScope;

  const blastId = request.nextUrl.searchParams.get('blastId')?.trim() || request.cookies.get('genesis_blast_id')?.value;
  const blastGroupId = request.nextUrl.searchParams.get('blastGroupId')?.trim() || request.cookies.get('genesis_blast_group_id')?.value;
  if (!blastId && !blastGroupId) return adminScope || getSurveyScope(request);

  const supabase = getSupabase();
  const query = supabase
    .from('blast_records')
    .select('campaign_id')
    .limit(1);
  const { data, error } = blastId
    ? await query.eq('id', blastId)
    : await query.eq('blast_group_id', blastGroupId);

  if (error) throw error;
  return data?.[0]?.campaign_id || adminScope || getSurveyScope(request);
};

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const campaignId = await getServiceCampaignId(request);
    let query = supabase
      .from('service_catalog')
      .select('id, created_at, updated_at, name, sort_order, active')
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (campaignId === DEFAULT_SURVEY_CAMPAIGN_ID) {
      query = query.or(`campaign_id.eq.${DEFAULT_SURVEY_CAMPAIGN_ID},campaign_id.eq.komdigi-default,campaign_id.is.null`);
    } else {
      query = query.eq('campaign_id', campaignId);
    }

    const { data, error } = await query;

    if (error) throw error;

    const services = (data as ServiceRow[]).map(mapServiceRow);
    return NextResponse.json({
      campaignId,
      services: services.length > 0 || campaignId !== DEFAULT_SURVEY_CAMPAIGN_ID ? services : fallbackServices(),
    });
  } catch (error) {
    const campaignId = getRequestedSurveyScope(request);
    const isDefaultCampaign = campaignId === DEFAULT_SURVEY_CAMPAIGN_ID;
    return NextResponse.json({
      campaignId,
      services: isDefaultCampaign ? fallbackServices() : [],
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
    const maxQuery = supabase
      .from('service_catalog')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1);
    const { data: maxData } = await scopeFilter(maxQuery, true, request);
    const nextSortOrder = ((maxData?.[0]?.sort_order as number | undefined) ?? 0) + 1;

    const { data, error } = await supabase
      .from('service_catalog')
      .insert({
        id: crypto.randomUUID(),
        campaign_id: getSurveyScope(request),
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
