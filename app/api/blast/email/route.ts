import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { serviceToSlug } from '../../../services';
import { formatServerError, getRequiredEnv, getSupabase } from '../../../supabase-server';

type EmailRecipient = {
  name: string;
  email: string;
  whatsapp: string;
  serviceType: string;
};

const getAppUrl = () => {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  if (!configuredUrl) return '';
  return configuredUrl.startsWith('http') ? configuredUrl : `https://${configuredUrl}`;
};

const getSurveyLink = (serviceType: string, blastId?: string) => {
  const baseUrl = getAppUrl().replace(/\/+$/g, '');
  const path = `${baseUrl}/${serviceToSlug(serviceType)}`;
  return blastId ? `${path}?blastId=${encodeURIComponent(blastId)}` : path;
};

const getTrackingUrl = (path: string, blastId: string) => {
  const baseUrl = getAppUrl().replace(/\/+$/g, '');
  return `${baseUrl}${path}?blastId=${encodeURIComponent(blastId)}`;
};

const buildEmail = (person: EmailRecipient, blastId: string) => {
  const surveyLink = getSurveyLink(person.serviceType, blastId);
  const clickLink = getTrackingUrl('/api/track/click', blastId);
  const openPixel = getTrackingUrl('/api/track/open', blastId);
  const subject = 'Permohonan Pengisian Survei Layanan';
  const text = [
    `Halo ${person.name},`,
    '',
    'Mohon kesediaannya untuk mengisi survei layanan berikut:',
    person.serviceType,
    '',
    `Link survei: ${clickLink}`,
    '',
    'Terima kasih.',
  ].join('\n');
  const html = `
    <p>Halo ${person.name},</p>
    <p>Mohon kesediaannya untuk mengisi survei layanan berikut:</p>
    <p><strong>${person.serviceType}</strong></p>
    <p><a href="${clickLink}">Isi survei layanan</a></p>
    <p>${surveyLink}</p>
    <p>Terima kasih.</p>
    <img src="${openPixel}" width="1" height="1" alt="" style="display:none" />
  `;

  return { subject, text, html, surveyLink, clickLink };
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { recipients?: EmailRecipient[] };
    const recipients = (body.recipients ?? []).filter((person) => (
      person.name?.trim() && person.email?.trim() && person.serviceType?.trim()
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
      const blastId = crypto.randomUUID();
      const email = buildEmail(person, blastId);
      const baseRecord = {
        id: blastId,
        channel: 'Email',
        person_name: person.name,
        whatsapp: person.whatsapp || '',
        email: person.email,
        service_type: person.serviceType,
        survey_link: email.surveyLink,
        message: email.text,
      };

      try {
        await transporter.sendMail({
          from: `"GRC Survey" <${from}>`,
          to: person.email,
          subject: email.subject,
          text: email.text,
          html: email.html,
        });

        const { error: insertError } = await supabase.from('blast_records').insert({
          ...baseRecord,
          send_status: 'Sukses',
          error: '',
          sent_at: new Date().toISOString(),
        });

        if (insertError) throw insertError;

        return {
          id: blastId,
          personName: person.name,
          email: person.email,
          whatsapp: person.whatsapp,
          serviceType: person.serviceType,
          surveyLink: email.surveyLink,
          message: email.text,
          status: 'Sukses',
          error: '',
        };
      } catch (error) {
        await supabase.from('blast_records').insert({
          ...baseRecord,
          send_status: 'Gagal',
          error: formatServerError(error, 'Email gagal dikirim.'),
        });

        return {
          id: blastId,
          personName: person.name,
          email: person.email,
          whatsapp: person.whatsapp,
          serviceType: person.serviceType,
          surveyLink: email.surveyLink,
          message: email.text,
          status: 'Gagal',
          error: formatServerError(error, 'Email gagal dikirim.'),
        };
      }
    }));

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { error: formatServerError(error, 'Email blast gagal diproses.') },
      { status: 500 },
    );
  }
}
