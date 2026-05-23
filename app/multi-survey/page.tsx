'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  antiCorruptionOptions,
  antiCorruptionQuestions,
  directorates,
  serviceOptions,
  serviceQuestions,
} from '../survey-form';
import { withBasePath } from '../services';

type GroupRecord = {
  id: string;
  blastGroupId: string;
  personName: string;
  whatsapp: string;
  email: string;
  serviceType: string;
  surveyLink: string;
  submittedAt?: string | null;
};

type SurveyProfile = {
  name: string;
  directorate: string;
  serviceType: string;
};

type SurveyRecord = {
  id: string;
  createdAt: string;
  profile: SurveyProfile;
  responses: Record<string, string>;
  comments: string;
  blastId?: string;
  blastGroupId?: string;
};

const createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const MULTI_SURVEY_DRAFT_PREFIX = 'genesis-multi-survey-draft';

type MultiSurveyDraft = {
  profile: {
    name: string;
    directorate: string;
  };
  responses: Record<string, Record<string, string>>;
  comments: Record<string, string>;
};

const getDraftKey = (blastGroupId: string) => `${MULTI_SURVEY_DRAFT_PREFIX}:${blastGroupId}`;

const loadDraft = (key: string): MultiSurveyDraft | null => {
  if (typeof window === 'undefined' || !key) return null;
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? JSON.parse(stored) as MultiSurveyDraft : null;
  } catch {
    return null;
  }
};

const saveDraft = (key: string, draft: MultiSurveyDraft) => {
  if (typeof window === 'undefined' || !key) return;
  window.localStorage.setItem(key, JSON.stringify(draft));
};

const clearDraft = (key: string) => {
  if (typeof window === 'undefined' || !key) return;
  window.localStorage.removeItem(key);
};

const readErrorResponse = async (response: Response) => {
  const text = await response.text();
  if (!text) return `Survey gagal disimpan ke server. Status ${response.status}.`;

  try {
    const payload = JSON.parse(text) as { error?: string };
    return payload.error || `Survey gagal disimpan ke server. Status ${response.status}.`;
  } catch {
    return `Survey gagal disimpan ke server. Status ${response.status}: ${text.slice(0, 220)}`;
  }
};

export default function MultiSurveyPage() {
  const [records, setRecords] = useState<GroupRecord[]>([]);
  const [profile, setProfile] = useState({ name: '', directorate: '' });
  const [responses, setResponses] = useState<Record<string, Record<string, string>>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('Memuat daftar layanan...');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isDraftReady, setIsDraftReady] = useState(false);
  const allowNavigationRef = useRef(false);
  const draftKeyRef = useRef('');
  const pendingRecords = records.filter((record) => !record.submittedAt);

  useEffect(() => {
    const loadGroup = async () => {
      try {
        const response = await fetch(withBasePath('/api/blast/group'), { cache: 'no-store' });
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
    saveDraft(draftKeyRef.current, {
      profile,
      responses,
      comments,
    });
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage('');

    try {
      await Promise.all(pendingRecords.map(async (record) => {
        const survey: SurveyRecord = {
          id: createId(),
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

        if (!response.ok) throw new Error(await readErrorResponse(response));
      }));

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
          <img className="brand-image" src="https://genetikasolusibisnis.co.id/wp-content/uploads/2022/09/genetika-1-warna.png" alt="Genesis logo" />
          <div>
            <p className="agency">Biro Hubungan Masyarakat</p>
          </div>
        </div>
        <div className="title-block">
          <h1>Survei Kepuasan Layanan &amp; Persepsi Anti Korupsi</h1>
          <p>TAHUN 2026</p>
        </div>
      </div>

      <form className="survey-grid" onSubmit={handleSubmit}>
        <section className="panel guidance-panel">
          <div className="panel-title">PEDOMAN</div>
          <div className="panel-content">
            <p>Anda menerima tautan survei untuk beberapa layanan. Lengkapi profil satu kali, lalu isi penilaian untuk setiap layanan yang tampil di halaman ini.</p>
            <h2>Tata Cara Pengisian Survei:</h2>
            <ol>
              <li>Pastikan nama layanan pada setiap bagian sudah sesuai dengan layanan yang pernah Anda terima.</li>
              <li>Lengkapi profil satu kali pada panel ini.</li>
              <li>Isi seluruh pertanyaan pada setiap layanan yang tampil.</li>
              <li>Klik <strong>[Submit]</strong> setelah seluruh layanan selesai dinilai.</li>
              <li>Jangka waktu pengisian survei adalah 1 Juni 2026 s.d. 30 Juni 2026.</li>
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
              Direktorat
              <select
                value={profile.directorate}
                onChange={(event) => setProfile((current) => ({ ...current, directorate: event.target.value }))}
                required
              >
                <option value="">Pilih Salah Satu</option>
                {directorates.map((item) => (
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
                    <>
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
                    </>
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
                    <>
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
                    </>
                  ))}
                </div>
              </div>

              <div className="comment-section">
                <label>
                  Kritik, saran, atau masukan untuk layanan ini
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

          <button className="submit-button" type="submit" disabled={isSubmitting || pendingRecords.length === 0}>
            {pendingRecords.length === 0 ? 'SURVEI SUDAH DISUBMIT' : isSubmitting ? 'MENYIMPAN...' : 'SUBMIT'}
          </button>
          {message && (
            <p className={submitted ? 'success-message' : 'error-message'}>{message}</p>
          )}
        </section>
      </form>
    </main>
  );
}
