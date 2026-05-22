'use client';

import { FormEvent, useEffect, useState } from 'react';
import { getServiceFromPath, withBasePath } from './services';

type SurveyRecord = {
  id: string;
  createdAt: string;
  profile: {
    name: string;
    directorate: string;
    serviceType: string;
  };
  responses: Record<string, string>;
  comments: string;
};

const SURVEY_STORAGE_KEY = 'genesis-survey-records';

const loadSurveyRecords = (): SurveyRecord[] => {
  if (typeof window === 'undefined') return [];
  try {
    const stored = window.localStorage.getItem(SURVEY_STORAGE_KEY);
    return stored ? JSON.parse(stored) as SurveyRecord[] : [];
  } catch {
    return [];
  }
};

const saveSurveyRecord = (survey: SurveyRecord) => {
  if (typeof window === 'undefined') return;
  const records = loadSurveyRecords();
  window.localStorage.setItem(SURVEY_STORAGE_KEY, JSON.stringify([survey, ...records]));
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

const serviceQuestions = [
  'Bagaimana penilaian Anda tentang kesesuaian persyaratan pelayanan yang diberikan?',
  'Bagaimana penilaian Anda tentang kemudahan mekanisme dan prosedur pada saat pelayanan diberikan?',
  'Bagaimana penilaian Anda tentang kesesuaian jangka waktu penyelesaian pelayanan?',
  'Bagaimana penilaian Anda terhadap layanan gratis yang Anda terima?',
  'Bagaimana penilaian Anda tentang kesesuaian produk/jasa pelayanan yang diberikan sesuai dengan ketentuan?',
  'Bagaimana penilaian Anda mengenai kemampuan petugas pelayanan? (Jika layanan daring, bagaimana penilaian Anda terhadap kecepatan respon petugas layanan?)',
  'Bagaimana penilaian Anda tentang keramahan dan kesopanan petugas pelayanan? (Jika layanan daring, bagaimana pendapat Anda tentang kesopanan dan keramahan petugas dalam memberikan jawaban melalui media digital?)',
  'Bagaimana penilaian Anda terhadap petugas dalam menindaklanjuti penyelesaian keluhan terhadap pelayanan?',
  'Bagaimana penilaian Anda terhadap kualitas sarana dan prasarana pelayanan di unit? (Jika layanan daring, bagaimana penilaian Anda tentang kemudahan penggunaan aplikasinya?)',
];

const antiCorruptionQuestions = [
  'Tidak ada diskriminasi pelayanan pada unit layanan ini',
  'Tidak ada pelayanan diluar prosedur/kecurangan pelayanan pada unit layanan ini',
  'Tidak ada penerimaan imbalan uang/barang/fasilitas diluar ketentuan yang berlaku pada unit layanan ini',
  'Tidak ada pungutan liar (pungli) pada unit layanan ini',
  'Tidak ada percaloan/perantara tidak resmi pada unit layanan ini',
];

const serviceOptions = ['Sangat Tidak Puas', 'Tidak Puas', 'Puas', 'Sangat Puas'];
const antiCorruptionOptions = ['Sangat Tidak Setuju', 'Tidak Setuju', 'Setuju', 'Sangat Setuju'];

const directorates = [
  'Pengembangan Ekosistem Digital',
  'Kecerdasan Artifisial dan Teknologi Baru',
  'Pos dan Penyiaran',
  'Layanan Ekosistem Digital',
  'Pengendalian Ekosistem Digital',
];

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

  useEffect(() => {
    const serviceType = getServiceFromPath(window.location.pathname);
    setProfile((current) => ({ ...current, serviceType }));
  }, []);

  const handleProfileChange = (field: keyof typeof profile, value: string) => {
    setProfile((current) => ({ ...current, [field]: value }));
  };

  const handleResponseChange = (questionKey: string, answer: string) => {
    setResponses((current) => ({ ...current, [questionKey]: answer }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmitMessage('');

    const survey: SurveyRecord = {
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      profile,
      responses,
      comments,
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
      setSubmitMessage('Terima kasih! Survei Anda telah tersimpan.');
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
      setSubmitMessage(`${message} Data sementara tersimpan di browser ini, tapi belum masuk dashboard admin.`);
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
      <div className="admin-link-row">
        <a className="admin-link" href={withBasePath('/admin')}>Masuk Admin Dashboard</a>
      </div>

      <form className="survey-grid" onSubmit={handleSubmit}>
        <section className="panel guidance-panel">
          <div className="panel-title">PEDOMAN</div>
          <div className="panel-content">
            <p>Survei Kepuasan Layanan akan menghasilkan Indeks Kepuasan Layanan Dukungan Manajemen yang merupakan Target Kinerja Pejabat Pimpinan Tinggi di Lingkungan Sekretariat Jenderal dan Kementerian.</p>
            <h2>Tata Cara Pengisian Survei:</h2>
            <ol>
              <li>Responden dapat mengisi survei lebih dari satu layanan yang diterima pada Mei 2025 s.d. April 2026.</li>
              <li>Apabila responden ingin mengisi survei lebih dari satu, maka responden dapat mengisi sampai dengan klik <strong>[Simpan Survei]</strong>, lalu memilih layanan lainnya yang akan disurvei.</li>
              <li>Jangka waktu pengisian survei adalah 19 Mei 2026 s.d. 30 Juni 2026.</li>
            </ol>
            <p className="note">Catatan: Responden wajib mengisi survei secara objektif. Partisipasi Anda dalam survei ini sangat berharga bagi kami.</p>
          </div>

          <div className="panel-title">PROFIL</div>
          <div className="profile-fields">
            <label>
              Nama / Inisial
              <input
                value={profile.name}
                onChange={(e) => handleProfileChange('name', e.target.value)}
                placeholder="Nama / Inisial"
                required
              />
            </label>
            <label>
              Direktorat
              <select
                value={profile.directorate}
                onChange={(e) => handleProfileChange('directorate', e.target.value)}
                required
              >
                <option value="">Pilih Salah Satu</option>
                {directorates.map((item) => (
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
                <>
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
                </>
              ))}
            </div>
          </div>

          <div className="comment-section">
            <label>
              Apabila terdapat kritik, saran, atau masukan dapat disampaikan melalui kolom di bawah ini
              <textarea value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Tulis masukan Anda..." />
            </label>
          </div>

          <button className="submit-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'MENYIMPAN...' : 'SIMPAN SURVEI'}
          </button>
          {submitMessage && (
            <p className={submitted ? 'success-message' : 'error-message'}>{submitMessage}</p>
          )}
        </section>
      </form>
    </main>
  );
}
