import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_SURVEY_CAMPAIGN_ID } from '../../services';
import { ADMIN_SURVEY_COOKIE, formatServerError, getSupabase, getSurveyScope } from '../../supabase-server';
import { getPublicEmailSenderForCampaign } from '../blast/email-senders';

type CampaignRow = {
  id: string;
  name: string;
  description: string | null;
};

type BlastContextRow = {
  campaign_id: string | null;
  sender_label?: string | null;
  sender_email?: string | null;
};

const defaultCampaign = {
  id: DEFAULT_SURVEY_CAMPAIGN_ID,
  name: 'Biro Hubungan Masyarakat',
  description: 'Survey Kepuasan Layanan Biro Hubungan Masyarakat',
};

const getBlastIdentifiers = (request: NextRequest) => ({
  blastId: request.nextUrl.searchParams.get('blastId')?.trim() || request.cookies.get('genesis_blast_id')?.value,
  blastGroupId: request.nextUrl.searchParams.get('blastGroupId')?.trim() || request.cookies.get('genesis_blast_group_id')?.value,
});

const getBlastContext = async (request: NextRequest) => {
  const { blastId, blastGroupId } = getBlastIdentifiers(request);
  if (!blastId && !blastGroupId) return null;

  const supabase = getSupabase();
  const query = supabase
    .from('blast_records')
    .select('campaign_id, sender_label, sender_email')
    .limit(1);
  const { data, error } = blastId
    ? await query.eq('id', blastId)
    : await query.eq('blast_group_id', blastGroupId);

  if (error) {
    const legacyQuery = supabase
      .from('blast_records')
      .select('campaign_id')
      .limit(1);
    const legacyResult = blastId
      ? await legacyQuery.eq('id', blastId)
      : await legacyQuery.eq('blast_group_id', blastGroupId);
    if (legacyResult.error) throw legacyResult.error;
    return (legacyResult.data?.[0] as BlastContextRow | undefined) ?? null;
  }

  return (data?.[0] as BlastContextRow | undefined) ?? null;
};

const getContextCampaignId = async (request: NextRequest, blastContext: BlastContextRow | null) => {
  const requestedScope = request.nextUrl.searchParams.get('survey')?.trim();
  if (requestedScope) return requestedScope;

  const adminOnly = request.nextUrl.searchParams.get('admin') === '1';
  const adminScope = request.cookies.get(ADMIN_SURVEY_COOKIE)?.value;
  if (adminOnly && adminScope) return adminScope;

  return blastContext?.campaign_id || adminScope || getSurveyScope(request);
};

export async function GET(request: NextRequest) {
  try {
    const blastContext = await getBlastContext(request);
    const campaignId = await getContextCampaignId(request, blastContext);
    const { data, error } = await getSupabase()
      .from('survey_campaigns')
      .select('id, name, description')
      .eq('id', campaignId)
      .maybeSingle();

    if (error) throw error;

    const campaign = data as CampaignRow | null;
    const campaignText = `${campaign?.name || ''} ${campaign?.description || ''}`;
    const campaignSender = getPublicEmailSenderForCampaign(campaignId, campaignText);
    return NextResponse.json({
      campaign: campaign ? {
        id: campaign.id,
        name: campaign.name,
        description: campaign.description ?? '',
        senderLabel: blastContext?.sender_label ?? campaignSender.label,
        senderEmail: blastContext?.sender_email ?? campaignSender.email,
      } : {
        ...defaultCampaign,
        senderLabel: blastContext?.sender_label ?? campaignSender.label,
        senderEmail: blastContext?.sender_email ?? campaignSender.email,
      },
    });
  } catch (error) {
    return NextResponse.json({
      campaign: defaultCampaign,
      warning: formatServerError(error, 'Menggunakan konteks survey bawaan.'),
    });
  }
}
