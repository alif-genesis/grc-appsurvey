export type SurveyProfile = {
  name: string;
  directorate: string;
  serviceType: string;
};

export type SurveyRecord = {
  id: string;
  createdAt: string;
  profile: SurveyProfile;
  responses: Record<string, string>;
  comments: string;
  campaignId?: string;
  blastId?: string;
  blastGroupId?: string;
  destination?: {
    channel: 'Email' | 'WhatsApp';
    target: string;
  };
};

export const SURVEY_STORAGE_KEY = 'genesis-survey-records';

export const createClientId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const loadJsonStorage = <T,>(key: string, fallback: T): T => {
  if (typeof window === 'undefined' || !key) return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? JSON.parse(stored) as T : fallback;
  } catch {
    return fallback;
  }
};

export const saveJsonStorage = <T,>(key: string, value: T) => {
  if (typeof window === 'undefined' || !key) return;
  window.localStorage.setItem(key, JSON.stringify(value));
};

export const removeStorageItem = (key: string) => {
  if (typeof window === 'undefined' || !key) return;
  window.localStorage.removeItem(key);
};

export const loadSurveyRecords = () => loadJsonStorage<SurveyRecord[]>(SURVEY_STORAGE_KEY, []);

export const saveSurveyRecord = (survey: SurveyRecord) => {
  saveJsonStorage(SURVEY_STORAGE_KEY, [survey, ...loadSurveyRecords()]);
};

export const readErrorResponse = async (response: Response, fallback = 'Survey gagal disimpan ke server.') => {
  const text = await response.text();
  if (!text) return `${fallback} Status ${response.status}.`;

  try {
    const payload = JSON.parse(text) as { error?: string };
    return payload.error || `${fallback} Status ${response.status}.`;
  } catch {
    return `${fallback} Status ${response.status}: ${text.slice(0, 220)}`;
  }
};

export const getServiceCommentPrompt = (serviceType?: string) => {
  const serviceName = serviceType?.trim().replace(/^layanan\s+/i, '');
  const basePrompt = 'Kritik, saran, atau masukan (dapat meliputi Standar Operasional Pelayanan, SDM Pelayanan, Transparansi & Kepastian, serta Sarana Pendukung)';
  if (!serviceName) {
    return `${basePrompt} dapat disampaikan melalui kolom di bawah ini`;
  }

  return `${basePrompt} untuk layanan ${serviceName} dapat disampaikan melalui kolom di bawah ini`;
};

type ValidationInput = {
  profile: Pick<SurveyProfile, 'name' | 'directorate'> & Partial<Pick<SurveyProfile, 'serviceType'>>;
  responses: Record<string, string>;
  comments: string;
  serviceQuestions: string[];
  antiCorruptionQuestions: string[];
  serviceLabel?: string;
  requireServiceType?: boolean;
};

export const getSurveyValidationMessage = ({
  profile,
  responses,
  comments,
  serviceQuestions,
  antiCorruptionQuestions,
  serviceLabel,
  requireServiceType = true,
}: ValidationInput) => {
  const suffix = serviceLabel ? ` untuk ${serviceLabel}` : '';

  if (!profile.name.trim()) return 'Anda belum mengisikan nama lengkap.';
  if (!profile.directorate.trim()) return 'Anda belum memilih satuan kerja.';
  if (requireServiceType && !profile.serviceType?.trim()) {
    return 'Jenis layanan belum terisi. Silakan buka link layanan yang sesuai.';
  }

  const unansweredService = serviceQuestions.findIndex((_, index) => !responses[`service-${index + 1}`]);
  if (unansweredService >= 0) {
    return `Anda belum menyelesaikan seluruh pertanyaan Kepuasan Layanan${suffix}. Pertanyaan nomor ${unansweredService + 1} belum dijawab.`;
  }

  const unansweredAnti = antiCorruptionQuestions.findIndex((_, index) => !responses[`anti-${index + 1}`]);
  if (unansweredAnti >= 0) {
    return `Anda belum menyelesaikan seluruh pertanyaan Persepsi Anti Korupsi${suffix}. Pertanyaan nomor ${unansweredAnti + 1} belum dijawab.`;
  }

  if (!comments.trim()) return `Anda belum mengisikan kritik, saran, atau masukan${suffix}.`;
  return '';
};
