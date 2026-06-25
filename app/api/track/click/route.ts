import { NextRequest, NextResponse } from 'next/server';
import { PUBLIC_SURVEY_URL } from '../../../services';
import { getSupabase } from '../../../supabase-server';
import { getPublicRequestOrigin, isLocalHost } from '../../../request-url';

const normalizePublicTarget = (request: NextRequest, target: string) => {
  const targetUrl = new URL(target);
  if (!isLocalHost(targetUrl.hostname)) return targetUrl.toString();

  const publicOrigin = getPublicRequestOrigin(request);
  return new URL(`${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`, publicOrigin).toString();
};

const getSafeRedirectUrl = (request: NextRequest, target?: string | null) => {
  if (!target) return new URL('/', request.url).toString();

  try {
    const normalizedTarget = normalizePublicTarget(request, target);
    const targetUrl = new URL(normalizedTarget);
    const appUrl = new URL(request.url);
    const publicSurveyUrl = new URL(PUBLIC_SURVEY_URL);
    const requestOrigin = getPublicRequestOrigin(request);
    return [appUrl.origin, publicSurveyUrl.origin, requestOrigin].includes(targetUrl.origin)
      ? targetUrl.toString()
      : requestOrigin;
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
      .select('id, survey_link, service_type')
      .eq('blast_group_id', blastGroupId)
      .order('created_at', { ascending: true })
    : await supabase
      .from('blast_records')
      .select('id, survey_link, service_type')
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
  const distinctServices = new Set(rows.map((row) => row.service_type).filter(Boolean));
  const isMultiServiceGroup = Boolean(blastGroupId && distinctServices.size > 1);
  const singleRow = !isMultiServiceGroup ? rows[0] ?? null : null;
  const redirectTarget = isMultiServiceGroup
    ? new URL('/multi-survey', getPublicRequestOrigin(request))
    : new URL(getSafeRedirectUrl(request, singleRow?.survey_link || target));
  if (isMultiServiceGroup && blastGroupId) {
    redirectTarget.hash = `blastGroupId=${encodeURIComponent(blastGroupId)}`;
  } else if (blastId || singleRow?.id) {
    redirectTarget.hash = `blastId=${encodeURIComponent(blastId || singleRow?.id || '')}`;
  }
  const redirectUrl = redirectTarget.toString();
  const response = NextResponse.redirect(redirectUrl);

  if (isMultiServiceGroup && blastGroupId) {
    response.cookies.set('genesis_blast_group_id', blastGroupId, {
      httpOnly: false,
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    response.cookies.set('genesis_blast_id', '', {
      httpOnly: false,
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
      path: '/',
      maxAge: 0,
    });
  } else {
    response.cookies.set('genesis_blast_group_id', '', {
      httpOnly: false,
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
      path: '/',
      maxAge: 0,
    });
  }

  if (blastId) {
    response.cookies.set('genesis_blast_group_id', '', {
      httpOnly: false,
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
      path: '/',
      maxAge: 0,
    });
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
