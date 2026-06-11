import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_SURVEY_CAMPAIGN_ID } from '../../services';
import { defaultWorkUnits } from '../../survey-constants';
import { ADMIN_SURVEY_COOKIE, formatServerError, getRequestedSurveyScope, getSupabase, getSurveyScope, scopeFilter } from '../../supabase-server';

type WorkUnitRow = {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  sort_order: number | null;
  active: boolean | null;
};

type BlastWorkUnitContextRow = {
  campaign_id?: string | null;
  sender_label?: string | null;
  sender_email?: string | null;
};

const SEKRETARIAT_DJID_EMAIL = 'tusesdjid@mail.komdigi.go.id';
const INFRASTRUKTUR_DIGITAL_CAMPAIGN_ID = 'survei-infrastruktur-digital';

const mapWorkUnitRow = (row: WorkUnitRow) => ({
  id: row.id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  name: row.name,
  sortOrder: row.sort_order ?? 0,
  active: row.active ?? true,
});

const fallbackWorkUnits = () => defaultWorkUnits.map((name, index) => ({
  id: `default-work-unit-${index + 1}`,
  createdAt: '',
  updatedAt: '',
  name,
  sortOrder: index + 1,
  active: true,
}));

const isSekretariatDjidContext = (senderLabel?: string | null, senderEmail?: string | null) => {
  const normalized = `${senderLabel || ''} ${senderEmail || ''}`.trim().toLowerCase();
  return normalized.includes('sekretariat djid') || normalized.includes(SEKRETARIAT_DJID_EMAIL);
};

const getCampaignIdFromBlastContext = (row?: BlastWorkUnitContextRow | null) => {
  if (!row) return '';
  if (isSekretariatDjidContext(row.sender_label, row.sender_email)) {
    return INFRASTRUKTUR_DIGITAL_CAMPAIGN_ID;
  }
  return row.campaign_id || '';
};

const getWorkUnitCampaignId = async (request: NextRequest) => {
  const adminOnly = request.nextUrl.searchParams.get('admin') === '1';
  const adminScope = request.cookies.get(ADMIN_SURVEY_COOKIE)?.value;
  if (adminOnly && adminScope) return adminScope;

  const blastId = request.nextUrl.searchParams.get('blastId')?.trim() || request.cookies.get('genesis_blast_id')?.value;
  const blastGroupId = request.nextUrl.searchParams.get('blastGroupId')?.trim() || request.cookies.get('genesis_blast_group_id')?.value;
  const requestedScope = request.nextUrl.searchParams.get('survey')?.trim();
  if (!blastId && !blastGroupId) return requestedScope || adminScope || getSurveyScope(request);

  const supabase = getSupabase();
  const query = supabase
    .from('blast_records')
    .select('campaign_id, sender_label, sender_email')
    .limit(1);
  const { data, error } = blastId
    ? await query.eq('id', blastId)
    : await query.eq('blast_group_id', blastGroupId);

  if (error) throw error;
  return getCampaignIdFromBlastContext(data?.[0] as BlastWorkUnitContextRow | undefined)
    || requestedScope
    || adminScope
    || getSurveyScope(request);
};

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const campaignId = await getWorkUnitCampaignId(request);
    const adminOnly = request.nextUrl.searchParams.get('admin') === '1';
    let query = supabase
      .from('work_unit_catalog')
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

    const workUnits = (data as WorkUnitRow[]).map(mapWorkUnitRow);
    return NextResponse.json({
      campaignId,
      workUnits: adminOnly || workUnits.length > 0 || campaignId !== DEFAULT_SURVEY_CAMPAIGN_ID ? workUnits : fallbackWorkUnits(),
    });
  } catch (error) {
    const campaignId = getRequestedSurveyScope(request);
    const isDefaultCampaign = campaignId === DEFAULT_SURVEY_CAMPAIGN_ID;
    const adminOnly = request.nextUrl.searchParams.get('admin') === '1';
    return NextResponse.json({
      campaignId,
      workUnits: !adminOnly && isDefaultCampaign ? fallbackWorkUnits() : [],
      warning: formatServerError(error, adminOnly ? 'Gagal mengambil daftar satuan kerja.' : 'Menggunakan daftar satuan kerja bawaan.'),
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { name?: string };
    const name = body.name?.trim() || '';
    if (!name) return NextResponse.json({ error: 'Nama satuan kerja wajib diisi.' }, { status: 400 });
    if (name.length > 220) return NextResponse.json({ error: 'Nama satuan kerja terlalu panjang.' }, { status: 400 });

    const supabase = getSupabase();
    const maxQuery = supabase
      .from('work_unit_catalog')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1);
    const { data: maxData } = await scopeFilter(maxQuery, true, request);
    const nextSortOrder = ((maxData?.[0]?.sort_order as number | undefined) ?? 0) + 1;

    const existingQuery = supabase
      .from('work_unit_catalog')
      .select('id, created_at, updated_at, name, sort_order, active')
      .eq('name', name)
      .eq('active', false)
      .limit(1);
    const { data: existingData, error: existingError } = await scopeFilter(existingQuery, true, request);
    if (existingError) throw existingError;

    const existingWorkUnit = existingData?.[0] as WorkUnitRow | undefined;
    if (existingWorkUnit) {
      const reactivateQuery = supabase
        .from('work_unit_catalog')
        .update({
          active: true,
          sort_order: nextSortOrder,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingWorkUnit.id)
        .select('id, created_at, updated_at, name, sort_order, active');
      const { data: reactivatedData, error: reactivateError } = await scopeFilter(reactivateQuery, true, request).single();
      if (reactivateError) throw reactivateError;

      return NextResponse.json({ workUnit: mapWorkUnitRow(reactivatedData as WorkUnitRow) });
    }

    const { data, error } = await supabase
      .from('work_unit_catalog')
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

    return NextResponse.json({ workUnit: mapWorkUnitRow(data as WorkUnitRow) });
  } catch (error) {
    return NextResponse.json(
      { error: formatServerError(error, 'Gagal menambahkan satuan kerja.') },
      { status: 500 },
    );
  }
}
