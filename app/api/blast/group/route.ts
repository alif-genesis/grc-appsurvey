import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getSupabase } from '../../../supabase-server';

type BlastGroupRow = {
  id: string;
  blast_group_id: string | null;
  person_name: string;
  email: string;
  service_type: string;
  survey_link: string;
  submitted_at: string | null;
};

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const blastGroupId = request.nextUrl.searchParams.get('blastGroupId')?.trim() || cookieStore.get('genesis_blast_group_id')?.value;

  if (!blastGroupId) {
    return NextResponse.json({ error: 'Link survei multi layanan tidak ditemukan.' }, { status: 404 });
  }

  try {
    const supabase = getSupabase();
    const query = supabase
      .from('blast_records')
      .select('id, blast_group_id, person_name, email, service_type, survey_link, submitted_at')
      .eq('blast_group_id', blastGroupId)
      .order('created_at', { ascending: true });
    const { data, error } = await query;

    if (error) throw error;

    const records = Array.from(new Map(
      (data as BlastGroupRow[]).map((row) => [row.service_type, row]),
    ).values());

    return NextResponse.json({
      blastGroupId,
      records: records.map((row) => ({
        id: row.id,
        blastGroupId: row.blast_group_id,
        personName: row.person_name,
        email: row.email,
        serviceType: row.service_type,
        surveyLink: row.survey_link,
        submittedAt: row.submitted_at,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Gagal mengambil data survei multi layanan.' },
      { status: 500 },
    );
  }
}
