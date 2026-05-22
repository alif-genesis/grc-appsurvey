import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '../../../supabase-server';

export async function GET(request: NextRequest) {
  const blastId = request.nextUrl.searchParams.get('blastId');

  if (!blastId) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const supabase = getSupabase();
  const { data } = await supabase
    .from('blast_records')
    .select('survey_link')
    .eq('id', blastId)
    .maybeSingle();

  await supabase
    .from('blast_records')
    .update({ clicked_at: new Date().toISOString() })
    .eq('id', blastId)
    .is('clicked_at', null);

  return NextResponse.redirect(data?.survey_link || new URL('/', request.url).toString());
}
