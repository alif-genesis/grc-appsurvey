import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '../../../supabase-server';

const pixel = Buffer.from(
  'R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==',
  'base64',
);

export async function GET(request: NextRequest) {
  const blastId = request.nextUrl.searchParams.get('blastId');
  const blastGroupId = request.nextUrl.searchParams.get('blastGroupId');

  if (blastId || blastGroupId) {
    const supabase = getSupabase();
    const update = supabase
      .from('blast_records')
      .update({ opened_at: new Date().toISOString() })
      .is('opened_at', null);

    if (blastGroupId) {
      await update.eq('blast_group_id', blastGroupId);
    } else {
      await update.eq('id', blastId);
    }
  }

  return new NextResponse(pixel, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
