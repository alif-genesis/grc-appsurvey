import { NextRequest, NextResponse } from 'next/server';
import { serviceToSlug } from '../../../services';
import { formatServerError, getSupabase, getSurveyScope, scopeFilter } from '../../../supabase-server';

type WhatsAppRecipient = {
  id?: string;
  name: string;
  whatsappNumber: string;
  serviceTypes?: string[];
};

type BlastPersonRow = {
  id: string;
  name: string;
  whatsapp_number: string | null;
  service_types: unknown;
};

const MAX_RECIPIENTS_PER_REQUEST = 100;
const FALLBACK_PUBLIC_APP_URL = 'https://survey.genetikasolusibisnis.co.id';

const normalizeServices = (value: unknown) => (
  Array.isArray(value)
    ? Array.from(new Set(value.filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0,
    )))
    : []
);

const normalizeWhatsAppNumber = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  return digits;
};

const isValidWhatsAppNumber = (value: string) => /^628\d{7,12}$/.test(normalizeWhatsAppNumber(value));

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

const getSurveyLink = (baseUrl: string, serviceType: string) => (
  `${baseUrl}/${serviceToSlug(serviceType)}`
);

const uuidToShortCode = (uuid: string) => uuid.replace(/-/g, '').slice(0, 10);

const buildTrackingLink = (baseUrl: string, blastGroupId: string) => (
  `${baseUrl}/w/${uuidToShortCode(blastGroupId)}`
);

const buildWhatsAppMessage = (person: WhatsAppRecipient, services: string[], trackingLink: string) => {
  const serviceLines = services.map((service, index) => `${index + 1}. ${service}`);
  return [
    `Yth. Bapak/Ibu ${person.name},`,
    '',
    'Mohon kesediaannya mengisi Survei Kepuasan Layanan dan Persepsi Anti Korupsi untuk layanan berikut:',
    ...serviceLines,
    '',
    'Silakan lengkapi nama dan satuan kerja pada formulir agar jawaban tercatat sesuai data responden.',
    '',
    `Link survei: ${trackingLink}`,
    '',
    'Link ini khusus untuk penerima dan tidak perlu diteruskan. Jika survei sudah disubmit, link tidak dapat digunakan untuk mengirim jawaban kedua.',
    '',
    'Apabila ada kendala, dapat menghubungi staf Bagian Umum DJID:',
    '1. Lita Nafilati 087821951462',
    '2. Anas Handoyo 085717345939',
    '3. Hendra Prasetyo 087870521144',
    '',
    'Terima kasih.',
  ].join('\n');
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { recipients?: WhatsAppRecipient[] };
    const recipients = (body.recipients ?? []).filter((person) => person.id && person.name?.trim());

    if (recipients.length === 0) {
      return NextResponse.json({ error: 'Tidak ada penerima WhatsApp yang dipilih.' }, { status: 400 });
    }
    if (recipients.length > MAX_RECIPIENTS_PER_REQUEST) {
      return NextResponse.json(
        { error: `Maksimal ${MAX_RECIPIENTS_PER_REQUEST} penerima per antrean WhatsApp.` },
        { status: 400 },
      );
    }

    const supabase = getSupabase();
    const recipientIds = recipients.map((person) => person.id).filter((id): id is string => Boolean(id));
    const peopleQuery = supabase
      .from('blast_people')
      .select('id, name, whatsapp_number, service_types')
      .in('id', recipientIds);
    const { data, error } = await scopeFilter(peopleQuery, true, request);
    if (error) throw error;

    const peopleById = new Map((data as BlastPersonRow[]).map((person) => [person.id, person]));
    const verifiedRecipients = recipients.map((recipient) => {
      const person = recipient.id ? peopleById.get(recipient.id) : undefined;
      if (!person) throw new Error(`Penerima ${recipient.name} tidak ada di daftar responden survey aktif.`);

      const whatsappNumber = person.whatsapp_number?.trim() || '';
      if (!isValidWhatsAppNumber(whatsappNumber)) {
        throw new Error(`Nomor WA ${person.name} belum valid. Gunakan format 08... atau 628...`);
      }

      const services = normalizeServices(person.service_types);
      if (services.length === 0) throw new Error(`Layanan ${person.name} belum tersedia.`);
      return {
        id: person.id,
        name: person.name,
        whatsappNumber,
        serviceTypes: services,
      };
    });

    const campaignId = getSurveyScope(request);
    const baseUrl = getPublicBaseUrl(request);
    const queue = [];

    for (const person of verifiedRecipients) {
      const services = person.serviceTypes;
      const blastGroupId = crypto.randomUUID();
      const trackingLink = buildTrackingLink(baseUrl, blastGroupId);
      const message = buildWhatsAppMessage(person, services, trackingLink);
      const normalizedNumber = normalizeWhatsAppNumber(person.whatsappNumber);
      const createdAt = Date.now();
      const records = services.map((serviceType, serviceIndex) => ({
        id: crypto.randomUUID(),
        campaign_id: campaignId,
        blast_group_id: blastGroupId,
        created_at: new Date(createdAt + serviceIndex).toISOString(),
        channel: 'WhatsApp',
        person_name: person.name,
        email: '',
        whatsapp_number: normalizedNumber,
        sender_id: '',
        sender_label: 'WhatsApp Web',
        sender_email: '',
        service_type: serviceType,
        survey_link: getSurveyLink(baseUrl, serviceType),
        message,
        send_status: 'Pending',
        error: 'Antrean dibuat. Menunggu konfirmasi operator setelah pesan dikirim melalui WhatsApp.',
      }));

      const { error: insertError } = await supabase.from('blast_records').insert(records);
      if (insertError) throw insertError;

      queue.push({
        blastGroupId,
        personId: person.id,
        personName: person.name,
        whatsappNumber: normalizedNumber,
        services,
        trackingLink,
        message,
        whatsappUrl: `https://wa.me/${normalizedNumber}?text=${encodeURIComponent(message)}`,
        recordIds: records.map((record) => record.id),
      });
    }

    return NextResponse.json({ queue });
  } catch (error) {
    return NextResponse.json(
      { error: formatServerError(error, 'Antrean blast WhatsApp gagal dibuat.') },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as { blastGroupId?: string; status?: 'sent' | 'failed' };
    const blastGroupId = body.blastGroupId?.trim() || '';
    if (!blastGroupId) {
      return NextResponse.json({ error: 'ID antrean WhatsApp tidak ditemukan.' }, { status: 400 });
    }

    const sentAt = body.status === 'sent' ? new Date().toISOString() : null;
    const supabase = getSupabase();
    const query = supabase
      .from('blast_records')
      .update({
        send_status: body.status === 'sent' ? 'Sukses' : 'Gagal',
        sent_at: sentAt,
        error: body.status === 'sent'
          ? 'Ditandai terkirim oleh operator melalui WhatsApp Web.'
          : 'Ditandai gagal/tidak dikirim oleh operator.',
      })
      .eq('blast_group_id', blastGroupId)
      .eq('channel', 'WhatsApp')
      .select('id');
    const { data, error } = await scopeFilter(query, true, request);
    if (error) throw error;
    if (!data?.length) {
      return NextResponse.json({ error: 'Antrean WhatsApp tidak ditemukan.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, updated: data.length, sentAt });
  } catch (error) {
    return NextResponse.json(
      { error: formatServerError(error, 'Status blast WhatsApp gagal diperbarui.') },
      { status: 500 },
    );
  }
}
