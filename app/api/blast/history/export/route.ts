import { NextRequest, NextResponse } from 'next/server';
import writeXlsxFile from 'write-excel-file/node';
import { formatServerError, getSupabase, scopeFilter } from '../../../../supabase-server';

type BlastExportRow = {
  id: string;
  created_at: string;
  person_name: string;
  email: string;
  sender_label?: string | null;
  sender_email?: string | null;
  service_type: string;
  survey_link: string;
  send_status: 'Sukses' | 'Gagal' | 'Pending';
  error: string | null;
  sent_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  submitted_at: string | null;
};

const EXPORT_SELECT = 'id, created_at, person_name, email, sender_label, sender_email, service_type, survey_link, send_status, error, sent_at, opened_at, clicked_at, submitted_at';
const LEGACY_EXPORT_SELECT = 'id, created_at, person_name, email, service_type, survey_link, send_status, error, sent_at, opened_at, clicked_at, submitted_at';

const getSenderDisplayLabel = (row: { senderEmail?: string | null; senderLabel?: string | null }) => {
  if (row.senderEmail?.toLowerCase() === 'tusesdjid@mail.komdigi.go.id') {
    return 'Sekretariat DJID';
  }

  return row.senderLabel || row.senderEmail || '';
};

const formatDateTime = (value?: string | null) => (
  value ? new Date(value).toLocaleString('id-ID') : '-'
);

const getMonitoringStatus = (row: {
  status: BlastExportRow['send_status'];
  sentAt?: string | null;
  openedAt?: string | null;
  clickedAt?: string | null;
  submittedAt?: string | null;
}) => {
  if (row.status === 'Gagal') return 'Gagal dikirim';
  if (row.submittedAt) return 'Terima dan sudah isi';
  if (row.clickedAt) return 'Terima, buka link, belum isi';
  if (row.openedAt) return 'Terima, buka email, belum isi';
  if (row.sentAt || row.status === 'Sukses') return 'Terima, belum buka email/link';
  return 'Belum terkirim';
};

const mapRow = (row: BlastExportRow) => ({
  id: row.id,
  createdAt: row.created_at,
  personName: row.person_name,
  email: row.email,
  senderLabel: row.sender_label ?? '',
  senderEmail: row.sender_email ?? '',
  serviceType: row.service_type,
  surveyLink: row.survey_link,
  status: row.send_status,
  error: row.error ?? '',
  sentAt: row.sent_at,
  openedAt: row.opened_at,
  clickedAt: row.clicked_at,
  submittedAt: row.submitted_at,
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as { ids?: unknown };
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: 'Tidak ada riwayat untuk didownload.' }, { status: 400 });
    }

    const supabase = getSupabase();
    const query = supabase
      .from('blast_records')
      .select(EXPORT_SELECT)
      .eq('channel', 'Email')
      .in('id', ids)
      .order('created_at', { ascending: true });
    let { data, error }: { data: unknown; error: unknown } = await scopeFilter(query, true, request);

    if (error) {
      const legacyQuery = supabase
        .from('blast_records')
        .select(LEGACY_EXPORT_SELECT)
        .eq('channel', 'Email')
        .in('id', ids)
        .order('created_at', { ascending: true });
      const legacyResult = await scopeFilter(legacyQuery, true, request);
      data = legacyResult.data;
      error = legacyResult.error;
    }

    if (error) throw error;

    const rows = (data as BlastExportRow[]).map(mapRow).map((row, index) => ({
      nomor: index + 1,
      waktu: formatDateTime(row.createdAt),
      nama: row.personName,
      email: row.email,
      sender: getSenderDisplayLabel(row),
      senderEmail: row.senderEmail,
      layanan: row.serviceType,
      link: row.surveyLink,
      terkirim: formatDateTime(row.sentAt),
      emailDibuka: formatDateTime(row.openedAt),
      linkDibuka: formatDateTime(row.clickedAt),
      sudahIsi: formatDateTime(row.submittedAt),
      monitoring: getMonitoringStatus(row),
      error: row.error,
    }));
    const columns = [
      { header: 'No.', width: 8, cell: (row: typeof rows[number]) => ({ value: row.nomor }) },
      { header: 'Waktu', width: 22, cell: (row: typeof rows[number]) => ({ type: String, value: row.waktu }) },
      { header: 'Nama', width: 26, cell: (row: typeof rows[number]) => ({ type: String, value: row.nama }) },
      { header: 'Email', width: 34, cell: (row: typeof rows[number]) => ({ type: String, value: row.email }) },
      { header: 'Sender', width: 24, cell: (row: typeof rows[number]) => ({ type: String, value: row.sender }) },
      { header: 'Email Sender', width: 34, cell: (row: typeof rows[number]) => ({ type: String, value: row.senderEmail }) },
      { header: 'Layanan', width: 52, cell: (row: typeof rows[number]) => ({ type: String, value: row.layanan }) },
      { header: 'Link', width: 72, cell: (row: typeof rows[number]) => ({ type: String, value: row.link }) },
      { header: 'Terkirim', width: 22, cell: (row: typeof rows[number]) => ({ type: String, value: row.terkirim }) },
      { header: 'Email Dibuka', width: 22, cell: (row: typeof rows[number]) => ({ type: String, value: row.emailDibuka }) },
      { header: 'Link Dibuka', width: 22, cell: (row: typeof rows[number]) => ({ type: String, value: row.linkDibuka }) },
      { header: 'Sudah Isi', width: 22, cell: (row: typeof rows[number]) => ({ type: String, value: row.sudahIsi }) },
      { header: 'Monitoring', width: 34, cell: (row: typeof rows[number]) => ({ type: String, value: row.monitoring }) },
      { header: 'Error', width: 44, cell: (row: typeof rows[number]) => ({ type: String, value: row.error }) },
    ];
    const buffer = await writeXlsxFile(rows, { columns }).toBuffer();
    const filename = `riwayat-blast-${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: formatServerError(error, 'Download Excel riwayat blast gagal.') },
      { status: 500 },
    );
  }
}
