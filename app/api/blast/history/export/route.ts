import { NextRequest, NextResponse } from 'next/server';
import writeXlsxFile from 'write-excel-file/node';
import { formatServerError } from '../../../../supabase-server';

type BlastExportRecord = {
  id: string;
  createdAt: string;
  personName: string;
  email: string;
  senderLabel?: string | null;
  senderEmail?: string | null;
  serviceType: string;
  surveyLink: string;
  manualLink?: string | null;
  status: 'Sukses' | 'Gagal' | 'Pending';
  error?: string | null;
  sentAt?: string | null;
  openedAt?: string | null;
  clickedAt?: string | null;
  submittedAt?: string | null;
};

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
  status: BlastExportRecord['status'];
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

const isExportRecord = (record: unknown): record is BlastExportRecord => (
  Boolean(record)
  && typeof record === 'object'
  && typeof (record as BlastExportRecord).id === 'string'
  && typeof (record as BlastExportRecord).createdAt === 'string'
  && typeof (record as BlastExportRecord).personName === 'string'
  && typeof (record as BlastExportRecord).email === 'string'
  && typeof (record as BlastExportRecord).serviceType === 'string'
  && typeof (record as BlastExportRecord).surveyLink === 'string'
  && ['Sukses', 'Gagal', 'Pending'].includes((record as BlastExportRecord).status)
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as { records?: unknown };
    const records = Array.isArray(body.records)
      ? body.records.filter(isExportRecord)
      : [];

    if (records.length === 0) {
      return NextResponse.json({ error: 'Tidak ada riwayat untuk didownload.' }, { status: 400 });
    }

    const rows = records.map((row, index) => ({
      nomor: index + 1,
      waktu: formatDateTime(row.createdAt),
      nama: row.personName,
      email: row.email,
      sender: getSenderDisplayLabel(row),
      senderEmail: row.senderEmail || '',
      layanan: row.serviceType,
      link: row.surveyLink,
      linkJapri: row.manualLink || row.surveyLink,
      terkirim: formatDateTime(row.sentAt),
      emailDibuka: formatDateTime(row.openedAt),
      linkDibuka: formatDateTime(row.clickedAt),
      sudahIsi: formatDateTime(row.submittedAt),
      monitoring: getMonitoringStatus(row),
      error: row.error || '',
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
      { header: 'Link Japri', width: 72, cell: (row: typeof rows[number]) => ({ type: String, value: row.linkJapri }) },
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
