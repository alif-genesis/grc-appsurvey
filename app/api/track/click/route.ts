import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '../../../supabase-server';

export async function GET(request: NextRequest) {
  const blastId = request.nextUrl.searchParams.get('blastId');
  const blastGroupId = request.nextUrl.searchParams.get('blastGroupId');

  if (!blastId && !blastGroupId) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const supabase = getSupabase();
  const query = supabase.from('blast_records').select('survey_link');
  const { data } = blastGroupId
    ? await query.eq('blast_group_id', blastGroupId).limit(1).maybeSingle()
    : await query.eq('id', blastId).maybeSingle();

  const update = supabase
    .from('blast_records')
    .update({ clicked_at: new Date().toISOString() })
    .is('clicked_at', null);
  if (blastGroupId) {
    await update.eq('blast_group_id', blastGroupId);
  } else {
    await update.eq('id', blastId);
  }

  const redirectUrl = blastGroupId
    ? new URL('/multi-survey', request.url).toString()
    : data?.survey_link || new URL('/', request.url).toString();
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

  response.cookies.set('genesis_blast_id', blastId || '', {
    httpOnly: false,
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:',
    path: '/',
    maxAge: blastId ? 60 * 60 * 24 * 30 : 0,
  });

  return response;
}
