import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_SURVEY_CAMPAIGN_ID } from '../../../services';
import { ADMIN_SURVEY_COOKIE, getSupabase } from '../../../supabase-server';

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')?.trim() || '';
  if (!id) return NextResponse.redirect(new URL('/control', request.url));

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('survey_campaigns')
    .select('id')
    .eq('id', id)
    .eq('active', true)
    .maybeSingle();

  const response = NextResponse.redirect(new URL('/admin', request.url));
  if (data?.id || (error && id === DEFAULT_SURVEY_CAMPAIGN_ID)) {
    response.cookies.set(ADMIN_SURVEY_COOKIE, data?.id || id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return response;
}
