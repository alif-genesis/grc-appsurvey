import { NextRequest, NextResponse } from 'next/server';
import { serviceTypes } from '../../services';
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
const allowedAnswers = new Set([
  'Sangat Tidak Puas',
  'Tidak Puas',
  'Puas',
  'Sangat Puas',
  'Sangat Tidak Setuju',
  'Tidak Setuju',
  'Setuju',
  'Sangat Setuju',
]);

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
    return NextResponse.json(
      { error: formatServerError(error, 'Gagal mengambil data survey.') },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const survey = await request.json() as SurveyRecord;

    if (!survey.profile?.name?.trim() || !survey.profile?.directorate?.trim() || !survey.profile?.serviceType?.trim()) {
      return NextResponse.json({ error: 'Profil survey belum lengkap.' }, { status: 400 });
    }
    const profile = {
      name: survey.profile.name.trim(),
      directorate: survey.profile.directorate.trim(),
      serviceType: survey.profile.serviceType.trim(),
    };
    const comments = survey.comments?.trim() || '';

    if (!serviceTypes.includes(profile.serviceType)) {
      return NextResponse.json({ error: 'Jenis layanan tidak valid.' }, { status: 400 });
    }
    if (!comments) {
      return NextResponse.json({ error: 'Kritik dan saran wajib diisi.' }, { status: 400 });
    }
    if (profile.name.length > 160 || profile.directorate.length > 160 || comments.length > 2000) {
      return NextResponse.json({ error: 'Data survey melebihi batas panjang yang diperbolehkan.' }, { status: 400 });
    }
    if (!survey.responses || Object.keys(survey.responses).length === 0 || Object.keys(survey.responses).length > 80) {
      return NextResponse.json({ error: 'Jawaban survey tidak valid.' }, { status: 400 });
    }
    const responses = Object.fromEntries(Object.entries(survey.responses).map(([key, value]) => [
      String(key).slice(0, 80),
      String(value),
    ]));
    if (Object.values(responses).some((answer) => !allowedAnswers.has(answer))) {
      return NextResponse.json({ error: 'Jawaban survey tidak valid.' }, { status: 400 });
    }

    const supabase = getSupabase();
    if (survey.blastId) {
      const { data: existingBlast, error: existingBlastError } = await supabase
        .from('blast_records')
        .select('submitted_at')
        .eq('id', survey.blastId)
        .maybeSingle();

      if (existingBlastError) throw existingBlastError;
      if (existingBlast?.submitted_at) {
        return NextResponse.json({ error: 'Survey untuk link ini sudah pernah disubmit.' }, { status: 409 });
      }
    }

    const { error } = await supabase.from('survey_records').insert({
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      profile,
      responses,
      comments,
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
    return NextResponse.json(
      {
        error: 'Survey gagal disimpan.',
      },
      { status: 500 },
    );
  }
}
