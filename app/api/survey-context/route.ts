import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_SURVEY_CAMPAIGN_ID } from '../../services';
import { ADMIN_SURVEY_COOKIE, formatServerError, getSupabase, getSurveyScope } from '../../supabase-server';

type CampaignRow = {
  id: string;
  name: string;
  description: string | null;
};

const defaultCampaign = {
  id: DEFAULT_SURVEY_CAMPAIGN_ID,
  name: 'Biro Hubungan Masyarakat',
  description: 'Survey Kepuasan Layanan Biro Hubungan Masyarakat',
};

const getContextCampaignId = async (request: NextRequest) => {
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
    const campaignId = await getContextCampaignId(request);
    const { data, error } = await getSupabase()
      .from('survey_campaigns')
      .select('id, name, description')
      .eq('id', campaignId)
      .maybeSingle();

    if (error) throw error;

    const campaign = data as CampaignRow | null;
    return NextResponse.json({
      campaign: campaign ? {
        id: campaign.id,
        name: campaign.name,
        description: campaign.description ?? '',
      } : defaultCampaign,
    });
  } catch (error) {
    return NextResponse.json({
      campaign: defaultCampaign,
      warning: formatServerError(error, 'Menggunakan konteks survey bawaan.'),
    });
  }
}
