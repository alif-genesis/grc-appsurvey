import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
};

type SurveyRow = {
  id: string;
  created_at: string;
  profile: SurveyRecord['profile'];
  responses: SurveyRecord['responses'];
  comments: string | null;
};

const getRequiredEnv = (key: string) => {
  const value = process.env[key];
  if (!value) throw new Error(`${key} belum diset`);
  return value;
};

const getSupabase = () => createClient(
  getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
  getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);

const mapRowToRecord = (row: SurveyRow): SurveyRecord => ({
  id: row.id,
  createdAt: row.created_at,
  profile: row.profile,
  responses: row.responses,
  comments: row.comments ?? '',
});

export async function GET() {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('survey_records')
      .select('id, created_at, profile, responses, comments')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      records: (data as SurveyRow[]).map(mapRowToRecord),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gagal mengambil data survey.' },
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
    });

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Survey gagal disimpan.' },
      { status: 500 },
    );
  }
}
