import { NextRequest, NextResponse } from 'next/server';
import { getPublicRequestOrigin } from '../../request-url';
import { getSupabase } from '../../supabase-server';

const shortCodeToUuid = (code: string) => {
  if (!/^[A-Za-z0-9_-]{22}$/.test(code)) return '';

  try {
    const hex = Buffer.from(code, 'base64url').toString('hex');
    if (!/^[a-f0-9]{32}$/.test(hex)) return '';
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join('-');
  } catch {
    return '';
  }
};

const resolveCompactCode = async (code: string) => {
  if (!/^[a-f0-9]{10}$/i.test(code)) return '';

  const { data, error } = await getSupabase()
    .from('blast_records')
    .select('blast_group_id')
    .like('blast_group_id', `${code.slice(0, 8)}-${code.slice(8, 10)}%`)
    .limit(20);
  if (error) return '';

  const matches = Array.from(new Set(
    (data ?? [])
      .map((row) => row.blast_group_id)
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
  ));
  return matches.length === 1 ? matches[0] : '';
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const blastGroupId = shortCodeToUuid(code) || await resolveCompactCode(code);
  const origin = getPublicRequestOrigin(request);

  if (!blastGroupId) {
    return NextResponse.redirect(new URL('/', origin));
  }

  const trackingUrl = new URL('/api/track/click', origin);
  trackingUrl.searchParams.set('blastGroupId', blastGroupId);
  return NextResponse.redirect(trackingUrl);
}
