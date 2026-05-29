import { NextRequest, NextResponse } from 'next/server';
import { getPublicEmailSenderForCampaign } from '../email-senders';
import { getSupabase, getSurveyScope } from '../../../supabase-server';

const getCampaignText = async (campaignId: string) => {
  try {
    const { data } = await getSupabase()
      .from('survey_campaigns')
      .select('name, description')
      .eq('id', campaignId)
      .maybeSingle();
    return `${data?.name || ''} ${data?.description || ''}`;
  } catch {
    return '';
  }
};

export async function GET(request: NextRequest) {
  const campaignId = getSurveyScope(request);
  const sender = getPublicEmailSenderForCampaign(campaignId, await getCampaignText(campaignId));
  return NextResponse.json({
    sender,
    senders: [sender],
  });
}
