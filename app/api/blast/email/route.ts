import { NextRequest, NextResponse } from 'next/server';
import { resolveMx } from 'dns/promises';
import nodemailer from 'nodemailer';
import { serviceToSlug } from '../../../services';
import { formatServerError, getSupabase, getSurveyScope, scopeFilter } from '../../../supabase-server';
import { getEmailSenderForCampaign } from '../email-senders';

type EmailRecipient = {
  name: string;
  email: string;
  serviceType?: string;
  serviceTypes?: string[];
};

const MAX_RECIPIENTS_PER_REQUEST = 5;
const DAILY_EMAIL_LIMIT = 100;
const SEND_DELAY_MS = 2000;
const SMTP_RETRY_LIMIT = 1;
const DUPLICATE_WINDOW_HOURS = 24;
const REQUEST_COOLDOWN_MS = 1000;

let lastEmailBlastAt = 0;

const FALLBACK_PUBLIC_APP_URL = 'https://survey.genetikasolusibisnis.co.id';
const DIRJEN_SENDER_EMAIL = 'tu.dirjen_djed@mail.komdigi.go.id';
const INFRASTRUKTUR_SENDER_EMAIL = 'tusesdjid@mail.komdigi.go.id';

const sleep = (ms: number) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isLocalUrl = (value: string) => {
  try {
    const { hostname } = new URL(value);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';
  } catch {
    return true;
  }
};

const getPublicBaseUrl = (request: NextRequest) => {
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  const forwardedUrl = forwardedHost ? `${forwardedProto}://${forwardedHost}` : '';
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || '';
  const publicUrl = forwardedUrl && !isLocalUrl(forwardedUrl)
    ? forwardedUrl
    : configuredUrl && !isLocalUrl(configuredUrl)
      ? configuredUrl
      : FALLBACK_PUBLIC_APP_URL;

  return publicUrl.replace(/\/+$/g, '');
};

const withPublicUrl = (baseUrl: string, path: string) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
};

const hasMailServer = async (email: string) => {
  const domain = email.split('@')[1];
  if (!domain) return false;

  try {
    const records = await resolveMx(domain);
    return records.length > 0;
  } catch {
    return false;
  }
};

const getSurveyLink = (baseUrl: string, serviceType: string) => {
  return withPublicUrl(baseUrl, `/${serviceToSlug(serviceType)}`);
};

const getMultiSurveyLink = (baseUrl: string) => {
  return withPublicUrl(baseUrl, '/multi-survey');
};

const getTrackingUrl = (baseUrl: string, path: string, blastGroupId: string, target?: string) => {
  const params = new URLSearchParams({ blastGroupId });
  if (target) params.set('target', target);
  return `${withPublicUrl(baseUrl, path)}?${params.toString()}`;
};

const getRecipientServices = (person: EmailRecipient) => (
  person.serviceTypes?.filter(Boolean) ?? (person.serviceType ? [person.serviceType] : [])
);

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const getCampaignText = async (campaignId: string) => {
  try {
    const { data } = await getSupabase()
      .from('survey_campaigns')
      .select('name, description')
      .eq('id', campaignId)
      .maybeSingle();
    return `${data?.name || ''} ${data?.description || ''}`;
  } catch {
    return '';
  }
};

const buildEmail = (
  person: EmailRecipient,
  blastGroupId: string,
  baseUrl: string,
  campaignId: string,
  senderFrom: string,
) => {
  const services = getRecipientServices(person);
  const surveyLink = services.length > 1 ? getMultiSurveyLink(baseUrl) : getSurveyLink(baseUrl, services[0]);
  const clickLink = getTrackingUrl(baseUrl, '/api/track/click', blastGroupId, surveyLink);
  const openPixel = getTrackingUrl(baseUrl, '/api/track/open', blastGroupId);
  const serviceListText = services.map((service, index) => `${index + 1}. ${service}`).join('\n');
  const serviceListHtml = services.map((service) => `<li>${escapeHtml(service)}</li>`).join('');
  const safeName = escapeHtml(person.name);
  const safeSurveyLink = escapeHtml(surveyLink);
  const safeClickLink = escapeHtml(clickLink);
  const safeOpenPixel = escapeHtml(openPixel);

  if (normalizeEmail(senderFrom) === INFRASTRUKTUR_SENDER_EMAIL) {
    const subject = 'Survei Kepuasan Layanan Infrastruktur Digital';
    const text = [
      `Yth. Bpk/Ibu ${person.name}`,
      '',
      'Dengan hormat,',
      '',
      'Menindaklanjuti Nota Dinas Sesditjen Infrastruktur Digital No...tanggal...tentang Pelaksanaan Survei Layanan Kesekretariatan, mohon kesediaan Bapak/Ibu untuk mengisi Survei Kepuasan Layanan dan Persepsi Anti Korupsi atas layanan berikut:',
      '',
      serviceListText,
      '',
      'Tautan survei:',
      '',
      clickLink,
      '',
      'Masukan Bapak/Ibu sangat berarti untuk peningkatan kualitas layanan kami.',
      '',
      'Terima kasih.',
    ].join('\n');
    const html = `
      <p>Yth. Bpk/Ibu ${safeName}</p>
      <p>Dengan hormat,</p>
      <p>Menindaklanjuti Nota Dinas Sesditjen Infrastruktur Digital No...tanggal...tentang Pelaksanaan Survei Layanan Kesekretariatan, mohon kesediaan Bapak/Ibu untuk mengisi Survei Kepuasan Layanan dan Persepsi Anti Korupsi atas layanan berikut:</p>
      <p>${services.map(escapeHtml).join('<br />')}</p>
      <p>Tautan survei:</p>
      <p><a href="${safeClickLink}">${safeSurveyLink}</a></p>
      <p>Masukan Bapak/Ibu sangat berarti untuk peningkatan kualitas layanan kami.</p>
      <p>Terima kasih.</p>
      <img src="${safeOpenPixel}" width="1" height="1" alt="" style="display:none" />
    `;

    return { subject, text, html, surveyLink, clickLink };
  }

  if (normalizeEmail(senderFrom) === DIRJEN_SENDER_EMAIL) {
    const subject = 'Survei Kepuasan di Sekretariat dan Tata Usaha Direktorat Jenderal Ekosistem Digital';
    const text = [
      'Yth. Pengguna Layanan Sekretariat dan Tata Usaha di Direktorat Jenderal Ekosistem Digital,',
      '',
      'Dalam rangka meningkatkan kualitas dan optimalisasi pelayanan kepada pegawai, Sekretariat dan Tata Usaha di Direktorat Jenderal Ekosistem Digital menyelenggarakan Survei Kepuasan Pengguna Layanan Kesekretariatan (Dukungan Manajemen) dan Survei Persepsi Anti Korupsi (SPAK) atas layanan yang telah diberikan.',
      '',
      'Kami mohon kesediaan Saudara/i/Bapak/Ibu untuk mengisi survei pada tautan/link survei berikut :',
      clickLink,
      '',
      'Saudara/i/Bapak/Ibu dapat mengisi survei untuk setiap layanan yang telah diterima dari Sekretariat dan Tata Usaha di Direktorat Jenderal Ekosistem Digital pada tanggal 2 Juni s.d. 30 Juni 2026',
      '',
      'Partisipasi Saudara/i/Bapak/Ibu sangat berarti bagi kami dalam upaya meningkatkan kualitas pelayanan kesekretariatan di lingkungan Ditjen Ekosistem Digital',
      '',
      'Terima kasih.',
    ].join('\n');
    const html = `
      <p>Yth. Pengguna Layanan Sekretariat dan Tata Usaha di Direktorat Jenderal Ekosistem Digital,</p>
      <p>Dalam rangka meningkatkan kualitas dan optimalisasi pelayanan kepada pegawai, Sekretariat dan Tata Usaha di Direktorat Jenderal Ekosistem Digital menyelenggarakan Survei Kepuasan Pengguna Layanan Kesekretariatan (Dukungan Manajemen) dan Survei Persepsi Anti Korupsi (SPAK) atas layanan yang telah diberikan.</p>
      <p>Kami mohon kesediaan Saudara/i/Bapak/Ibu untuk mengisi survei pada tautan/link survei berikut :</p>
      <p><a href="${safeClickLink}">${safeSurveyLink}</a></p>
      <p>Saudara/i/Bapak/Ibu dapat mengisi survei untuk setiap layanan yang telah diterima dari Sekretariat dan Tata Usaha di Direktorat Jenderal Ekosistem Digital pada tanggal 2 Juni s.d. 30 Juni 2026</p>
      <p>Partisipasi Saudara/i/Bapak/Ibu sangat berarti bagi kami dalam upaya meningkatkan kualitas pelayanan kesekretariatan di lingkungan Ditjen Ekosistem Digital</p>
      <p>Terima kasih.</p>
      <img src="${safeOpenPixel}" width="1" height="1" alt="" style="display:none" />
    `;

    return { subject, text, html, surveyLink, clickLink };
  }

  const subject = 'Survei Kepuasan Layanan';
  const text = [
    `Yth. ${person.name},`,
    '',
    'Dengan hormat,',
    '',
    'Mohon kesediaan Bapak/Ibu untuk mengisi Survei Kepuasan Layanan dan Persepsi Anti Korupsi atas layanan berikut:',
    serviceListText,
    '',
    `Tautan survei: ${clickLink}`,
    '',
    'Masukan Bapak/Ibu sangat berarti untuk peningkatan kualitas layanan kami.',
    '',
    'Terima kasih.',
  ].join('\n');
  const html = `
    <p>Yth. ${safeName},</p>
    <p>Dengan hormat,</p>
    <p>Mohon kesediaan Bapak/Ibu untuk mengisi Survei Kepuasan Layanan dan Persepsi Anti Korupsi atas layanan berikut:</p>
    <ol>${serviceListHtml}</ol>
    <p>Tautan survei:</p>
    <p><a href="${safeClickLink}">${safeSurveyLink}</a></p>
    <p>Masukan Bapak/Ibu sangat berarti untuk peningkatan kualitas layanan kami.</p>
    <p>Terima kasih.</p>
    <img src="${safeOpenPixel}" width="1" height="1" alt="" style="display:none" />
  `;

  return { subject, text, html, surveyLink, clickLink };
};

const sendMailWithRetry = async (
  transporter: nodemailer.Transporter,
  mail: nodemailer.SendMailOptions,
) => {
  let lastError: unknown;

  for (let attempt = 0; attempt <= SMTP_RETRY_LIMIT; attempt += 1) {
    try {
      return await transporter.sendMail(mail);
    } catch (error) {
      lastError = error;
      if (attempt < SMTP_RETRY_LIMIT) {
        await sleep(SEND_DELAY_MS);
      }
    }
  }

  throw lastError;
};

const buildResultRows = (
  records: {
    id: string;
    service_type: string;
    survey_link: string;
    sender_id: string;
    sender_label: string;
    sender_email: string;
  }[],
  person: EmailRecipient,
  normalizedEmail: string,
  message: string,
  status: 'Sukses' | 'Gagal',
  error: string,
  sentAt?: string,
) => records.map((record) => ({
  id: record.id,
  personName: person.name,
  email: normalizedEmail,
  serviceType: record.service_type,
  surveyLink: record.survey_link,
  senderId: record.sender_id,
  senderLabel: record.sender_label,
  senderEmail: record.sender_email,
  message,
  status,
  error,
  sentAt,
}));

const insertBlastRows = async (
  supabase: ReturnType<typeof getSupabase>,
  rows: Record<string, unknown>[],
) => {
  const { error } = await supabase.from('blast_records').insert(rows);
  if (!error) return;

  const message = formatServerError(error, 'Gagal menyimpan riwayat blast.');
  if (message.includes('sender_id') || message.includes('sender_label') || message.includes('sender_email')) {
    throw new Error('Kolom sender di Supabase belum tersedia. Jalankan migrasi sender blast_records terlebih dahulu.');
  }

  throw error;
};

const insertFailedRecords = async (
  supabase: ReturnType<typeof getSupabase>,
  records: {
    id: string;
    blast_group_id: string;
    channel: string;
    person_name: string;
    email: string;
    sender_id: string;
    sender_label: string;
    sender_email: string;
    service_type: string;
    survey_link: string;
    message: string;
  }[],
  errorMessage: string,
) => {
  await insertBlastRows(supabase, records.map((record) => ({
    ...record,
    send_status: 'Gagal',
    error: errorMessage,
  })));
};

export async function POST(request: NextRequest) {
  try {
    const nowMs = Date.now();
    if (nowMs - lastEmailBlastAt < REQUEST_COOLDOWN_MS) {
      return NextResponse.json(
        { error: 'Tunggu beberapa detik sebelum mulai blast email lagi.' },
        { status: 429 },
      );
    }
    lastEmailBlastAt = nowMs;

    const body = await request.json() as { recipients?: EmailRecipient[]; senderId?: string };
    const recipients = (body.recipients ?? []).filter((person) => (
      person.name?.trim()
      && person.email?.trim()
      && isValidEmail(normalizeEmail(person.email))
      && getRecipientServices(person).length > 0
    ));

    if (recipients.length === 0) {
      return NextResponse.json({ error: 'Tidak ada penerima email yang valid.' }, { status: 400 });
    }
    if (recipients.length > MAX_RECIPIENTS_PER_REQUEST) {
      return NextResponse.json(
        { error: `Maksimal ${MAX_RECIPIENTS_PER_REQUEST} penerima per sekali blast. Kurangi pilihan user dulu.` },
        { status: 400 },
      );
    }

    const activeCampaignId = getSurveyScope(request);
    const sender = getEmailSenderForCampaign(activeCampaignId, await getCampaignText(activeCampaignId));
    const { from, user, pass, host, port, encryption } = sender;
    const secure = encryption === 'ssl' || encryption === 'ssl/tls' || port === 465;
    const supabase = getSupabase();
    const publicBaseUrl = getPublicBaseUrl(request);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayQuery = supabase
      .from('blast_records')
      .select('id', { count: 'exact', head: true })
      .eq('channel', 'Email')
      .eq('send_status', 'Sukses')
      .gte('sent_at', todayStart.toISOString());
    const { count: todayCount, error: countError } = await scopeFilter(todayQuery, true, request);

    if (countError) throw countError;
    if ((todayCount ?? 0) + recipients.length > DAILY_EMAIL_LIMIT) {
      return NextResponse.json(
        { error: `Limit harian ${DAILY_EMAIL_LIMIT} email sudah/akan terlewati. Hari ini sudah terkirim ${todayCount ?? 0}.` },
        { status: 429 },
      );
    }

    const transporter = nodemailer.createTransport(host ? {
      host,
      port,
      secure,
      requireTLS: !secure && (encryption === 'tls' || encryption === 'starttls'),
      auth: { user, pass },
    } : {
      service: 'gmail',
      auth: { user, pass },
    });

    const results: {
      id: string;
      personName: string;
      email: string;
      serviceType: string;
      surveyLink: string;
      message: string;
      status: 'Sukses' | 'Gagal';
      error: string;
      sentAt?: string;
    }[][] = [];

    for (const [index, person] of recipients.entries()) {
      if (index > 0) {
        await sleep(SEND_DELAY_MS);
      }

      const normalizedEmail = normalizeEmail(person.email);
      const blastGroupId = crypto.randomUUID();
      const services = getRecipientServices(person);
      const campaignId = getSurveyScope(request);
      const email = buildEmail(person, blastGroupId, publicBaseUrl, campaignId, sender.from);
      const sentAt = new Date().toISOString();
      const duplicateSince = new Date(Date.now() - DUPLICATE_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
      const records = services.map((serviceType) => ({
        id: crypto.randomUUID(),
        blast_group_id: blastGroupId,
        channel: 'Email',
        person_name: person.name,
        email: normalizedEmail,
        sender_id: sender.id,
        sender_label: sender.label,
        sender_email: sender.from,
        service_type: serviceType,
        survey_link: getSurveyLink(publicBaseUrl, serviceType),
        message: email.text,
        campaign_id: campaignId,
      }));

      try {
        if (!await hasMailServer(normalizedEmail)) {
          const errorMessage = 'Domain email tidak punya server penerima email/MX record.';
          await insertFailedRecords(supabase, records, errorMessage);
          results.push(buildResultRows(records, person, normalizedEmail, email.text, 'Gagal', errorMessage));
          continue;
        }

        const duplicateQuery = supabase
          .from('blast_records')
          .select('service_type, survey_link')
          .eq('channel', 'Email')
          .eq('email', normalizedEmail)
          .in('service_type', services)
          .in('send_status', ['Pending', 'Sukses'])
          .gte('created_at', duplicateSince);
        const { data: duplicateRows, error: duplicateError } = await scopeFilter(duplicateQuery, true, request);

        if (duplicateError) throw duplicateError;
        const duplicateServices = ((duplicateRows ?? []) as Array<{ service_type: string; survey_link: string }>)
          .filter((row) => row.survey_link === getSurveyLink(publicBaseUrl, row.service_type))
          .map((row) => row.service_type);
        if (duplicateServices.length > 0) {
          const duplicateMessage = `Dilewati: email untuk layanan ini sudah dikirim/diproses dalam ${DUPLICATE_WINDOW_HOURS} jam terakhir (${duplicateServices}).`;
          results.push(buildResultRows(records, person, normalizedEmail, email.text, 'Gagal', duplicateMessage));
          continue;
        }

        await insertBlastRows(supabase, records.map((record) => ({
          ...record,
          send_status: 'Pending',
          error: '',
        })));

        const sendInfo = await sendMailWithRetry(transporter, {
          from: `"Survei Kepuasan Layanan" <${from}>`,
          to: normalizedEmail,
          subject: email.subject,
          text: email.text,
          html: email.html,
        });
        const rejected = Array.isArray(sendInfo.rejected) ? sendInfo.rejected.map(String) : [];
        const accepted = Array.isArray(sendInfo.accepted) ? sendInfo.accepted.map(String) : [];

        if (rejected.includes(normalizedEmail) || accepted.length === 0) {
          throw new Error(`SMTP menolak penerima: ${normalizedEmail}`);
        }

        const { error: updateError } = await supabase
          .from('blast_records')
          .update({
          send_status: 'Sukses',
          error: 'Diterima server SMTP. Delivery ke inbox tetap bergantung server penerima.',
          sent_at: sentAt,
          })
          .eq('blast_group_id', blastGroupId)
          .eq('campaign_id', campaignId);

        if (updateError) throw updateError;

        results.push(buildResultRows(
          records,
          person,
          normalizedEmail,
          email.text,
          'Sukses',
          'Diterima server SMTP. Delivery ke inbox tetap bergantung server penerima.',
          sentAt,
        ));
      } catch (error) {
        const errorMessage = formatServerError(error, 'Email gagal dikirim.');
        await supabase
          .from('blast_records')
          .update({
            send_status: 'Gagal',
            error: errorMessage,
          })
          .eq('blast_group_id', blastGroupId)
          .eq('campaign_id', campaignId);

        results.push(records.map((record) => ({
          id: record.id,
          personName: person.name,
          email: normalizedEmail,
          senderId: record.sender_id,
          senderLabel: record.sender_label,
          senderEmail: record.sender_email,
          serviceType: record.service_type,
          surveyLink: record.survey_link,
          message: email.text,
          status: 'Gagal',
          error: errorMessage,
        })));
      }
    }

    return NextResponse.json({ results: results.flat() });
  } catch (error) {
    return NextResponse.json(
      { error: formatServerError(error, 'Email blast gagal diproses.') },
      { status: 500 },
    );
  }
}
