import { NextRequest, NextResponse } from 'next/server';
import { formatServerError, getSupabase, scopeFilter } from '../../../supabase-server';

const deleteScopedRows = async (
  table: 'blast_records' | 'survey_records',
  request: NextRequest,
) => {
  const supabase = getSupabase();
  const query = supabase
    .from(table)
    .delete({ count: 'exact' })
    .neq('id', '');
  const { count, error } = await scopeFilter(query, true, request);

  if (error) throw error;
  return count ?? 0;
};

export async function POST(request: NextRequest) {
  try {
    const [blastCount, surveyCount] = await Promise.all([
      deleteScopedRows('blast_records', request),
      deleteScopedRows('survey_records', request),
    ]);

    return NextResponse.json({
      ok: true,
      deleted: {
        blastRecords: blastCount,
        surveyRecords: surveyCount,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: formatServerError(error, 'Reset blast gagal diproses.') },
      { status: 500 },
    );
  }
}
