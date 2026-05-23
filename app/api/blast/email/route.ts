import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { serviceToSlug } from '../../../services';
import { formatServerError, getRequiredEnv, getSupabase } from '../../../supabase-server';

type EmailRecipient = {
  name: string;
  email: string;
  whatsapp: string;
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

const sleep = (ms: number) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const getAppUrl = () => {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  if (!configuredUrl) return '';
  return configuredUrl.startsWith('http') ? configuredUrl : `https://${configuredUrl}`;
};

const getSurveyLink = (serviceType: string) => {
  const baseUrl = getAppUrl().replace(/\/+$/g, '');
  return `${baseUrl}/${serviceToSlug(serviceType)}`;
};

const getMultiSurveyLink = () => {
  const baseUrl = getAppUrl().replace(/\/+$/g, '');
  return `${baseUrl}/multi-survey`;
};

const getTrackingUrl = (path: string, blastGroupId: string) => {
  const baseUrl = getAppUrl().replace(/\/+$/g, '');
  return `${baseUrl}${path}?blastGroupId=${encodeURIComponent(blastGroupId)}`;
};

const getRecipientServices = (person: EmailRecipient) => (
  person.serviceTypes?.filter(Boolean) ?? (person.serviceType ? [person.serviceType] : [])
);

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const buildEmail = (person: EmailRecipient, blastGroupId: string) => {
  const services = getRecipientServices(person);
  const surveyLink = services.length > 1 ? getMultiSurveyLink() : getSurveyLink(services[0]);
  const clickLink = getTrackingUrl('/api/track/click', blastGroupId);
  const openPixel = getTrackingUrl('/api/track/open', blastGroupId);
  const serviceListText = services.map((service, index) => `${index + 1}. ${service}`).join('\n');
  const serviceListHtml = services.map((service) => `<li>${service}</li>`).join('');
  const subject = 'Permohonan Pengisian Survei Kepuasan Layanan';
  const text = [
    `Yth. ${person.name},`,
    '',
    'Dengan hormat,',
    '',
    'Mohon kesediaan Bapak/Ibu untuk mengisi Survei Kepuasan Layanan dan Persepsi Anti Korupsi atas layanan berikut:',
    serviceListText,
    '',
    `Tautan survei: ${surveyLink}`,
    '',
    'Masukan Bapak/Ibu sangat berarti untuk peningkatan kualitas layanan kami.',
    '',
    'Terima kasih.',
  ].join('\n');
  const html = `
    <p>Yth. ${person.name},</p>
    <p>Dengan hormat,</p>
    <p>Mohon kesediaan Bapak/Ibu untuk mengisi Survei Kepuasan Layanan dan Persepsi Anti Korupsi atas layanan berikut:</p>
    <ol>${serviceListHtml}</ol>
    <p>Tautan survei:</p>
    <p><a href="${clickLink}">${surveyLink}</a></p>
    <p>Masukan Bapak/Ibu sangat berarti untuk peningkatan kualitas layanan kami.</p>
    <p>Terima kasih.</p>
    <img src="${openPixel}" width="1" height="1" alt="" style="display:none" />
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

    const body = await request.json() as { recipients?: EmailRecipient[] };
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

    const from = getRequiredEnv('EMAIL_FROM');
    const user = getRequiredEnv('EMAIL_USER');
    const pass = getRequiredEnv('EMAIL_APP_PASSWORD').replace(/\s/g, '');
    const supabase = getSupabase();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count: todayCount, error: countError } = await supabase
      .from('blast_records')
      .select('id', { count: 'exact', head: true })
      .eq('channel', 'Email')
      .eq('send_status', 'Sukses')
      .gte('sent_at', todayStart.toISOString());

    if (countError) throw countError;
    if ((todayCount ?? 0) + recipients.length > DAILY_EMAIL_LIMIT) {
      return NextResponse.json(
        { error: `Limit harian ${DAILY_EMAIL_LIMIT} email sudah/akan terlewati. Hari ini sudah terkirim ${todayCount ?? 0}.` },
        { status: 429 },
      );
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });

    const results: {
      id: string;
      personName: string;
      email: string;
      whatsapp: string;
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
      const email = buildEmail(person, blastGroupId);
      const sentAt = new Date().toISOString();
      const duplicateSince = new Date(Date.now() - DUPLICATE_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
      const records = services.map((serviceType) => ({
        id: crypto.randomUUID(),
        blast_group_id: blastGroupId,
        channel: 'Email',
        person_name: person.name,
        whatsapp: person.whatsapp || '',
        email: normalizedEmail,
        service_type: serviceType,
        survey_link: getSurveyLink(serviceType),
        message: email.text,
      }));

      try {
        const { data: duplicateRows, error: duplicateError } = await supabase
          .from('blast_records')
          .select('service_type')
          .eq('channel', 'Email')
          .eq('email', normalizedEmail)
          .in('service_type', services)
          .in('send_status', ['Pending', 'Sukses'])
          .gte('created_at', duplicateSince);

        if (duplicateError) throw duplicateError;
        if ((duplicateRows ?? []).length > 0) {
          const duplicateServices = duplicateRows.map((row) => row.service_type).join(', ');
          const duplicateMessage = `Dilewati: email untuk layanan ini sudah dikirim/diproses dalam ${DUPLICATE_WINDOW_HOURS} jam terakhir (${duplicateServices}).`;
          results.push(records.map((record) => ({
            id: record.id,
            personName: person.name,
            email: normalizedEmail,
            whatsapp: person.whatsapp,
            serviceType: record.service_type,
            surveyLink: record.survey_link,
            message: email.text,
            status: 'Gagal',
            error: duplicateMessage,
          })));
          continue;
        }

        const { error: pendingInsertError } = await supabase.from('blast_records').insert(records.map((record) => ({
          ...record,
          send_status: 'Pending',
          error: '',
        })));

        if (pendingInsertError) throw pendingInsertError;

        await sendMailWithRetry(transporter, {
          from: `"GRC Survey" <${from}>`,
          to: normalizedEmail,
          subject: email.subject,
          text: email.text,
          html: email.html,
        });

        const { error: updateError } = await supabase
          .from('blast_records')
          .update({
          send_status: 'Sukses',
          error: '',
          sent_at: sentAt,
          })
          .eq('blast_group_id', blastGroupId);

        if (updateError) throw updateError;

        results.push(records.map((record) => ({
          id: record.id,
          personName: person.name,
          email: normalizedEmail,
          whatsapp: person.whatsapp,
          serviceType: record.service_type,
          surveyLink: record.survey_link,
          message: email.text,
          status: 'Sukses',
          error: '',
          sentAt,
        })));
      } catch (error) {
        const errorMessage = formatServerError(error, 'Email gagal dikirim.');
        await supabase
          .from('blast_records')
          .update({
            send_status: 'Gagal',
            error: errorMessage,
          })
          .eq('blast_group_id', blastGroupId);

        results.push(records.map((record) => ({
          id: record.id,
          personName: person.name,
          email: normalizedEmail,
          whatsapp: person.whatsapp,
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
