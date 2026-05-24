import { NextRequest, NextResponse } from 'next/server';
import { formatServerError, getSupabase, getSurveyScope, scopeFilter } from '../../../supabase-server';

type BlastRow = {
  id: string;
  blast_group_id: string | null;
  created_at: string;
  channel: 'Email' | 'WhatsApp';
  person_name: string;
  whatsapp: string;
  email: string;
  service_type: string;
  survey_link: string;
  message: string;
  send_status: 'Sukses' | 'Gagal' | 'Pending';
  error: string;
  sent_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  submitted_at: string | null;
};

const mapBlastRow = (row: BlastRow) => ({
  id: row.id,
  blastGroupId: row.blast_group_id,
  channel: row.channel,
  personName: row.person_name,
  whatsapp: row.whatsapp,
  email: row.email,
  serviceType: row.service_type,
  surveyLink: row.survey_link,
  message: row.message,
  status: row.send_status,
  error: row.error,
  createdAt: row.created_at,
  sentAt: row.sent_at,
  openedAt: row.opened_at,
  clickedAt: row.clicked_at,
  submittedAt: row.submitted_at,
});

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const query = supabase
      .from('blast_records')
      .select('id, blast_group_id, created_at, channel, person_name, whatsapp, email, service_type, survey_link, message, send_status, error, sent_at, opened_at, clicked_at, submitted_at')
      .order('created_at', { ascending: false });
    const { data, error } = await scopeFilter(query, true, request);

    if (error) throw error;

    return NextResponse.json({ records: (data as BlastRow[]).map(mapBlastRow) });
  } catch (error) {
    return NextResponse.json(
      { error: formatServerError(error, 'Gagal mengambil riwayat blast.') },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { records?: Partial<ReturnType<typeof mapBlastRow>>[] };
    const records = body.records ?? [];

    if (records.length === 0) {
      return NextResponse.json({ error: 'Tidak ada riwayat untuk disimpan.' }, { status: 400 });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('blast_records')
      .insert(records.map((record) => ({
        id: record.id || crypto.randomUUID(),
        campaign_id: getSurveyScope(request),
        blast_group_id: record.blastGroupId || null,
        created_at: record.createdAt || new Date().toISOString(),
        channel: record.channel || 'WhatsApp',
        person_name: record.personName || '',
        whatsapp: record.whatsapp || '',
        email: record.email || '',
        service_type: record.serviceType || '',
        survey_link: record.surveyLink || '',
        message: record.message || '',
        send_status: record.status || 'Sukses',
        error: record.error || '',
        sent_at: record.sentAt || null,
        opened_at: record.openedAt || null,
        clicked_at: record.clickedAt || null,
        submitted_at: record.submittedAt || null,
      })))
      .select('id, blast_group_id, created_at, channel, person_name, whatsapp, email, service_type, survey_link, message, send_status, error, sent_at, opened_at, clicked_at, submitted_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ records: (data as BlastRow[]).map(mapBlastRow) });
  } catch (error) {
    return NextResponse.json(
      { error: formatServerError(error, 'Gagal menyimpan riwayat blast.') },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const query = supabase
      .from('blast_records')
      .delete()
      .neq('id', '');
    const { error } = await scopeFilter(query, true, request);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: formatServerError(error, 'Gagal membersihkan riwayat blast.') },
      { status: 500 },
    );
  }
}
