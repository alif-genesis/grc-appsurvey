import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getSupabase } from '../../../supabase-server';

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const blastId = request.nextUrl.searchParams.get('blastId')?.trim() || cookieStore.get('genesis_blast_id')?.value;
  const blastGroupId = request.nextUrl.searchParams.get('blastGroupId')?.trim() || cookieStore.get('genesis_blast_group_id')?.value;

  if (!blastId && !blastGroupId) {
    return NextResponse.json({ submitted: false });
  }

  try {
    const supabase = getSupabase();

    if (blastId) {
      const query = supabase
        .from('blast_records')
        .select('submitted_at')
        .eq('id', blastId);
      const { data, error } = await query.maybeSingle();

      if (error) throw error;

      return NextResponse.json({
        submitted: Boolean(data?.submitted_at),
        submittedAt: data?.submitted_at ?? null,
      });
    }

    const query = supabase
      .from('blast_records')
      .select('submitted_at')
      .eq('blast_group_id', blastGroupId);
    const { data, error } = await query;

    if (error) throw error;

    const rows = (data ?? []) as Array<{ submitted_at: string | null }>;
    const submittedCount = rows.filter((row) => row.submitted_at).length;

    return NextResponse.json({
      submitted: rows.length > 0 && submittedCount === rows.length,
      submittedCount,
      totalCount: rows.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Gagal mengecek status survey.' },
      { status: 500 },
    );
  }
}
