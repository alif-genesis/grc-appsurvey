import { NextResponse } from 'next/server';
import { formatServerError, getSupabase } from '../../../supabase-server';

type BlastRow = {
  id: string;
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

export async function GET() {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('blast_records')
      .select('id, created_at, channel, person_name, whatsapp, email, service_type, survey_link, message, send_status, error, sent_at, opened_at, clicked_at, submitted_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ records: (data as BlastRow[]).map(mapBlastRow) });
  } catch (error) {
    return NextResponse.json(
      { error: formatServerError(error, 'Gagal mengambil riwayat blast.') },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  try {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('blast_records')
      .delete()
      .neq('id', '');

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: formatServerError(error, 'Gagal membersihkan riwayat blast.') },
      { status: 500 },
    );
  }
}
