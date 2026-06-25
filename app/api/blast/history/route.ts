import { NextRequest, NextResponse } from 'next/server';
import { formatServerError, getSupabase, getSurveyScope, scopeFilter } from '../../../supabase-server';

type BlastRow = {
  id: string;
  blast_group_id: string | null;
  created_at: string;
  channel: 'Email' | 'WhatsApp';
  person_name: string;
  email: string;
  whatsapp_number?: string | null;
  sender_id?: string | null;
  sender_label?: string | null;
  sender_email?: string | null;
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
  personName: row.person_name,
  channel: row.channel,
  email: row.email,
  whatsappNumber: row.whatsapp_number ?? '',
  senderId: row.sender_id ?? '',
  senderLabel: row.sender_label ?? '',
  senderEmail: row.sender_email ?? '',
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

const HISTORY_SELECT = 'id, blast_group_id, created_at, channel, person_name, email, whatsapp_number, sender_id, sender_label, sender_email, service_type, survey_link, message, send_status, error, sent_at, opened_at, clicked_at, submitted_at';
const LEGACY_HISTORY_SELECT = 'id, blast_group_id, created_at, channel, person_name, email, service_type, survey_link, message, send_status, error, sent_at, opened_at, clicked_at, submitted_at';
const SUMMARY_HISTORY_SELECT = 'id, blast_group_id, created_at, person_name, email, service_type, send_status, submitted_at';

const stripSenderColumns = <T extends Record<string, unknown>>(record: T) => {
  const { sender_id, sender_label, sender_email, ...rest } = record;
  return rest;
};

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const summaryOnly = request.nextUrl.searchParams.get('summary') === '1';
    const query = supabase
      .from('blast_records')
      .select(summaryOnly ? SUMMARY_HISTORY_SELECT : HISTORY_SELECT)
      .order('created_at', { ascending: false });
    let { data, error }: { data: unknown; error: unknown } = await scopeFilter(query, true, request);

    if (error && !summaryOnly) {
      const legacyQuery = supabase
        .from('blast_records')
        .select(LEGACY_HISTORY_SELECT)
        .order('created_at', { ascending: false });
      const legacyResult = await scopeFilter(legacyQuery, true, request);
      data = legacyResult.data;
      error = legacyResult.error;
    }

    if (error) throw error;

    return NextResponse.json({
      records: (data as BlastRow[]).map((row) => mapBlastRow({
        ...row,
        channel: row.channel ?? 'Email',
        whatsapp_number: row.whatsapp_number ?? '',
        sender_id: row.sender_id ?? '',
        sender_label: row.sender_label ?? '',
        sender_email: row.sender_email ?? '',
        survey_link: row.survey_link ?? '',
        message: row.message ?? '',
        send_status: row.send_status ?? 'Sukses',
        error: row.error ?? '',
        sent_at: row.sent_at ?? null,
        opened_at: row.opened_at ?? null,
        clicked_at: row.clicked_at ?? null,
      })),
    });
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
    const rows = records.map((record) => ({
        id: record.id || crypto.randomUUID(),
        campaign_id: getSurveyScope(request),
        blast_group_id: record.blastGroupId || null,
        created_at: record.createdAt || new Date().toISOString(),
        channel: record.channel || 'Email',
        person_name: record.personName || '',
        email: record.email || '',
        whatsapp_number: record.whatsappNumber || '',
        sender_id: record.senderId || '',
        sender_label: record.senderLabel || '',
        sender_email: record.senderEmail || '',
        service_type: record.serviceType || '',
        survey_link: record.surveyLink || '',
        message: record.message || '',
        send_status: record.status || 'Sukses',
        error: record.error || '',
        sent_at: record.sentAt || null,
        opened_at: record.openedAt || null,
        clicked_at: record.clickedAt || null,
        submitted_at: record.submittedAt || null,
      }));
    let { data, error }: { data: unknown; error: unknown } = await supabase
      .from('blast_records')
      .insert(rows)
      .select(HISTORY_SELECT)
      .order('created_at', { ascending: false });

    if (error) {
      const legacyResult = await supabase
        .from('blast_records')
        .insert(rows.map(stripSenderColumns))
        .select(LEGACY_HISTORY_SELECT)
        .order('created_at', { ascending: false });
      data = legacyResult.data;
      error = legacyResult.error;
    }

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
    const body = await request.json().catch(() => ({})) as { ids?: unknown };
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : [];
    const supabase = getSupabase();
    let query = supabase.from('blast_records').delete().select('id');
    query = ids.length > 0 ? query.in('id', ids) : query.neq('id', '');
    const { data, error } = await scopeFilter(query, true, request);

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      deletedIds: (data as Array<{ id: string }> | null)?.map((row) => row.id) ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: formatServerError(error, 'Gagal membersihkan riwayat blast.') },
      { status: 500 },
    );
  }
}
