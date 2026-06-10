'use client';

import { FormEvent, Fragment, useEffect, useRef, useState } from 'react';
import { findServiceFromPath, getServiceFromPath, KOMDIGI_LOGO_URL, serviceTypes, SURVEY_QUERY_PARAM, withBasePath } from './services';
import {
  antiCorruptionOptions,
  antiCorruptionQuestions,
  defaultWorkUnits,
  serviceOptions,
  serviceQuestions,
} from './survey-constants';
import {
  getServiceCommentPrompt,
  getSurveyValidationMessage,
  loadJsonStorage,
  readErrorResponse,
  removeStorageItem,
  saveJsonStorage,
  saveSurveyRecord,
  type SurveyRecord,
} from './survey-utils';

const SURVEY_DRAFT_PREFIX = 'genesis-survey-draft';

type SurveyDraft = {
  profile: {
    name: string;
    directorate: string;
    serviceType: string;
  };
  responses: Record<string, string>;
  comments: string;
};

type SurveyContext = {
  id: string;
  name: string;
  description: string;
  senderLabel?: string;
  senderEmail?: string;
};

type BlastContext = {
  blastId: string;
  blastGroupId: string;
};

const getSurveyPeriodText = (context: SurveyContext) => {
  const normalizedSender = `${context.senderLabel || ''} ${context.senderEmail || ''}`.toLowerCase();
  if (normalizedSender.includes('sekretariat djid') || normalizedSender.includes('tusesdjid@mail.komdigi.go.id')) {
    return '09 Juni 2026 s.d. 30 Juni 2026';
  }
  if (normalizedSender.includes('tu.dirjen_djed@mail.komdigi.go.id')) {
    return '02 Juni 2026 s.d. 30 Juni 2026';
  }

  const normalizedContext = `${context.id} ${context.name} ${context.description}`.toLowerCase();
  return normalizedContext.includes('infrastruktur digital')
    ? '09 Juni 2026 s.d. 30 Juni 2026'
    : '02 Juni 2026 s.d. 30 Juni 2026';
};

const getSurveyDisplayName = (context: SurveyContext) => {
  const normalizedSender = `${context.senderLabel || ''} ${context.senderEmail || ''}`.toLowerCase();
  if (normalizedSender.includes('sekretariat djid') || normalizedSender.includes('tusesdjid@mail.komdigi.go.id')) {
    return 'Direktorat Jenderal Infrastruktur Digital';
  }
  return context.name || 'Memuat survey...';
};

const getCookieValue = (name: string) => {
  if (typeof document === 'undefined') return '';
  const value = document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.split('=')[1];
  return value ? decodeURIComponent(value) : '';
};

const getInitialBlastContext = (): BlastContext => {
  if (typeof window === 'undefined') return { blastId: '', blastGroupId: '' };
  const params = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const hashBlastId = hashParams.get('blastId')?.trim() || '';
  const hashBlastGroupId = hashParams.get('blastGroupId')?.trim() || '';
  const paramsBlastId = params.get('blastId')?.trim() || '';
  if (paramsBlastId || hashBlastId || hashBlastGroupId) {
    params.delete('blastId');
    hashParams.delete('blastId');
    hashParams.delete('blastGroupId');
    const nextSearch = params.toString();
    const nextHash = hashParams.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${nextHash ? `#${nextHash}` : ''}`);
  }

  return {
    blastId: paramsBlastId || hashBlastId || getCookieValue('genesis_blast_id'),
    blastGroupId: paramsBlastId || hashBlastId ? '' : hashBlastGroupId || getCookieValue('genesis_blast_group_id'),
  };
};

const getDraftKey = (blastContext: BlastContext) => {
  if (typeof window === 'undefined') return '';
  const campaignId = getCampaignIdFromUrl();
  const pathKey = window.location.pathname.replace(/^\/+|\/+$/g, '') || 'home';
  return `${SURVEY_DRAFT_PREFIX}:${campaignId || 'default'}:${blastContext.blastId || blastContext.blastGroupId || pathKey}`;
};

const loadSurveyDraft = (key: string) => loadJsonStorage<SurveyDraft | null>(key, null);
const saveSurveyDraft = (key: string, draft: SurveyDraft) => saveJsonStorage(key, draft);
const clearSurveyDraft = (key: string) => removeStorageItem(key);

const getCampaignIdFromUrl = () => {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get(SURVEY_QUERY_PARAM)?.trim() || '';
};

const isPreviewMode = () => {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('preview') === '1';
};

const hasBlastContext = (blastContext: BlastContext) => Boolean(blastContext.blastId || blastContext.blastGroupId);

const hasSubmitContext = (blastContext: BlastContext) => !isPreviewMode() && (hasBlastContext(blastContext) || Boolean(getCampaignIdFromUrl()));

const withBlastParams = (path: string, blastContext: BlastContext) => {
  const params = new URLSearchParams();
  if (blastContext.blastId) params.set('blastId', blastContext.blastId);
  if (blastContext.blastGroupId) params.set('blastGroupId', blastContext.blastGroupId);
  const query = params.toString();
  return query ? `${path}${path.includes('?') ? '&' : '?'}${query}` : path;
};

const withSurveyContextParams = (path: string, campaignId: string, blastContext: BlastContext) => {
  const params = new URLSearchParams();
  if (campaignId) params.set(SURVEY_QUERY_PARAM, campaignId);
  if (blastContext.blastId) params.set('blastId', blastContext.blastId);
  if (blastContext.blastGroupId) params.set('blastGroupId', blastContext.blastGroupId);
  const query = params.toString();
  return query ? `${path}${path.includes('?') ? '&' : '?'}${query}` : path;
};

export default function HomePage() {
  const [profile, setProfile] = useState({
    name: '',
    directorate: '',
    serviceType: '',
  });

  const [responses, setResponses] = useState<Record<string, string>>({});
  const [comments, setComments] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasExistingSubmission, setHasExistingSubmission] = useState(false);
  const [hasSubmissionContext, setHasSubmissionContext] = useState(false);
  const [workUnits, setWorkUnits] = useState<string[]>(defaultWorkUnits);
  const [surveyContext, setSurveyContext] = useState<SurveyContext>({
    id: '',
    name: '',
    description: '',
  });
  const [isDraftReady, setIsDraftReady] = useState(false);
  const allowNavigationRef = useRef(false);
  const draftKeyRef = useRef('');
  const blastContextRef = useRef<BlastContext>({ blastId: '', blastGroupId: '' });

  useEffect(() => {
    const blastContext = getInitialBlastContext();
    blastContextRef.current = blastContext;
    setHasSubmissionContext(hasSubmitContext(blastContext));
    const fallbackServiceType = getServiceFromPath(window.location.pathname);
    const draftKey = getDraftKey(blastContext);
    const draft = loadSurveyDraft(draftKey);
    draftKeyRef.current = draftKey;
    setProfile((current) => ({
      ...current,
      ...(draft?.profile ?? {}),
      serviceType: fallbackServiceType,
    }));
    if (draft) {
      setResponses(draft.responses ?? {});
      setComments(draft.comments ?? '');
    }
    setIsDraftReady(true);

    const checkSubmission = async () => {
      try {
        const response = await fetch(withBasePath(withBlastParams('/api/blast/status', blastContext)), { cache: 'no-store' });
        const payload = await response.json() as { submitted?: boolean; error?: string };

        if (response.ok && payload.submitted) {
          setHasExistingSubmission(true);
          setSubmitted(true);
          allowNavigationRef.current = true;
          window.location.assign(withBasePath('/submitted'));
        }
      } catch {
        // Status check is a convenience guard; submit API still prevents duplicates.
      }
    };

    const resolveService = async () => {
      try {
        const campaignId = getCampaignIdFromUrl();
        const servicesPath = withSurveyContextParams('/api/services/', campaignId, blastContext);
        const response = await fetch(withBasePath(servicesPath), { cache: 'no-store' });
        const payload = await response.json() as { services?: Array<{ name: string }> };
        const availableServices = payload.services?.map((service) => service.name).filter(Boolean) ?? serviceTypes;
        const serviceType = findServiceFromPath(window.location.pathname, availableServices) || fallbackServiceType;
        setProfile((current) => ({ ...current, serviceType }));
      } catch {
        setProfile((current) => ({ ...current, serviceType: fallbackServiceType }));
      }
    };

    const loadWorkUnits = async () => {
      try {
        const campaignId = getCampaignIdFromUrl();
        const workUnitsPath = withSurveyContextParams('/api/work-units/', campaignId, blastContext);
        const response = await fetch(withBasePath(workUnitsPath), { cache: 'no-store' });
        const payload = await response.json() as { workUnits?: Array<{ name: string }> };
        const names = payload.workUnits?.map((workUnit) => workUnit.name).filter(Boolean) ?? defaultWorkUnits;
        setWorkUnits(names.length ? names : defaultWorkUnits);
      } catch {
        setWorkUnits(defaultWorkUnits);
      }
    };

    const loadSurveyContext = async () => {
      try {
        const campaignId = getCampaignIdFromUrl();
        const contextPath = withSurveyContextParams('/api/survey-context/', campaignId, blastContext);
        const response = await fetch(withBasePath(contextPath), { cache: 'no-store' });
        const payload = await response.json() as { campaign?: SurveyContext };
        if (payload.campaign?.name) setSurveyContext(payload.campaign);
      } catch {
        setSurveyContext((current) => current.name ? current : {
          id: '',
          name: 'Survey Kepuasan Layanan',
          description: '',
        });
      }
    };

    if (hasBlastContext(blastContext)) checkSubmission();
    if (!fallbackServiceType) resolveService();
    loadWorkUnits();
    loadSurveyContext();
  }, []);

  useEffect(() => {
    if (!isDraftReady || !draftKeyRef.current || submitted || hasExistingSubmission) return;
    const timer = window.setTimeout(() => {
      saveSurveyDraft(draftKeyRef.current, {
        profile,
        responses,
        comments,
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [comments, hasExistingSubmission, isDraftReady, profile, responses, submitted]);

  useEffect(() => {
    const hasStartedSurvey = Boolean(
      profile.name.trim()
      || profile.directorate.trim()
      || Object.keys(responses).length > 0
      || comments.trim(),
    );

    if (!hasStartedSurvey || submitted || hasExistingSubmission) return undefined;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (allowNavigationRef.current) return undefined;
      event.preventDefault();
      event.returnValue = 'Anda belum menyelesaikan survey. Anda yakin ingin menutup halaman ini?';
      return event.returnValue;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [comments, hasExistingSubmission, profile.directorate, profile.name, responses, submitted]);

  const handleProfileChange = (field: keyof typeof profile, value: string) => {
    setProfile((current) => ({ ...current, [field]: value }));
  };

  const handleResponseChange = (questionKey: string, answer: string) => {
    setResponses((current) => ({ ...current, [questionKey]: answer }));
  };

  const getValidationMessage = () => {
    return getSurveyValidationMessage({
      profile,
      responses,
      comments,
      serviceQuestions,
      antiCorruptionQuestions,
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (hasExistingSubmission) return;
    if (!hasSubmissionContext) {
      setSubmitted(false);
      setSubmitMessage('Tombol submit hanya aktif untuk link survei resmi dari blast.');
      return;
    }

    const validationMessage = getValidationMessage();
    if (validationMessage) {
      setSubmitted(false);
      setSubmitMessage(validationMessage);
      return;
    }

    setIsSubmitting(true);
    setSubmitMessage('');

    const survey: SurveyRecord = {
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      profile,
      responses,
      comments,
      campaignId: getCampaignIdFromUrl() || undefined,
      blastId: blastContextRef.current.blastId || undefined,
      blastGroupId: blastContextRef.current.blastGroupId || undefined,
    };

    try {
      const response = await fetch(withBasePath('/api/surveys'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(survey),
      });
      if (!response.ok) {
        throw new Error(await readErrorResponse(response));
      }

      saveSurveyRecord(survey);
      setSubmitted(true);
      setHasExistingSubmission(true);
      clearSurveyDraft(draftKeyRef.current);
      allowNavigationRef.current = true;
      window.location.assign(withBasePath('/submitted'));
      setResponses({});
      setComments('');
      setProfile({
        name: '',
        directorate: '',
        serviceType: getServiceFromPath(window.location.pathname),
      });
    } catch (error) {
      saveSurveyRecord(survey);
      setSubmitted(false);
      const message = error instanceof Error ? error.message : 'Survey gagal disimpan ke server.';
      if (message.includes('sudah pernah disubmit')) {
        setSubmitted(true);
        setHasExistingSubmission(true);
        clearSurveyDraft(draftKeyRef.current);
        allowNavigationRef.current = true;
        window.location.assign(withBasePath('/submitted'));
      } else {
        setSubmitMessage(`${message} Data sementara tersimpan di browser ini, tapi belum masuk dashboard admin.`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const surveyPeriodText = getSurveyPeriodText(surveyContext);

  return (
    <main className="page-shell">
      <div className="survey-header">
        <div className="brand-row">
          <img className="brand-image" src={KOMDIGI_LOGO_URL} alt="Logo Komdigi" width={180} height={80} decoding="async" />
          <div>
            <p className="agency">{getSurveyDisplayName(surveyContext)}</p>
          </div>
        </div>
        <div className="title-block">
          <h1>Survei Kepuasan Layanan &amp; Persepsi Anti Korupsi</h1>
          <p>TAHUN 2026</p>
        </div>
      </div>

      <form className="survey-grid" onSubmit={handleSubmit} noValidate>
        <section className="panel guidance-panel">
          <div className="panel-title">PEDOMAN</div>
          <div className="panel-content">
            <h2>Tata Cara Pengisian Survei:</h2>
            <ol>
              <li>Lengkapi Profil (Nama Lengkap, Asal Satker).</li>
              <li>Survei terdiri atas dua survei; survei kepuasan layanan dan survei persepsi anti korupsi.</li>
              <li>Seluruh kolom pada survei bersifat required (wajib diisi).</li>
              <li>Berikan penilaian pada seluruh pertanyaan, lalu klik <strong>[Submit]</strong>.</li>
              <li>Jangka waktu pengisian survei adalah {surveyPeriodText}.</li>
            </ol>
          </div>

          <div className="panel-title">PROFIL</div>
          <div className="profile-fields">
            <label>
              Nama Lengkap
              <input
                value={profile.name}
                onChange={(e) => handleProfileChange('name', e.target.value)}
                placeholder="Nama Lengkap"
                required
              />
            </label>
            <label>
              Satuan Kerja
              <select
                value={profile.directorate}
                onChange={(e) => handleProfileChange('directorate', e.target.value)}
                required
              >
                <option value="">Pilih Salah Satu</option>
                {workUnits.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Jenis Layanan
              <input
                value={profile.serviceType}
                readOnly
                placeholder="Jenis layanan otomatis mengikuti link"
                className="readonly-input"
                required
              />
            </label>
          </div>
        </section>

        <section className="panel survey-panel">
          <div className="survey-section">
            <h2 className="section-title">SURVEI KEPUASAN LAYANAN</h2>
            <div className="table-grid">
              <div className="table-header empty-cell">PERTANYAAN</div>
              {serviceOptions.map((option) => (
                <div key={option} className="table-header">{option}</div>
              ))}

              {serviceQuestions.map((question, index) => (
                <Fragment key={`service-question-${index}`}>
                  <div key={`label-${index}`} className="table-cell question-cell">
                    <span className="question-number">{index + 1}</span>
                    {question}
                  </div>
                  {serviceOptions.map((option) => {
                    const key = `service-${index + 1}`;
                    return (
                      <label key={`${key}-${option}`} className="radio-cell">
                        <input
                          type="radio"
                          name={key}
                          value={option}
                          checked={responses[key] === option}
                          onChange={() => handleResponseChange(key, option)}
                          required
                        />
                        <span className="radio-custom" />
                        <span className="radio-label-text">{option}</span>
                      </label>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>

          <div className="survey-section anti-section">
            <h2 className="section-title">SURVEI PERSEPSI ANTI KORUPSI</h2>
            <div className="table-grid compact-grid">
              <div className="table-header empty-cell">PERTANYAAN</div>
              {antiCorruptionOptions.map((option) => (
                <div key={option} className="table-header">{option}</div>
              ))}

              {antiCorruptionQuestions.map((question, index) => (
                <Fragment key={`anti-question-${index}`}>
                  <div key={`anticell-${index}`} className="table-cell question-cell">
                    <span className="question-number">{index + 1}</span>
                    {question}
                  </div>
                  {antiCorruptionOptions.map((option) => {
                    const key = `anti-${index + 1}`;
                    return (
                      <label key={`${key}-${option}`} className="radio-cell">
                        <input
                          type="radio"
                          name={key}
                          value={option}
                          checked={responses[key] === option}
                          onChange={() => handleResponseChange(key, option)}
                          required
                        />
                        <span className="radio-custom" />
                        <span className="radio-label-text">{option}</span>
                      </label>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>

          <div className="comment-section">
            <label>
              {getServiceCommentPrompt(profile.serviceType)}
              <textarea value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Tulis masukan Anda..." required />
            </label>
          </div>

          {submitMessage && (
            <p className={submitted ? 'success-message' : 'error-message validation-message'}>{submitMessage}</p>
          )}
          {!hasSubmissionContext && (
            <p className="error-message validation-message">Halaman ini hanya untuk preview. Submit aktif dari link survei resmi dari blast.</p>
          )}
          <button className="submit-button" type="submit" disabled={isSubmitting || hasExistingSubmission || !hasSubmissionContext}>
            {!hasSubmissionContext ? 'PREVIEW SAJA' : hasExistingSubmission ? 'SURVEI SUDAH DISUBMIT' : isSubmitting ? 'MENYIMPAN...' : 'SUBMIT'}
          </button>
        </section>
      </form>
    </main>
  );
}
