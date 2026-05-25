import { NextRequest, NextResponse } from 'next/server';
import { PUBLIC_SURVEY_URL } from '../../../services';
import { getSupabase } from '../../../supabase-server';

const getSafeRedirectUrl = (request: NextRequest, target?: string | null) => {
  if (!target) return new URL('/', request.url).toString();

  try {
    const targetUrl = new URL(target);
    const appUrl = new URL(request.url);
    const publicSurveyUrl = new URL(PUBLIC_SURVEY_URL);
    return [appUrl.origin, publicSurveyUrl.origin].includes(targetUrl.origin)
      ? targetUrl.toString()
      : appUrl.origin;
  } catch {
    return new URL('/', request.url).toString();
  }
};

export async function GET(request: NextRequest) {
  const blastId = request.nextUrl.searchParams.get('blastId');
  const blastGroupId = request.nextUrl.searchParams.get('blastGroupId');
  const target = request.nextUrl.searchParams.get('target');

  if (!blastId && !blastGroupId) {
    return NextResponse.redirect(getSafeRedirectUrl(request, target));
  }

  const supabase = getSupabase();
  const { data } = blastGroupId
    ? await supabase
      .from('blast_records')
      .select('id, survey_link')
      .eq('blast_group_id', blastGroupId)
      .order('created_at', { ascending: true })
    : await supabase
      .from('blast_records')
      .select('id, survey_link')
      .eq('id', blastId)
      .limit(1);

  const update = supabase
    .from('blast_records')
    .update({ clicked_at: new Date().toISOString() })
    .is('clicked_at', null);
  if (blastGroupId) {
    await update.eq('blast_group_id', blastGroupId);
  } else {
    await update.eq('id', blastId);
  }

  const rows = data ?? [];
  const singleRow = rows.length === 1 ? rows[0] : null;
  const redirectUrl = blastGroupId && rows.length > 1
    ? new URL('/multi-survey', request.url).toString()
    : singleRow?.survey_link || getSafeRedirectUrl(request, target);
  const response = NextResponse.redirect(redirectUrl);

  if (blastGroupId) {
    response.cookies.set('genesis_blast_group_id', blastGroupId, {
      httpOnly: false,
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  if (blastId) {
    response.cookies.set('genesis_blast_id', blastId, {
      httpOnly: false,
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  if (!blastId && singleRow?.id) {
    response.cookies.set('genesis_blast_id', singleRow.id, {
      httpOnly: false,
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  response.cookies.set('genesis_blast_id', blastId || singleRow?.id || '', {
    httpOnly: false,
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:',
    path: '/',
    maxAge: blastId || singleRow?.id ? 60 * 60 * 24 * 30 : 0,
  });

  return response;
}
