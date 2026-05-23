'use client';

import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { serviceTypes, withBasePath } from '../services';

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

const serviceTargets = serviceTypes.map((name) => ({ name, target: 10 }));

const loadSurveyRecords = (): SurveyRecord[] => {
  if (typeof window === 'undefined') return [];
  try {
    const stored = window.localStorage.getItem(SURVEY_STORAGE_KEY);
    return stored ? JSON.parse(stored) as SurveyRecord[] : [];
  } catch {
    return [];
  }
};

export default function AdminPage() {
  const [records, setRecords] = useState<SurveyRecord[]>([]);
  const [loadMessage, setLoadMessage] = useState('Memuat data survey...');

  useEffect(() => {
    const loadRecords = async () => {
      try {
        const response = await fetch(withBasePath('/api/surveys'), { cache: 'no-store' });
        const payload = await response.json() as { records?: SurveyRecord[]; error?: string };

        if (!response.ok) {
          throw new Error(payload.error || 'Gagal mengambil data survey dari server.');
        }

        setRecords(payload.records ?? []);
        setLoadMessage('Data diambil dari Supabase.');
      } catch (error) {
        setRecords(loadSurveyRecords());
        setLoadMessage(error instanceof Error ? error.message : 'Menampilkan data lokal browser.');
      }
    };

    loadRecords();
  }, []);

  const summary = useMemo(() => {
    const actualCounts = records.reduce<Record<string, number>>((acc, record) => {
      const key = record.profile.serviceType;
      if (!key) return acc;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    const serviceSummary = serviceTargets.map((service) => {
      const responded = actualCounts[service.name] ?? 0;
      const gap = service.target - responded;
      const percent = service.target > 0 ? Math.round((responded / service.target) * 100) : 0;
      return {
        ...service,
        responded,
        gap,
        percent,
      };
    });

    const overallTarget = serviceSummary.reduce((sum, row) => sum + row.target, 0);
    const overallResponded = serviceSummary.reduce((sum, row) => sum + row.responded, 0);
    const overallPercent = overallTarget > 0 ? Math.round((overallResponded / overallTarget) * 100) : 0;

    return {
      totalSurveys: records.length,
      uniqueRespondents: new Set(records.map((record) => `${record.profile.name}-${record.profile.directorate}-${record.profile.serviceType}`)).size,
      serviceSummary,
      overallTarget,
      overallResponded,
      overallPercent,
    };
  }, [records]);

  const downloadReport = () => {
    if (records.length === 0) return;

    const rows = records.map((record) => {
      const responseFields = Object.entries(record.responses).reduce<Record<string, string>>((acc, [questionKey, answer]) => {
        if (questionKey.startsWith('service-')) {
          acc[`Kepuasan ${questionKey.replace('service-', '')}`] = answer;
        } else {
          acc[`Anti Korupsi ${questionKey.replace('anti-', '')}`] = answer;
        }
        return acc;
      }, {});

      return {
        Tanggal: new Date(record.createdAt).toLocaleString('id-ID'),
        Nama: record.profile.name,
        Direktorat: record.profile.directorate,
        'Jenis Layanan': record.profile.serviceType,
        Komentar: record.comments,
        ...responseFields,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Survei');
    XLSX.writeFile(workbook, `report-survei-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const downloadPDFReport = () => {
    if (records.length === 0) return;

    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const title = 'AUDIT REPORT';
    const docDate = new Date().toLocaleDateString('id-ID');

    doc.setFontSize(18);
    doc.text(title, 40, 50);
    doc.setFontSize(10);
    doc.text(`Tanggal: ${docDate}`, 40, 70);
    doc.text(`Company: PT GENETIKA SOLUSI BISNIS`, 40, 85);
    doc.text(`Type: Survei Layanan`, 40, 100);
    doc.text(`Mode: GAPS`, 40, 115);
    doc.text(`Status: COMPLETED`, 40, 130);

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(1);
    doc.line(40, 145, 555, 145);

    const body = summary.serviceSummary.map((row, index) => [
      index + 1,
      row.name,
      row.target,
      row.responded,
      row.gap,
      `${row.percent}%`,
    ]);

    (doc as any).autoTable({
      startY: 160,
      head: [['No', 'Nama Layanan', 'Target', 'Respon', 'GAP', 'Persentase']],
      body,
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: '#0f4eb8', textColor: '#ffffff' },
      margin: { left: 40, right: 40 },
    });

    doc.save(`report-survei-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <main className="page-shell admin-shell">
      <div className="survey-header admin-header">
        <div className="brand-block">
          <img className="brand-image" src="https://genetikasolusibisnis.co.id/wp-content/uploads/2022/09/genetika-1-warna.png" alt="Genesis" />
          <div className="admin-brand-text">
            <p className="agency">Admin Dashboard</p>
            <h1>Data Survei</h1>
          </div>
        </div>
      </div>

      <div className="admin-link-row">
        <div className="admin-actions">
          <a className="admin-link" href={withBasePath('/list')}>Kembali ke Pilih Layanan</a>
          <a className="admin-link" href={withBasePath('/blasting')}>Blasting</a>
          <a className="admin-link secondary-admin-link" href={withBasePath('/api/logout')}>Logout</a>
          <button type="button" className="download-button" onClick={downloadReport}>Download Excel</button>
          <button type="button" className="download-button" onClick={downloadPDFReport}>Download PDF</button>
        </div>
      </div>
      {loadMessage && <p className="admin-data-message">{loadMessage}</p>}

      <section className="dashboard-grid">
        <div className="summary-card">
          <h2>Total Survei</h2>
          <p>{summary.totalSurveys}</p>
        </div>
        <div className="summary-card">
          <h2>Responden Unik</h2>
          <p>{summary.uniqueRespondents}</p>
        </div>
        <div className="summary-card wide-card">
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
        <h2>Summary Survey Pengisian Layanan Sekretariat</h2>
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

      <section className="table-card">
        <h2>Respon Terakhir</h2>
        {records.length === 0 ? (
          <p>Tidak ada data survei tersimpan. Isi survei di halaman utama terlebih dahulu.</p>
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
    </main>
  );
}
