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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { recipients?: EmailRecipient[] };
    const recipients = (body.recipients ?? []).filter((person) => (
      person.name?.trim() && person.email?.trim() && getRecipientServices(person).length > 0
    ));

    if (recipients.length === 0) {
      return NextResponse.json({ error: 'Tidak ada penerima email yang valid.' }, { status: 400 });
    }

    const from = getRequiredEnv('EMAIL_FROM');
    const user = getRequiredEnv('EMAIL_USER');
    const pass = getRequiredEnv('EMAIL_APP_PASSWORD').replace(/\s/g, '');
    const supabase = getSupabase();

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });

    const results = await Promise.all(recipients.map(async (person) => {
      const blastGroupId = crypto.randomUUID();
      const services = getRecipientServices(person);
      const email = buildEmail(person, blastGroupId);
      const sentAt = new Date().toISOString();
      const records = services.map((serviceType) => ({
        id: crypto.randomUUID(),
        blast_group_id: blastGroupId,
        channel: 'Email',
        person_name: person.name,
        whatsapp: person.whatsapp || '',
        email: person.email,
        service_type: serviceType,
        survey_link: getSurveyLink(serviceType),
        message: email.text,
      }));

      try {
        const { error: pendingInsertError } = await supabase.from('blast_records').insert(records.map((record) => ({
          ...record,
          send_status: 'Pending',
          error: '',
        })));

        if (pendingInsertError) throw pendingInsertError;

        await transporter.sendMail({
          from: `"GRC Survey" <${from}>`,
          to: person.email,
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

        return records.map((record) => ({
          id: record.id,
          personName: person.name,
          email: person.email,
          whatsapp: person.whatsapp,
          serviceType: record.service_type,
          surveyLink: record.survey_link,
          message: email.text,
          status: 'Sukses',
          error: '',
          sentAt,
        }));
      } catch (error) {
        const errorMessage = formatServerError(error, 'Email gagal dikirim.');
        await supabase
          .from('blast_records')
          .update({
            send_status: 'Gagal',
            error: errorMessage,
          })
          .eq('blast_group_id', blastGroupId);

        return records.map((record) => ({
          id: record.id,
          personName: person.name,
          email: person.email,
          whatsapp: person.whatsapp,
          serviceType: record.service_type,
          surveyLink: record.survey_link,
          message: email.text,
          status: 'Gagal',
          error: errorMessage,
        }));
      }
    }));

    return NextResponse.json({ results: results.flat() });
  } catch (error) {
    return NextResponse.json(
      { error: formatServerError(error, 'Email blast gagal diproses.') },
      { status: 500 },
    );
  }
}
