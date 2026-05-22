import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { serviceToSlug } from '../../../services';

type EmailRecipient = {
  name: string;
  email: string;
  whatsapp: string;
  serviceType: string;
};

const getRequiredEnv = (key: string) => {
  const value = process.env[key];
  if (!value) throw new Error(`${key} belum diset`);
  return value;
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

const buildEmail = (person: EmailRecipient) => {
  const surveyLink = getSurveyLink(person.serviceType);
  const subject = 'Permohonan Pengisian Survei Layanan';
  const text = [
    `Halo ${person.name},`,
    '',
    'Mohon kesediaannya untuk mengisi survei layanan berikut:',
    person.serviceType,
    '',
    `Link survei: ${surveyLink}`,
    '',
    'Terima kasih.',
  ].join('\n');
  const html = `
    <p>Halo ${person.name},</p>
    <p>Mohon kesediaannya untuk mengisi survei layanan berikut:</p>
    <p><strong>${person.serviceType}</strong></p>
    <p><a href="${surveyLink}">${surveyLink}</a></p>
    <p>Terima kasih.</p>
  `;

  return { subject, text, html, surveyLink };
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

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });

    const results = await Promise.all(recipients.map(async (person) => {
      const email = buildEmail(person);

      try {
        await transporter.sendMail({
          from: `"GRC Survey" <${from}>`,
          to: person.email,
          subject: email.subject,
          text: email.text,
          html: email.html,
        });

        return {
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
        return {
          personName: person.name,
          email: person.email,
          whatsapp: person.whatsapp,
          serviceType: person.serviceType,
          surveyLink: email.surveyLink,
          message: email.text,
          status: 'Gagal',
          error: error instanceof Error ? error.message : 'Email gagal dikirim.',
        };
      }
    }));

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Email blast gagal diproses.' },
      { status: 500 },
    );
  }
}
