'use client';

import { useEffect, useMemo, useState } from 'react';
import { withBasePath } from '../services';
import {
  getSurveySummary,
  loadSurveyRecords,
  SurveyRecord,
} from './report-core';
import { AdminFooter, AdminHeader } from './admin-chrome';

type BlastPerson = {
  id: string;
  name: string;
  email: string;
  serviceTypes: string[];
};

type BlastHistory = {
  personName: string;
  email: string;
  serviceType: string;
  submittedAt?: string | null;
};

const normalizeKey = (value: string) => value.trim().toLowerCase();
const getRespondentKey = (record: SurveyRecord) => (
  record.blastGroupId
  || `${normalizeKey(record.profile.name)}-${normalizeKey(record.profile.directorate)}`
);

export default function AdminPage() {
  const [records, setRecords] = useState<SurveyRecord[]>([]);
  const [people, setPeople] = useState<BlastPerson[]>([]);
  const [history, setHistory] = useState<BlastHistory[]>([]);
  const [availableServices, setAvailableServices] = useState<string[]>([]);
  const [selectedService, setSelectedService] = useState('');
  const [loadMessage, setLoadMessage] = useState('Sinkronisasi data survey...');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadRecords = async () => {
      const localRecords = loadSurveyRecords();
      if (localRecords.length > 0) setRecords(localRecords);

      try {
        const response = await fetch(withBasePath('/api/surveys/'), { cache: 'no-store' });
        const payload = await response.json() as { records?: SurveyRecord[]; error?: string };

        if (!response.ok) {
          throw new Error(payload.error || 'Gagal mengambil data survey dari server.');
        }

        setRecords(payload.records ?? []);
        setLoadMessage('Data diambil dari Supabase.');
      } catch (error) {
        setRecords(localRecords);
        setLoadMessage(error instanceof Error ? error.message : 'Menampilkan data lokal browser.');
      } finally {
        setIsLoading(false);
      }
    };

    loadRecords();

    const loadTargets = async () => {
      try {
        const [peopleResponse, historyResponse] = await Promise.all([
          fetch(withBasePath('/api/blast/people'), { cache: 'no-store' }),
          fetch(withBasePath('/api/blast/history'), { cache: 'no-store' }),
        ]);
        const peoplePayload = await peopleResponse.json() as { people?: BlastPerson[] };
        const historyPayload = await historyResponse.json() as { records?: BlastHistory[] };
        if (peopleResponse.ok) setPeople(peoplePayload.people ?? []);
        if (historyResponse.ok) setHistory(historyPayload.records ?? []);
      } catch {
        setPeople([]);
        setHistory([]);
      }
    };

    loadTargets();

    const loadServices = async () => {
      try {
        const response = await fetch(withBasePath('/api/services/?admin=1'), { cache: 'no-store' });
        const payload = await response.json() as { services?: Array<{ name: string }> };
        const names = payload.services?.map((service) => service.name).filter(Boolean);
        if (names) setAvailableServices(names);
      } catch {
        setAvailableServices([]);
      }
    };

    loadServices();
  }, []);

  const servicePopulationCounts = useMemo(() => people.reduce<Record<string, number>>((acc, person) => {
    person.serviceTypes.forEach((service) => {
      acc[service] = (acc[service] ?? 0) + 1;
    });
    return acc;
  }, {}), [people]);
  const activeServiceRecords = useMemo(
    () => records.filter((record) => availableServices.includes(record.profile.serviceType)),
    [availableServices, records],
  );
  const summary = useMemo(
    () => getSurveySummary(activeServiceRecords, availableServices, servicePopulationCounts),
    [activeServiceRecords, availableServices, servicePopulationCounts],
  );
  const completedServiceCount = useMemo(
    () => summary.serviceSummary.filter((row) => row.percent >= 100).length,
    [summary.serviceSummary],
  );
  const completedServicePercent = availableServices.length > 0
    ? Math.round((completedServiceCount / availableServices.length) * 100)
    : 0;
  const completedRespondentCount = useMemo(
    () => new Set(activeServiceRecords.map(getRespondentKey)).size,
    [activeServiceRecords],
  );
  const completedRespondentPercent = people.length > 0
    ? Math.round((completedRespondentCount / people.length) * 100)
    : 0;
  const serviceRanking = useMemo(() => (
    [...summary.serviceSummary].sort((left, right) => (
      right.percent - left.percent
      || right.responded - left.responded
      || left.name.localeCompare(right.name)
    ))
  ), [summary.serviceSummary]);
  const selectedServiceRows = useMemo(() => {
    if (!selectedService) return [];

    const submittedEmails = new Set(history
      .filter((row) => row.serviceType === selectedService && row.submittedAt)
      .map((row) => normalizeKey(row.email)));
    const submittedNames = new Set([
      ...history
        .filter((row) => row.serviceType === selectedService && row.submittedAt)
        .map((row) => normalizeKey(row.personName)),
      ...activeServiceRecords
        .filter((record) => record.profile.serviceType === selectedService)
        .map((record) => normalizeKey(record.profile.name)),
    ]);
    const targetPeople = people.filter((person) => person.serviceTypes.includes(selectedService));

    if (targetPeople.length > 0) {
      return targetPeople.map((person) => {
        const submitted = submittedEmails.has(normalizeKey(person.email)) || submittedNames.has(normalizeKey(person.name));
        return {
          id: person.id,
          name: person.name,
          email: person.email,
          status: submitted ? 'Sudah isi' : 'Belum isi',
        };
      });
    }

    return activeServiceRecords
      .filter((record) => record.profile.serviceType === selectedService)
      .map((record) => ({
        id: record.id,
        name: record.profile.name,
        email: '-',
        status: 'Sudah isi',
      }));
  }, [activeServiceRecords, history, people, selectedService]);

  const downloadSummaryExcel = async () => {
    const { downloadAdminSummaryExcel } = await import('./report-utils');
    await downloadAdminSummaryExcel(activeServiceRecords, availableServices, servicePopulationCounts);
  };

  const downloadSummaryPDF = async () => {
    const { downloadAdminSummaryPDF } = await import('./report-utils');
    await downloadAdminSummaryPDF(activeServiceRecords, availableServices, servicePopulationCounts);
  };

  const downloadFulfillmentRankingPDF = async () => {
    const { downloadSurveyFulfillmentRankingPDF } = await import('./report-utils');
    await downloadSurveyFulfillmentRankingPDF(
      activeServiceRecords,
      availableServices,
      servicePopulationCounts,
      people.length,
    );
  };

  const downloadSelectedServiceRowsExcel = async () => {
    if (!selectedService || selectedServiceRows.length === 0) return;

    const { default: writeXlsxFile } = await import('write-excel-file/browser');
    const rows = selectedServiceRows.map((row, index) => ({
      nomor: index + 1,
      nama: row.name,
      email: row.email || '-',
      status: row.status,
    }));
    const columns = [
      { header: 'No.', width: 8, cell: (row: typeof rows[number]) => ({ value: row.nomor }) },
      { header: 'Nama', width: 28, cell: (row: typeof rows[number]) => ({ value: row.nama }) },
      { header: 'Email', width: 34, cell: (row: typeof rows[number]) => ({ value: row.email }) },
      { header: 'Status', width: 18, cell: (row: typeof rows[number]) => ({ value: row.status }) },
    ];
    const serviceName = selectedService
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);

    await writeXlsxFile(rows, { columns }).toFile(`monitoring-pengisian-${serviceName}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <main className="page-shell admin-shell">
      <AdminHeader
        eyebrow="Admin Monitoring"
        title="Monitoring"
        currentPath="/admin"
        actions={[
          { href: '/control', label: 'Kelola Survey', secondary: true },
          { href: '/admin', label: 'Monitoring' },
          { href: '/monitoring', label: 'Hasil Survey' },
          { href: '/blasting', label: 'Blasting' },
          { href: '/list', label: 'List Layanan' },
          { href: '/work-units', label: 'Satuan Kerja' },
        ]}
      />
      {loadMessage && <p className={`admin-data-message ${isLoading ? 'is-loading' : ''}`}>{loadMessage}</p>}

      <section className="dashboard-grid compact-dashboard-grid">
        <div className={`summary-card ${isLoading ? 'loading-card' : ''}`}>
          <h2>Total Responden</h2>
          <p>{people.length}</p>
        </div>
        <div className={`summary-card ${isLoading ? 'loading-card' : ''}`}>
          <h2>Total Layanan</h2>
          <p>{availableServices.length}</p>
        </div>
        <div className={`summary-card wide-card ${isLoading ? 'loading-card' : ''}`}>
          <h2>Progress Keseluruhan</h2>
          <div className="gauge-row">
            <div className="gauge-card compact-gauge-card">
              <div className="gauge-ring compact-gauge-ring" style={{ '--pct': summary.overallPercent } as any}>
                <div className="gauge-center compact-gauge-center"></div>
              </div>
              <div className="gauge-label">
                <small>Target</small>
                <span>{summary.overallPercent}%</span>
                <p>{summary.overallResponded}/{summary.overallTarget}</p>
              </div>
            </div>
            <div className="gauge-card compact-gauge-card">
              <div className="gauge-ring compact-gauge-ring" style={{ '--pct': completedServicePercent } as any}>
                <div className="gauge-center compact-gauge-center"></div>
              </div>
              <div className="gauge-label">
                <small>Layanan</small>
                <span>{completedServicePercent}%</span>
                <p>{completedServiceCount}/{availableServices.length}</p>
              </div>
            </div>
            <div className="gauge-card compact-gauge-card">
              <div className="gauge-ring compact-gauge-ring" style={{ '--pct': completedRespondentPercent } as any}>
                <div className="gauge-center compact-gauge-center"></div>
              </div>
              <div className="gauge-label">
                <small>Responden</small>
                <span>{completedRespondentPercent}%</span>
                <p>{completedRespondentCount}/{people.length}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="table-card">
        <div className="section-heading-row">
          <h2>Ranking Pemenuhan Survey</h2>
          <div className="inline-actions">
            <button
              type="button"
              className="download-button"
              onClick={() => { void downloadFulfillmentRankingPDF(); }}
            >
              Download PDF
            </button>
          </div>
        </div>
        <div className="admin-scroll-panel">
          <div className="ranking-bar-list">
            {serviceRanking.map((row) => (
              <div className="ranking-bar-row" key={`rank-${row.name}`}>
                <span>{row.name}</span>
                <div className="ranking-bar-track">
                  <div className="ranking-bar-fill" style={{ width: `${Math.min(100, row.percent)}%` }} />
                </div>
                <strong>{row.percent}%</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="table-card">
        <div className="section-heading-row">
          <h2>Summary Survey Pengisian Layanan Sekretariat</h2>
          <div className="inline-actions">
            <button
              type="button"
              className="download-button"
              onClick={() => { void downloadSummaryExcel(); }}
            >
              Download Excel
            </button>
            <button
              type="button"
              className="download-button"
              onClick={() => { void downloadSummaryPDF(); }}
            >
              Download PDF
            </button>
          </div>
        </div>
        <div className="service-summary-table-wrapper admin-scroll-panel">
          <table className="service-summary-table">
            <thead>
              <tr>
                <th>Nama Layanan</th>
                <th>Jumlah Responden</th>
                <th>Target</th>
                <th>Respon</th>
                <th>GAP</th>
                <th>Persentase</th>
              </tr>
            </thead>
            <tbody>
              {summary.serviceSummary.map((row) => (
                <tr key={row.name} className={selectedService === row.name ? 'selected-summary-row' : ''}>
                  <td>
                    <button
                      type="button"
                      className="service-summary-button"
                      onClick={() => setSelectedService((current) => (current === row.name ? '' : row.name))}
                    >
                      {row.name}
                    </button>
                  </td>
                  <td>{row.population}</td>
                  <td>{row.target}</td>
                  <td>{row.responded}</td>
                  <td>{row.gap}</td>
                  <td>{row.percent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selectedService && (
        <section className="table-card">
          <div className="section-heading-row">
            <div>
              <h2>Monitoring Pengisian Layanan</h2>
              <span>{selectedService}</span>
            </div>
            <div className="inline-actions">
              <button
                type="button"
                className="download-button compact-download-button"
                onClick={() => { void downloadSelectedServiceRowsExcel(); }}
                disabled={selectedServiceRows.length === 0}
              >
                Download Excel
              </button>
              <button type="button" className="text-button" onClick={() => setSelectedService('')}>
                Tutup
              </button>
            </div>
          </div>
          <div className="service-summary-table-wrapper limited-table-scroll">
            <table className="service-summary-table">
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>Email</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {selectedServiceRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>{row.email || '-'}</td>
                    <td>
                      <span className={`status-pill ${row.status === 'Sudah isi' ? 'done-pill' : 'pending-pill'}`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {selectedServiceRows.length === 0 && (
                  <tr>
                    <td colSpan={3}>Belum ada target user atau response untuk layanan ini.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="table-card">
        <h2>Respon Terakhir</h2>
        {records.length === 0 ? (
          <p>Tidak ada data survei tersimpan.</p>
        ) : (
          <div className="record-list limited-list-scroll">
            {records.map((record) => (
              <div key={record.id} className="record-item">
                <div className="record-header">
                  <div>
                    <strong>{record.profile.name || 'Tanpa Nama'}</strong>
                    <small>{record.profile.directorate || 'Satuan kerja belum dipilih'}</small>
                  </div>
                  <time>{new Date(record.createdAt).toLocaleString('id-ID')}</time>
                </div>
                <div className="record-meta">
                  <span>{record.profile.serviceType || 'Layanan belum dipilih'}</span>
                </div>
                <p>{record.comments || 'Tidak ada catatan.'}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <AdminFooter />
    </main>
  );
}
