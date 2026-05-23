import { NextRequest, NextResponse } from 'next/server';
import { formatServerError, getSupabase } from '../../supabase-server';

type SurveyRecord = {
  id: string;
  createdAt: string;
  profile: {
    name: string;
    directorate: string;
    serviceType: string;
  };
  responses: Record<string, string>;
  comments: string;
  blastId?: string;
  blastGroupId?: string;
};

type SurveyRow = {
  id: string;
  created_at: string;
  profile: SurveyRecord['profile'];
  responses: SurveyRecord['responses'];
  comments: string | null;
  blast_id: string | null;
  blast_group_id: string | null;
};

const mapRowToRecord = (row: SurveyRow): SurveyRecord => ({
  id: row.id,
  createdAt: row.created_at,
  profile: row.profile,
  responses: row.responses,
  comments: row.comments ?? '',
  blastId: row.blast_id ?? undefined,
  blastGroupId: row.blast_group_id ?? undefined,
});

export async function GET() {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('survey_records')
      .select('id, created_at, profile, responses, comments, blast_id, blast_group_id')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      records: (data as SurveyRow[]).map(mapRowToRecord),
    });
  } catch (error) {
    console.error('GET /api/surveys failed:', error);
    return NextResponse.json(
      { error: formatServerError(error, 'Gagal mengambil data survey.') },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const survey = await request.json() as SurveyRecord;

    if (!survey.profile?.name || !survey.profile?.directorate || !survey.profile?.serviceType) {
      return NextResponse.json({ error: 'Profil survey belum lengkap.' }, { status: 400 });
    }

    const supabase = getSupabase();
    const { error } = await supabase.from('survey_records').insert({
      id: survey.id,
      created_at: survey.createdAt,
      profile: survey.profile,
      responses: survey.responses,
      comments: survey.comments,
      blast_id: survey.blastId || null,
      blast_group_id: survey.blastGroupId || null,
    });

    if (error) throw error;

    if (survey.blastId) {
      const { error: blastError } = await supabase
        .from('blast_records')
        .update({ submitted_at: new Date().toISOString() })
        .eq('id', survey.blastId)
        .is('submitted_at', null);

      if (blastError) throw blastError;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('POST /api/surveys failed:', error);
    return NextResponse.json(
      {
        error: formatServerError(error, 'Survey gagal disimpan. Cek /api/debug/supabase untuk detail koneksi database.'),
      },
      { status: 500 },
    );
  }
}
