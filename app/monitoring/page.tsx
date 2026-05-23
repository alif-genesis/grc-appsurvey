'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  antiCorruptionQuestions,
  serviceQuestions,
} from '../survey-form';
import { serviceTypes, withBasePath } from '../services';
import {
  answerToScale,
  downloadMonitoringExcel,
  downloadMonitoringPDF,
  downloadSkmExcel,
  downloadSkmPDF,
  getServiceQuality,
  getSkmCalculation,
  loadSurveyRecords,
  SurveyRecord,
} from '../admin/report-utils';
import { AdminFooter, AdminHeader } from '../admin/admin-chrome';

const average = (values: number[]) => {
  if (values.length === 0) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
};

const getRecordAverage = (record: SurveyRecord, prefix: 'service' | 'anti') => {
  const questions = prefix === 'service' ? serviceQuestions : antiCorruptionQuestions;
  const values = questions
    .map((_, index) => answerToScale(record.responses[`${prefix}-${index + 1}`] ?? ''))
    .filter((value): value is number => typeof value === 'number');
  return average(values);
};

export default function MonitoringPage() {
  const [records, setRecords] = useState<SurveyRecord[]>([]);
  const [loadMessage, setLoadMessage] = useState('Sinkronisasi data response...');
  const [isLoading, setIsLoading] = useState(true);
  const [availableServices, setAvailableServices] = useState(serviceTypes);
  const [selectedService, setSelectedService] = useState(serviceTypes[0] ?? '');

  useEffect(() => {
    const loadRecords = async () => {
      const localRecords = loadSurveyRecords();
      if (localRecords.length > 0) setRecords(localRecords);

      try {
        const response = await fetch(withBasePath('/api/surveys/'), { cache: 'no-store' });
        const payload = await response.json() as { records?: SurveyRecord[]; error?: string };

        if (!response.ok) throw new Error(payload.error || 'Gagal mengambil data survey dari server.');

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
        const response = await fetch(withBasePath('/api/services/'), { cache: 'no-store' });
        const payload = await response.json() as { services?: Array<{ name: string }> };
        const names = payload.services?.map((service) => service.name).filter(Boolean);
        if (names?.length) {
          setAvailableServices(names);
          setSelectedService((current) => (names.includes(current) ? current : names[0]));
        }
      } catch {
        setAvailableServices(serviceTypes);
      }
    };

    loadServices();
  }, []);

  const serviceAverage = useMemo(
    () => average(records.map((record) => getRecordAverage(record, 'service')).filter(Boolean)),
    [records],
  );
  const antiAverage = useMemo(
    () => average(records.map((record) => getRecordAverage(record, 'anti')).filter(Boolean)),
    [records],
  );
  const skmCalculation = useMemo(
    () => getSkmCalculation(records, selectedService),
    [records, selectedService],
  );

  return (
    <main className="page-shell admin-shell">
      <AdminHeader
        eyebrow="Admin Monitoring"
        title="Monitoring Response"
        currentPath="/monitoring"
        actions={[
          { href: '/admin', label: 'Dashboard' },
          { href: '/monitoring', label: 'Monitoring' },
          { href: '/blasting', label: 'Blasting' },
          { href: '/list', label: 'List Layanan' },
        ]}
      />

      {loadMessage && <p className={`admin-data-message ${isLoading ? 'is-loading' : ''}`}>{loadMessage}</p>}

      <section className="chart-grid admin-chart-grid">
        <div className={`chart-card ${isLoading ? 'loading-card' : ''}`}>
          <h2>Grafik Rata-rata Inputan User</h2>
          <div className="bar-chart-grid">
            {[
              { label: 'Kepuasan Layanan', value: serviceAverage },
              { label: 'Persepsi Anti Korupsi', value: antiAverage },
            ].map((row) => (
              <div key={row.label} className="bar-row">
                <span>{row.label}</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${Math.min(100, (row.value / 4) * 100)}%` }} />
                </div>
                <strong>{row.value || '-'} / 4</strong>
              </div>
            ))}
          </div>
        </div>
        <div className={`chart-card small-chart-card ${isLoading ? 'loading-card' : ''}`}>
          <h2>Total Response</h2>
          <div className="metric-block">
            <div>
              <span>Semua Response</span>
              <strong>{records.length}</strong>
            </div>
            <div>
              <span>Responden Unik</span>
              <strong>{new Set(records.map((record) => `${record.profile.name}-${record.profile.directorate}`)).size}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="table-card">
        <div className="section-heading-row">
          <h2>Detail Response Seluruh Responden</h2>
          <div className="inline-actions">
            <button type="button" className="download-button" onClick={() => downloadMonitoringExcel(records)}>
              Download Excel
            </button>
            <button type="button" className="download-button" onClick={() => downloadMonitoringPDF(records)}>
              Download PDF
            </button>
          </div>
        </div>
        {records.length === 0 ? (
          <p>Tidak ada data survei tersimpan.</p>
        ) : (
          <div className="monitoring-table-wrapper">
            <table className="service-summary-table monitoring-table">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Nama Lengkap</th>
                  <th>Direktorat</th>
                  <th>Jenis Layanan</th>
                  {serviceQuestions.map((_, index) => (
                    <th key={`service-head-${index}`}>Kepuasan {index + 1}</th>
                  ))}
                  {antiCorruptionQuestions.map((_, index) => (
                    <th key={`anti-head-${index}`}>Anti Korupsi {index + 1}</th>
                  ))}
                  <th>Kritik/Saran</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td>{new Date(record.createdAt).toLocaleString('id-ID')}</td>
                    <td>{record.profile.name || '-'}</td>
                    <td>{record.profile.directorate || '-'}</td>
                    <td>{record.profile.serviceType || '-'}</td>
                    {serviceQuestions.map((_, index) => {
                      const answer = record.responses[`service-${index + 1}`] ?? '';
                      return (
                        <td key={`service-${record.id}-${index}`}>
                          {answer || '-'}
                          <span className="scale-pill">Skala {answerToScale(answer) || '-'}</span>
                        </td>
                      );
                    })}
                    {antiCorruptionQuestions.map((_, index) => {
                      const answer = record.responses[`anti-${index + 1}`] ?? '';
                      return (
                        <td key={`anti-${record.id}-${index}`}>
                          {answer || '-'}
                          <span className="scale-pill">Skala {answerToScale(answer) || '-'}</span>
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

      <section className="table-card">
        <div className="section-heading-row">
          <h2>Perhitungan SKM Per Layanan</h2>
          <div className="inline-actions">
            <button type="button" className="download-button" onClick={() => downloadSkmExcel(skmCalculation)}>
              Download Excel
            </button>
            <button type="button" className="download-button" onClick={() => downloadSkmPDF(skmCalculation)}>
              Download Report
            </button>
          </div>
        </div>

        <div className="filter-row single-filter-row">
          <label>
            Pilih Layanan
            <select value={selectedService} onChange={(event) => setSelectedService(event.target.value)}>
              {availableServices.map((service) => (
                <option key={service} value={service}>{service}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="skm-score-grid">
          <div className="skm-score-card">
            <span>SKM Unit Pelayanan</span>
            <small>{getServiceQuality(skmCalculation.serviceSkm100)}</small>
            <div className="skm-score-value">
              <strong>{skmCalculation.serviceSkm100 || '-'}</strong>
              <em>Skala 4: {skmCalculation.serviceSkm4 || '-'}</em>
            </div>
          </div>
          <div className="skm-score-card">
            <span>Indeks Persepsi Anti Korupsi</span>
            <small>{getServiceQuality(skmCalculation.antiSkm100)}</small>
            <div className="skm-score-value">
              <strong>{skmCalculation.antiSkm100 || '-'}</strong>
              <em>Skala 4: {skmCalculation.antiSkm4 || '-'}</em>
            </div>
          </div>
        </div>

        {skmCalculation.records.length === 0 ? (
          <p>Belum ada response untuk layanan ini.</p>
        ) : (
          <div className="skm-table-wrapper">
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
                        {answerToScale(record.responses[`service-${questionIndex + 1}`] ?? '') || '-'}
                      </td>
                    ))}
                    <td>{index + 1}</td>
                    {skmCalculation.antiResults.map((_, questionIndex) => (
                      <td key={`skm-anti-${record.id}-${questionIndex}`}>
                        {answerToScale(record.responses[`anti-${questionIndex + 1}`] ?? '') || '-'}
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
        <h2>Respon Terakhir</h2>
        {records.length === 0 ? (
          <p>Tidak ada data survei tersimpan.</p>
        ) : (
          <div className="record-list">
            {records.slice(0, 5).map((record) => (
              <div key={record.id} className="record-item">
                <div className="record-header">
                  <strong>{record.profile.name || 'Tanpa Nama'}</strong>
                  <span>{new Date(record.createdAt).toLocaleString('id-ID')}</span>
                </div>
                <p><strong>Layanan:</strong> {record.profile.serviceType || 'Belum dipilih'}</p>
                <p><strong>Direktorat:</strong> {record.profile.directorate || 'Belum dipilih'}</p>
                <p><strong>Catatan:</strong> {record.comments || '-'}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <AdminFooter />
    </main>
  );
}
