'use client';

import { FormEvent, Fragment, useEffect, useRef, useState } from 'react';
import {
  antiCorruptionOptions,
  antiCorruptionQuestions,
  defaultWorkUnits,
  serviceOptions,
  serviceQuestions,
} from '../survey-constants';
import { KOMDIGI_LOGO_URL, withBasePath } from '../services';
import {
  createClientId,
  getServiceCommentPrompt,
  getSurveyValidationMessage,
  loadJsonStorage,
  readErrorResponse,
  removeStorageItem,
  saveJsonStorage,
  type SurveyProfile,
  type SurveyRecord,
} from '../survey-utils';

type GroupRecord = {
  id: string;
  blastGroupId: string;
  personName: string;
  email: string;
  serviceType: string;
  surveyLink: string;
  submittedAt?: string | null;
};

const MULTI_SURVEY_DRAFT_PREFIX = 'genesis-multi-survey-draft';

type MultiSurveyDraft = {
  profile: {
    name: string;
    directorate: string;
  };
  responses: Record<string, Record<string, string>>;
  comments: Record<string, string>;
};

type SurveyContext = {
  id: string;
  name: string;
  description: string;
  senderLabel?: string;
  senderEmail?: string;
};

const getSurveyPeriodText = (context: SurveyContext) => {
  const normalizedSender = `${context.senderLabel || ''} ${context.senderEmail || ''}`.toLowerCase();
  if (normalizedSender.includes('sekretariat djid') || normalizedSender.includes('tusesdjid@mail.komdigi.go.id')) {
    return '09 Juni 2026 s.d. 30 Juni 2026';
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

const getDraftKey = (blastGroupId: string) => `${MULTI_SURVEY_DRAFT_PREFIX}:${blastGroupId}`;

const loadDraft = (key: string) => loadJsonStorage<MultiSurveyDraft | null>(key, null);
const saveDraft = (key: string, draft: MultiSurveyDraft) => saveJsonStorage(key, draft);
const clearDraft = (key: string) => removeStorageItem(key);

const getCookieValue = (name: string) => {
  if (typeof document === 'undefined') return '';
  const value = document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.split('=')[1];
  return value ? decodeURIComponent(value) : '';
};

const withBlastGroupParam = (path: string, blastGroupId: string) => {
  if (!blastGroupId) return path;
  return `${path}${path.includes('?') ? '&' : '?'}blastGroupId=${encodeURIComponent(blastGroupId)}`;
};

const getInitialBlastGroupId = () => {
  if (typeof window === 'undefined') return '';
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const hashBlastGroupId = hashParams.get('blastGroupId')?.trim() || '';
  if (hashBlastGroupId) {
    hashParams.delete('blastGroupId');
    const nextHash = hashParams.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${nextHash ? `#${nextHash}` : ''}`);
  }
  return hashBlastGroupId || getCookieValue('genesis_blast_group_id');
};

export default function MultiSurveyPage() {
  const [records, setRecords] = useState<GroupRecord[]>([]);
  const [profile, setProfile] = useState({ name: '', directorate: '' });
  const [responses, setResponses] = useState<Record<string, Record<string, string>>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [workUnits, setWorkUnits] = useState<string[]>(defaultWorkUnits);
  const [surveyContext, setSurveyContext] = useState<SurveyContext>({
    id: '',
    name: '',
    description: '',
  });
  const [message, setMessage] = useState('Memuat daftar layanan...');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isDraftReady, setIsDraftReady] = useState(false);
  const allowNavigationRef = useRef(false);
  const draftKeyRef = useRef('');
  const blastGroupIdRef = useRef('');
  const pendingRecords = records.filter((record) => !record.submittedAt);
  const surveyPeriodText = getSurveyPeriodText(surveyContext);

  useEffect(() => {
    const initialBlastGroupId = getInitialBlastGroupId();
    blastGroupIdRef.current = initialBlastGroupId;

    const loadWorkUnits = async (blastGroupId: string) => {
      try {
        const response = await fetch(withBasePath(withBlastGroupParam('/api/work-units/', blastGroupId)), { cache: 'no-store' });
        const payload = await response.json() as { workUnits?: Array<{ name: string }> };
        const names = payload.workUnits?.map((workUnit) => workUnit.name).filter(Boolean) ?? defaultWorkUnits;
        setWorkUnits(names.length ? names : defaultWorkUnits);
      } catch {
        setWorkUnits(defaultWorkUnits);
      }
    };

    const loadGroup = async () => {
      try {
        const response = await fetch(withBasePath(withBlastGroupParam('/api/blast/group', initialBlastGroupId)), { cache: 'no-store' });
        const payload = await response.json() as { records?: GroupRecord[]; error?: string };

        if (!response.ok) throw new Error(payload.error || 'Gagal mengambil daftar layanan.');

        const groupRecords = payload.records ?? [];
        const blastGroupId = groupRecords[0]?.blastGroupId ?? '';
        const draftKey = blastGroupId ? getDraftKey(blastGroupId) : '';
        const draft = loadDraft(draftKey);
        draftKeyRef.current = draftKey;
        setRecords(groupRecords);
        setProfile((current) => ({
          ...current,
          name: draft?.profile.name ?? groupRecords[0]?.personName ?? '',
          directorate: draft?.profile.directorate ?? current.directorate,
        }));
        if (draft) {
          setResponses(draft.responses ?? {});
          setComments(draft.comments ?? {});
        }
        setSubmitted(groupRecords.length > 0 && groupRecords.every((record) => record.submittedAt));
        if (groupRecords.length > 0 && groupRecords.every((record) => record.submittedAt)) {
          allowNavigationRef.current = true;
          window.location.assign(withBasePath('/submitted'));
          return;
        }
        setMessage(groupRecords.length === 0 ? 'Tidak ada layanan untuk link ini.' : '');
        setIsDraftReady(true);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Gagal mengambil daftar layanan.');
        setIsDraftReady(true);
      }
    };

    const loadSurveyContext = async (blastGroupId: string) => {
      try {
        const response = await fetch(withBasePath(withBlastGroupParam('/api/survey-context/', blastGroupId)), { cache: 'no-store' });
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

    loadWorkUnits(initialBlastGroupId);
    loadSurveyContext(initialBlastGroupId);
    loadGroup();
  }, []);

  useEffect(() => {
    const hasStartedSurvey = Boolean(
      profile.name.trim()
      || profile.directorate.trim()
      || Object.keys(responses).length > 0
      || Object.values(comments).some((comment) => comment.trim()),
    );

    if (!hasStartedSurvey || submitted) return undefined;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (allowNavigationRef.current) return undefined;
      event.preventDefault();
      event.returnValue = 'Anda belum menyelesaikan survey. Anda yakin ingin menutup halaman ini?';
      return event.returnValue;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [comments, profile.directorate, profile.name, responses, submitted]);

  useEffect(() => {
    if (!isDraftReady || !draftKeyRef.current || submitted) return;
    const timer = window.setTimeout(() => {
      saveDraft(draftKeyRef.current, {
        profile,
        responses,
        comments,
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [comments, isDraftReady, profile, responses, submitted]);

  const updateResponse = (recordId: string, questionKey: string, answer: string) => {
    setResponses((current) => ({
      ...current,
      [recordId]: {
        ...(current[recordId] ?? {}),
        [questionKey]: answer,
      },
    }));
  };

  const updateComment = (recordId: string, value: string) => {
    setComments((current) => ({ ...current, [recordId]: value }));
  };

  const getValidationMessage = () => {
    if (pendingRecords.length === 0) return '';

    for (const record of pendingRecords) {
      const message = getSurveyValidationMessage({
        profile,
        responses: responses[record.id] ?? {},
        comments: comments[record.id] ?? '',
        serviceQuestions,
        antiCorruptionQuestions,
        serviceLabel: record.serviceType,
        requireServiceType: false,
      });
      if (message) return message;
    }

    return '';
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const validationMessage = getValidationMessage();
    if (validationMessage) {
      setSubmitted(false);
      setMessage(validationMessage);
      return;
    }

    setIsSubmitting(true);
    setMessage('');

    try {
      for (const record of pendingRecords) {
        const survey: SurveyRecord = {
          id: createClientId(),
          createdAt: new Date().toISOString(),
          profile: {
            name: profile.name,
            directorate: profile.directorate,
            serviceType: record.serviceType,
          },
          responses: responses[record.id] ?? {},
          comments: comments[record.id] ?? '',
          blastId: record.id,
          blastGroupId: record.blastGroupId,
        };

        const response = await fetch(withBasePath('/api/surveys'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(survey),
        });

        if (!response.ok) {
          const message = await readErrorResponse(response);
          if (!message.includes('sudah pernah disubmit')) {
            throw new Error(message);
          }
        }
      }

      setSubmitted(true);
      clearDraft(draftKeyRef.current);
      allowNavigationRef.current = true;
      window.location.assign(withBasePath('/submitted'));
      setResponses({});
      setComments({});
    } catch (error) {
      setSubmitted(false);
      setMessage(error instanceof Error ? error.message : 'Survey gagal disimpan.');
    } finally {
      setIsSubmitting(false);
    }
  };

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
                onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))}
                placeholder="Nama Lengkap"
                required
              />
            </label>
            <label>
              Satuan Kerja
              <select
                value={profile.directorate}
                onChange={(event) => setProfile((current) => ({ ...current, directorate: event.target.value }))}
                required
              >
                <option value="">Pilih Salah Satu</option>
                {workUnits.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="panel survey-panel">
          {pendingRecords.map((record, recordIndex) => (
            <div key={record.id} className="multi-service-block">
              <div className="multi-service-heading">
                <span>Layanan {recordIndex + 1}</span>
                <h2>{record.serviceType}</h2>
              </div>

              <div className="survey-section">
                <h2 className="section-title">SURVEI KEPUASAN LAYANAN</h2>
                <div className="table-grid">
                  <div className="table-header empty-cell">PERTANYAAN</div>
                  {serviceOptions.map((option) => (
                    <div key={option} className="table-header">{option}</div>
                  ))}

                  {serviceQuestions.map((question, index) => (
                    <Fragment key={`service-question-${record.id}-${index}`}>
                      <div key={`label-${record.id}-${index}`} className="table-cell question-cell">
                        <span className="question-number">{index + 1}</span>
                        {question}
                      </div>
                      {serviceOptions.map((option) => {
                        const key = `service-${index + 1}`;
                        return (
                          <label key={`${record.id}-${key}-${option}`} className="radio-cell">
                            <input
                              type="radio"
                              name={`${record.id}-${key}`}
                              value={option}
                              checked={responses[record.id]?.[key] === option}
                              onChange={() => updateResponse(record.id, key, option)}
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
                    <Fragment key={`anti-question-${record.id}-${index}`}>
                      <div key={`anti-${record.id}-${index}`} className="table-cell question-cell">
                        <span className="question-number">{index + 1}</span>
                        {question}
                      </div>
                      {antiCorruptionOptions.map((option) => {
                        const key = `anti-${index + 1}`;
                        return (
                          <label key={`${record.id}-${key}-${option}`} className="radio-cell">
                            <input
                              type="radio"
                              name={`${record.id}-${key}`}
                              value={option}
                              checked={responses[record.id]?.[key] === option}
                              onChange={() => updateResponse(record.id, key, option)}
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
                  {getServiceCommentPrompt(record.serviceType)}
                  <textarea
                    value={comments[record.id] ?? ''}
                    onChange={(event) => updateComment(record.id, event.target.value)}
                    placeholder="Tulis masukan Anda..."
                    required
                  />
                </label>
              </div>
            </div>
          ))}

          {message && (
            <p className={submitted ? 'success-message' : 'error-message validation-message'}>{message}</p>
          )}
          <button className="submit-button" type="submit" disabled={isSubmitting || pendingRecords.length === 0}>
            {pendingRecords.length === 0 ? 'SURVEI SUDAH DISUBMIT' : isSubmitting ? 'MENYIMPAN...' : 'SUBMIT'}
          </button>
        </section>
      </form>
    </main>
  );
}
