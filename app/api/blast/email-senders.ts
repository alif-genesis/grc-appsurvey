export type EmailSenderConfig = {
  id: string;
  label: string;
  from: string;
  user: string;
  pass: string;
  host?: string;
  port: number;
  encryption: string;
  surveyMatches: string[];
};

const getEnv = (...keys: string[]) => {
  const key = keys.find((candidate) => process.env[candidate]);
  return key ? process.env[key] : undefined;
};

const normalizeSenderKey = (id: string) => id.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');

const buildSenderConfig = (id: string): EmailSenderConfig | null => {
  const key = normalizeSenderKey(id);
  if (!key) return null;

  const prefix = `MAIL_SENDER_${key}_`;
  const from = process.env[`${prefix}FROM`] || process.env[`${prefix}FROM_ADDRESS`];
  const user = process.env[`${prefix}USERNAME`] || process.env[`${prefix}USER`];
  const pass = process.env[`${prefix}PASSWORD`] || process.env[`${prefix}APP_PASSWORD`];
  if (!from || !user || !pass) return null;

  return {
    id,
    label: process.env[`${prefix}LABEL`] || from,
    from,
    user,
    pass: pass.replace(/\s/g, ''),
    host: process.env[`${prefix}HOST`],
    port: Number(process.env[`${prefix}PORT`] || 587),
    encryption: (process.env[`${prefix}ENCRYPTION`] || '').toLowerCase(),
    surveyMatches: (process.env[`${prefix}SURVEY_MATCH`] || '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  };
};

const getDefaultSender = (): EmailSenderConfig | null => {
  const from = getEnv('EMAIL_FROM', 'MAIL_FROM_ADDRESS');
  const user = getEnv('EMAIL_USER', 'MAIL_USERNAME');
  const pass = getEnv('EMAIL_APP_PASSWORD', 'MAIL_PASSWORD');
  if (!from || !user || !pass) return null;

  return {
    id: 'default',
    label: process.env.MAIL_SENDER_DEFAULT_LABEL || from,
    from,
    user,
    pass: pass.replace(/\s/g, ''),
    host: getEnv('EMAIL_HOST', 'MAIL_HOST'),
    port: Number(getEnv('EMAIL_PORT', 'MAIL_PORT') || 587),
    encryption: (getEnv('EMAIL_ENCRYPTION', 'MAIL_ENCRYPTION') || '').toLowerCase(),
    surveyMatches: (process.env.MAIL_SENDER_DEFAULT_SURVEY_MATCH || '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  };
};

export const getConfiguredEmailSenders = () => {
  const senderIds = (process.env.MAIL_SENDER_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const configured = senderIds
    .map(buildSenderConfig)
    .filter((sender): sender is EmailSenderConfig => Boolean(sender));
  const defaultSender = getDefaultSender();

  return configured.length ? configured : defaultSender ? [defaultSender] : [];
};

export const getEmailSender = (senderId?: string) => {
  const senders = getConfiguredEmailSenders();
  if (senders.length === 0) {
    throw new Error('Konfigurasi sender email belum diset.');
  }

  if (!senderId) {
    throw new Error('Sender email wajib dipilih.');
  }

  const sender = senders.find((item) => item.id === senderId);
  if (!sender) {
    throw new Error('Sender email tidak ditemukan.');
  }
  return sender;
};

export const getPublicEmailSenders = () => (
  getConfiguredEmailSenders().map((sender) => ({
    id: sender.id,
    label: sender.label,
    email: sender.from,
  }))
);

export const getSenderIdForCampaign = (campaignId: string, campaignText = '') => {
  const normalized = `${campaignId} ${campaignText}`.toLowerCase();
  if (normalized.includes('infrastruktur')) return 'sekretariat';
  if (normalized.includes('ekosistem')) return 'dirjen';
  return process.env.MAIL_DEFAULT_SENDER_ID?.trim() || 'sekretariat';
};

export const getEmailSenderForCampaign = (campaignId: string, campaignText = '') => (
  getEmailSender(getSenderIdForCampaign(campaignId, campaignText))
);

export const getPublicEmailSenderForCampaign = (campaignId: string, campaignText = '') => {
  const sender = getEmailSenderForCampaign(campaignId, campaignText);
  return {
    id: sender.id,
    label: sender.label,
    email: sender.from,
  };
};
