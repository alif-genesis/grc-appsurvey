'use client';

import { useEffect, useMemo, useState } from 'react';
import { serviceTypes, withBasePath } from '../services';
import {
  downloadAdminSummaryExcel,
  downloadAdminSummaryPDF,
  getSurveySummary,
  loadSurveyRecords,
  SurveyRecord,
} from './report-utils';
import { AdminFooter, AdminHeader } from './admin-chrome';

export default function AdminPage() {
  const [records, setRecords] = useState<SurveyRecord[]>([]);
  const [availableServices, setAvailableServices] = useState(serviceTypes);
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

    const loadServices = async () => {
      try {
        const response = await fetch(withBasePath('/api/services/'), { cache: 'no-store' });
        const payload = await response.json() as { services?: Array<{ name: string }> };
        const names = payload.services?.map((service) => service.name).filter(Boolean);
        if (names?.length) setAvailableServices(names);
      } catch {
        setAvailableServices(serviceTypes);
      }
    };

    loadServices();
  }, []);

  const summary = useMemo(() => getSurveySummary(records, availableServices), [availableServices, records]);

  return (
    <main className="page-shell admin-shell">
      <AdminHeader
        eyebrow="Admin Dashboard"
        title="Data Survei"
        currentPath="/admin"
        actions={[
          { href: '/admin', label: 'Dashboard' },
          { href: '/monitoring', label: 'Monitoring' },
          { href: '/blasting', label: 'Blasting' },
          { href: '/list', label: 'List Layanan' },
        ]}
      />
      {loadMessage && <p className={`admin-data-message ${isLoading ? 'is-loading' : ''}`}>{loadMessage}</p>}

      <section className="dashboard-grid">
        <div className={`summary-card ${isLoading ? 'loading-card' : ''}`}>
          <h2>Total Survei</h2>
          <p>{summary.totalSurveys}</p>
        </div>
        <div className={`summary-card ${isLoading ? 'loading-card' : ''}`}>
          <h2>Responden Unik</h2>
          <p>{summary.uniqueRespondents}</p>
        </div>
        <div className={`summary-card wide-card ${isLoading ? 'loading-card' : ''}`}>
          <h2>Progress Keseluruhan</h2>
          <div className="gauge-card">
            <div className="gauge-ring" style={{ '--pct': summary.overallPercent } as any}>
              <div className="gauge-center"></div>
            </div>
            <div className="gauge-label">
              <span>{summary.overallPercent}%</span>
              <p>{summary.overallResponded}/{summary.overallTarget}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="chart-grid admin-chart-grid">
        <div className="chart-card">
          <h2>Persentase Pemenuhan Target</h2>
          <div className="bar-chart-grid">
            {summary.serviceSummary.map((row) => (
              <div key={row.name} className="bar-row">
                <span>{row.name}</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${Math.min(100, row.percent)}%` }} />
                </div>
                <strong>{row.percent}%</strong>
              </div>
            ))}
          </div>
        </div>
        <div className="chart-card small-chart-card">
          <h2>Target vs Isi</h2>
          <div className="metric-block">
            <div>
              <span>Total Target</span>
              <strong>{summary.overallTarget}</strong>
            </div>
            <div>
              <span>Total Respon</span>
              <strong>{summary.overallResponded}</strong>
            </div>
            <div>
              <span>Rata-rata Persen</span>
              <strong>{summary.overallPercent}%</strong>
            </div>
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
              onClick={() => downloadAdminSummaryExcel(records, availableServices)}
            >
              Download Excel
            </button>
            <button
              type="button"
              className="download-button"
              onClick={() => downloadAdminSummaryPDF(records, availableServices)}
            >
              Download PDF
            </button>
          </div>
        </div>
        <div className="service-summary-table-wrapper">
          <table className="service-summary-table">
            <thead>
              <tr>
                <th>Nama Layanan</th>
                <th>Target</th>
                <th>Respon</th>
                <th>GAP</th>
                <th>Persentase</th>
              </tr>
            </thead>
            <tbody>
              {summary.serviceSummary.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
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

      <AdminFooter />
    </main>
  );
}
