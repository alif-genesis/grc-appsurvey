import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '../../../supabase-server';

const pixel = Buffer.from(
  'R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==',
  'base64',
);

export async function GET(request: NextRequest) {
  const blastId = request.nextUrl.searchParams.get('blastId');

  if (blastId) {
    const supabase = getSupabase();
    await supabase
      .from('blast_records')
      .update({ opened_at: new Date().toISOString() })
      .eq('id', blastId)
      .is('opened_at', null);
  }

  return new NextResponse(pixel, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
