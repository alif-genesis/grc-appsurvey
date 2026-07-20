'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  antiCorruptionQuestions,
  serviceQuestions,
} from '../survey-constants';
import { withBasePath } from '../services';
import {
  answerToScale,
  getServiceQuality,
  getServiceQualityRank,
  getSkmCalculation,
  loadSurveyRecords,
  SurveyRecord,
  type CalculationScale,
} from '../admin/report-core';
import { AdminFooter, AdminHeader } from '../admin/admin-chrome';

const MONITORING_FETCH_TIMEOUT_MS = 8000;

const fetchJson = async <T,>(path: string): Promise<T> => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), MONITORING_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(withBasePath(path), {
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = await response.json() as T & { error?: string };
    if (!response.ok) throw new Error(payload.error || 'Gagal mengambil data.');
    return payload;
  } finally {
    window.clearTimeout(timer);
  }
};

const getQualityClass = (score: number, calculationScale: CalculationScale) => {
  const rank = getServiceQualityRank(score, calculationScale).toLowerCase();
  if (rank) return `quality-${rank}`;
  return 'quality-empty';
};

const formatSkmNumber = (value: number, minimumFractionDigits: number, maximumFractionDigits = minimumFractionDigits) => (
  value > 0
    ? value.toLocaleString('id-ID', { minimumFractionDigits, maximumFractionDigits })
    : '-'
);

export default function MonitoringPage() {
  const [records, setRecords] = useState<SurveyRecord[]>([]);
  const [loadMessage, setLoadMessage] = useState('Sinkronisasi data response...');
  const [isLoading, setIsLoading] = useState(true);
  const [availableServices, setAvailableServices] = useState<string[]>([]);
  const [selectedService, setSelectedService] = useState('');
  const [responseServiceFilter, setResponseServiceFilter] = useState('');
  const [calculationScale, setCalculationScale] = useState<CalculationScale>(4);
  const [downloadMessage, setDownloadMessage] = useState('');

  useEffect(() => {
    const loadRecords = async () => {
      const localRecords = loadSurveyRecords();
      if (localRecords.length > 0) setRecords(localRecords);

      try {
        const payload = await fetchJson<{ records?: SurveyRecord[] }>('/api/surveys/');

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

    const loadServices = async () => {
      try {
        const payload = await fetchJson<{ services?: Array<{ name: string }> }>('/api/services/?admin=1');
        const names = payload.services?.map((service) => service.name).filter(Boolean);
        if (names) {
          setAvailableServices(names);
          setResponseServiceFilter((current) => (current && !names.includes(current) ? '' : current));
          setSelectedService((current) => (current && !names.includes(current) ? '' : current));
        }
      } catch {
        setAvailableServices([]);
      }
    };

    loadServices();
  }, []);

  const activeServiceRecords = useMemo(
    () => records.filter((record) => availableServices.includes(record.profile.serviceType)),
    [availableServices, records],
  );
  const skmCalculation = useMemo(
    () => getSkmCalculation(activeServiceRecords, selectedService, calculationScale),
    [activeServiceRecords, selectedService, calculationScale],
  );
  const serviceFilterOptions = useMemo(
    () => Array.from(new Set(availableServices.filter(Boolean))),
    [availableServices],
  );
  const filteredResponseRecords = useMemo(
    () => activeServiceRecords.filter((record) => !responseServiceFilter || record.profile.serviceType === responseServiceFilter),
    [activeServiceRecords, responseServiceFilter],
  );
  const runDownload = async (download: () => Promise<void>) => {
    setDownloadMessage('Menyiapkan file download...');
    try {
      await download();
      setDownloadMessage('File download sedang diproses browser.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Download gagal diproses.';
      setDownloadMessage(message);
    }
  };

  const downloadCalculationExcel = async () => {
    const { downloadSkmExcel } = await import('../admin/report-utils');
    await downloadSkmExcel(skmCalculation);
  };

  const downloadCalculationPDF = async () => {
    const { downloadSkmPDF } = await import('../admin/report-utils');
    await downloadSkmPDF(skmCalculation);
  };

  const downloadResponseExcel = async () => {
    const { downloadMonitoringExcel } = await import('../admin/report-utils');
    await downloadMonitoringExcel(filteredResponseRecords, calculationScale);
  };

  const downloadResponsePDF = async () => {
    const { downloadMonitoringPDF } = await import('../admin/report-utils');
    await downloadMonitoringPDF(filteredResponseRecords, calculationScale);
  };

  return (
    <main className="page-shell admin-shell">
      <AdminHeader
        eyebrow="Admin Monitoring"
        title="Hasil Survey"
        currentPath="/monitoring"
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
      {downloadMessage && <p className="admin-data-message">{downloadMessage}</p>}

      <section className="calculation-scale-panel">
        <label>
          Perhitungan
          <select
            value={calculationScale}
            onChange={(event) => setCalculationScale(Number(event.target.value) as CalculationScale)}
          >
            <option value={4}>Perhitungan Skala 4</option>
            <option value={5}>Perhitungan Skala 5</option>
          </select>
        </label>
      </section>

      <section className="table-card">
        <div className="section-heading-row">
          <h2>Perhitungan SKM Per Layanan</h2>
          <div className="inline-actions">
            <button type="button" className="download-button" onClick={() => { void runDownload(downloadCalculationExcel); }}>
              Download Excel
            </button>
            <button type="button" className="download-button" onClick={() => { void downloadCalculationPDF(); }}>
              Download Report
            </button>
          </div>
        </div>

        <div className="filter-row single-filter-row">
          <label>
            Pilih Layanan
            <select value={selectedService} onChange={(event) => setSelectedService(event.target.value)}>
              <option value="">Seluruh Layanan</option>
              {serviceFilterOptions.map((service) => (
                <option key={service} value={service}>{service}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="skm-score-grid">
          <div className="skm-score-card">
            <span>SKM Unit Pelayanan</span>
            <small>{getServiceQuality(skmCalculation.serviceSkm100, calculationScale)}</small>
            <div className={`skm-score-value ${getQualityClass(skmCalculation.serviceSkm100, calculationScale)}`}>
              <strong>{formatSkmNumber(skmCalculation.serviceSkm100, 2)}</strong>
              <em>Skala {calculationScale}: {formatSkmNumber(skmCalculation.serviceSkmScale, 3)}</em>
            </div>
          </div>
          <div className="skm-score-card">
            <span>Indeks Persepsi Anti Korupsi</span>
            <small>{getServiceQuality(skmCalculation.antiSkm100, calculationScale)}</small>
            <div className={`skm-score-value ${getQualityClass(skmCalculation.antiSkm100, calculationScale)}`}>
              <strong>{formatSkmNumber(skmCalculation.antiSkm100, 3)}</strong>
              <em>Skala {calculationScale}: {formatSkmNumber(skmCalculation.antiSkmScale, 3)}</em>
            </div>
          </div>
        </div>

        {skmCalculation.records.length === 0 ? (
          <p>Belum ada response untuk layanan ini.</p>
        ) : (
          <div className="skm-table-wrapper limited-table-scroll">
            <table className="service-summary-table skm-table">
              <thead>
                <tr>
                  <th rowSpan={2}>No. Resp</th>
                  <th colSpan={skmCalculation.serviceResults.length}>Nilai Unsur Pelayanan</th>
                  <th rowSpan={2}>No. Resp</th>
                  <th colSpan={skmCalculation.antiResults.length}>Nilai Unsur Persepsi Anti Korupsi</th>
                </tr>
                <tr>
                  {skmCalculation.serviceResults.map((result) => (
                    <th key={`service-result-${result.code}`}>{result.code}</th>
                  ))}
                  {skmCalculation.antiResults.map((result) => (
                    <th key={`anti-result-${result.code}`}>{result.code}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {skmCalculation.records.map((record, index) => (
                  <tr key={record.id}>
                    <td>{index + 1}</td>
                    {skmCalculation.serviceResults.map((_, questionIndex) => (
                      <td key={`skm-service-${record.id}-${questionIndex}`}>
                        {answerToScale(record.responses[`service-${questionIndex + 1}`] ?? '', calculationScale) || '-'}
                      </td>
                    ))}
                    <td>{index + 1}</td>
                    {skmCalculation.antiResults.map((_, questionIndex) => (
                      <td key={`skm-anti-${record.id}-${questionIndex}`}>
                        {answerToScale(record.responses[`anti-${questionIndex + 1}`] ?? '', calculationScale) || '-'}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="calculation-row">
                  <td>Nilai Unsur</td>
                  {skmCalculation.serviceResults.map((result) => <td key={`total-service-${result.code}`}>{result.total}</td>)}
                  <td>Nilai Unsur</td>
                  {skmCalculation.antiResults.map((result) => <td key={`total-anti-${result.code}`}>{result.total}</td>)}
                </tr>
                <tr className="calculation-row">
                  <td>NRR / Unsur</td>
                  {skmCalculation.serviceResults.map((result) => <td key={`nrr-service-${result.code}`}>{result.nrr}</td>)}
                  <td>NRR / Unsur</td>
                  {skmCalculation.antiResults.map((result) => <td key={`nrr-anti-${result.code}`}>{result.nrr}</td>)}
                </tr>
                <tr className="calculation-row">
                  <td>NRR tertimbang / unsur</td>
                  {skmCalculation.serviceResults.map((result) => <td key={`weighted-service-${result.code}`}>{result.weightedNrr}</td>)}
                  <td>NRR tertimbang / unsur</td>
                  {skmCalculation.antiResults.map((result) => <td key={`weighted-anti-${result.code}`}>{result.weightedNrr}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="skm-note-grid">
          <div>
            <h3>Keterangan Unsur Pelayanan</h3>
            {skmCalculation.serviceResults.map((result) => (
              <p key={`note-service-${result.code}`}><strong>{result.code}</strong> - {result.question}</p>
            ))}
          </div>
          <div>
            <h3>Keterangan Unsur Persepsi Anti Korupsi</h3>
            {skmCalculation.antiResults.map((result) => (
              <p key={`note-anti-${result.code}`}><strong>{result.code}</strong> - {result.question}</p>
            ))}
          </div>
        </div>
      </section>

      <section className="table-card">
        <div className="section-heading-row">
          <h2>Detail Response Seluruh Responden</h2>
          <div className="inline-actions">
            <button type="button" className="download-button" onClick={() => { void runDownload(downloadResponseExcel); }}>
              Download Excel
            </button>
            <button type="button" className="download-button" onClick={() => { void downloadResponsePDF(); }}>
              Download PDF
            </button>
          </div>
        </div>
        <div className="filter-row single-filter-row">
          <label>
            Filter Layanan
            <select value={responseServiceFilter} onChange={(event) => setResponseServiceFilter(event.target.value)}>
              <option value="">Seluruh Layanan</option>
              {serviceFilterOptions.map((service) => (
                <option key={service} value={service}>{service}</option>
              ))}
            </select>
          </label>
        </div>
        {filteredResponseRecords.length === 0 ? (
          <p>Tidak ada data survei tersimpan.</p>
        ) : (
          <div className="monitoring-table-wrapper limited-table-scroll">
            <table className="service-summary-table monitoring-table">
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Tanggal</th>
                  <th>Nama Lengkap</th>
                  <th>Tujuan</th>
                  <th>Satuan Kerja</th>
                  <th>Jenis Layanan</th>
                  {serviceQuestions.map((_, index) => (
                    <th key={`service-head-${index}`}>
                      Kepuasan {index + 1}
                      <span className="scale-header-note">Skala {calculationScale}</span>
                    </th>
                  ))}
                  {antiCorruptionQuestions.map((_, index) => (
                    <th key={`anti-head-${index}`}>
                      Anti Korupsi {index + 1}
                      <span className="scale-header-note">Skala {calculationScale}</span>
                    </th>
                  ))}
                  <th>Kritik/Saran</th>
                </tr>
              </thead>
              <tbody>
                {filteredResponseRecords.map((record, index) => (
                  <tr key={record.id}>
                    <td>{index + 1}</td>
                    <td>{new Date(record.createdAt).toLocaleString('id-ID')}</td>
                    <td>{record.profile.name || '-'}</td>
                    <td>
                      {record.destination ? (
                        <div className="response-destination">
                          <span className={`channel-badge ${record.destination.channel === 'WhatsApp' ? 'whatsapp-channel' : 'email-channel'}`}>
                            {record.destination.channel}
                          </span>
                          <span className="history-target">{record.destination.target}</span>
                        </div>
                      ) : '-'}
                    </td>
                    <td>{record.profile.directorate || '-'}</td>
                    <td>{record.profile.serviceType || '-'}</td>
                    {serviceQuestions.map((_, index) => {
                      const answer = record.responses[`service-${index + 1}`] ?? '';
                      return (
                        <td key={`service-${record.id}-${index}`}>
                          {answer || '-'}
                          <span className="scale-value">{answerToScale(answer, calculationScale) || '-'}</span>
                        </td>
                      );
                    })}
                    {antiCorruptionQuestions.map((_, index) => {
                      const answer = record.responses[`anti-${index + 1}`] ?? '';
                      return (
                        <td key={`anti-${record.id}-${index}`}>
                          {answer || '-'}
                          <span className="scale-value">{answerToScale(answer, calculationScale) || '-'}</span>
                        </td>
                      );
                    })}
                    <td>{record.comments || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AdminFooter />
    </main>
  );
}
