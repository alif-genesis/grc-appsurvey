import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getSupabase } from '../../../supabase-server';

type BlastGroupRow = {
  id: string;
  blast_group_id: string | null;
  person_name: string;
  whatsapp: string;
  email: string;
  service_type: string;
  survey_link: string;
  submitted_at: string | null;
};

export async function GET() {
  const cookieStore = await cookies();
  const blastGroupId = cookieStore.get('genesis_blast_group_id')?.value;

  if (!blastGroupId) {
    return NextResponse.json({ error: 'Link survei multi layanan tidak ditemukan.' }, { status: 404 });
  }

  try {
    const supabase = getSupabase();
    const query = supabase
      .from('blast_records')
      .select('id, blast_group_id, person_name, whatsapp, email, service_type, survey_link, submitted_at')
      .eq('blast_group_id', blastGroupId)
      .order('created_at', { ascending: true });
    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({
      blastGroupId,
      records: (data as BlastGroupRow[]).map((row) => ({
        id: row.id,
        blastGroupId: row.blast_group_id,
        personName: row.person_name,
        whatsapp: row.whatsapp,
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
