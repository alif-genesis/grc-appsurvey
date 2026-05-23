import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { formatServerError, getSupabase } from '../../../supabase-server';

export async function GET() {
  const blastId = cookies().get('genesis_blast_id')?.value;
  const blastGroupId = cookies().get('genesis_blast_group_id')?.value;

  if (!blastId && !blastGroupId) {
    return NextResponse.json({ submitted: false });
  }

  try {
    const supabase = getSupabase();

    if (blastId) {
      const { data, error } = await supabase
        .from('blast_records')
        .select('submitted_at')
        .eq('id', blastId)
        .maybeSingle();

      if (error) throw error;

      return NextResponse.json({
        submitted: Boolean(data?.submitted_at),
        submittedAt: data?.submitted_at ?? null,
      });
    }

    const { data, error } = await supabase
      .from('blast_records')
      .select('submitted_at')
      .eq('blast_group_id', blastGroupId);

    if (error) throw error;

    const rows = data ?? [];
    const submittedCount = rows.filter((row) => row.submitted_at).length;

    return NextResponse.json({
      submitted: rows.length > 0 && submittedCount === rows.length,
      submittedCount,
      totalCount: rows.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: formatServerError(error, 'Gagal mengecek status survey.') },
      { status: 500 },
    );
  }
}
