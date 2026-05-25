import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_SURVEY_CAMPAIGN_ID } from '../../../services';
import { ADMIN_SURVEY_COOKIE, getSupabase } from '../../../supabase-server';

const getRedirectUrl = (request: NextRequest, path: string) => {
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configuredAppUrl) return new URL(path, configuredAppUrl);

  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const forwardedProto = request.headers.get('x-forwarded-proto') || request.nextUrl.protocol.replace(':', '');
  if (forwardedHost) return new URL(path, `${forwardedProto}://${forwardedHost}`);

  return new URL(path, request.url);
};

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')?.trim() || '';
  if (!id) return NextResponse.redirect(getRedirectUrl(request, '/control'));

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('survey_campaigns')
    .select('id')
    .eq('id', id)
    .eq('active', true)
    .maybeSingle();

  const response = NextResponse.redirect(getRedirectUrl(request, '/admin'));
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
