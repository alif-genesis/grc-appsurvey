import writeXlsxFile, { Row, Sheet } from 'write-excel-file/browser';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  antiCorruptionOptions,
  antiCorruptionQuestions,
  serviceOptions,
  serviceQuestions,
} from '../survey-form';
import { GENESIS_LOGO_URL, serviceTypes } from '../services';

export type SurveyRecord = {
  id: string;
  createdAt: string;
  profile: {
    name: string;
    directorate: string;
    serviceType: string;
  };
  responses: Record<string, string>;
  comments: string;
  blastId?: string;
  blastGroupId?: string;
};

export const SURVEY_STORAGE_KEY = 'genesis-survey-records';

export const serviceTargets = serviceTypes.map((name) => ({ name, target: 10 }));

export const loadSurveyRecords = (): SurveyRecord[] => {
  if (typeof window === 'undefined') return [];
  try {
    const stored = window.localStorage.getItem(SURVEY_STORAGE_KEY);
    return stored ? JSON.parse(stored) as SurveyRecord[] : [];
  } catch {
    return [];
  }
};

export const answerToScale = (answer: string) => {
  const serviceIndex = serviceOptions.indexOf(answer);
  if (serviceIndex >= 0) return serviceIndex + 1;

  const antiIndex = antiCorruptionOptions.indexOf(answer);
  if (antiIndex >= 0) return antiIndex + 1;

  return '';
};

export const getSurveySummary = (records: SurveyRecord[]) => {
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
};

export type SkmQuestionResult = {
  code: string;
  question: string;
  total: number;
  nrr: number;
  weightedNrr: number;
};

export type SkmCalculation = {
  serviceName: string;
  records: SurveyRecord[];
  serviceResults: SkmQuestionResult[];
  antiResults: SkmQuestionResult[];
  serviceSkm4: number;
  serviceSkm100: number;
  antiSkm4: number;
  antiSkm100: number;
};

const round3 = (value: number) => Number(value.toFixed(3));
const round2 = (value: number) => Number(value.toFixed(2));

const getQuestionResults = (
  records: SurveyRecord[],
  questions: string[],
  prefix: 'service' | 'anti',
  codePrefix: string,
) => {
  const weight = questions.length > 0 ? 1 / questions.length : 0;

  return questions.map((question, index) => {
    const total = records.reduce((sum, record) => {
      const scale = answerToScale(record.responses[`${prefix}-${index + 1}`] ?? '');
      return sum + (typeof scale === 'number' ? scale : 0);
    }, 0);
    const nrr = records.length > 0 ? total / records.length : 0;
    return {
      code: `${codePrefix}${index + 1}`,
      question,
      total,
      nrr: round3(nrr),
      weightedNrr: round3(nrr * weight),
    };
  });
};

export const getSkmCalculation = (records: SurveyRecord[], serviceName: string): SkmCalculation => {
  const filteredRecords = serviceName
    ? records.filter((record) => record.profile.serviceType === serviceName)
    : records;
  const serviceResults = getQuestionResults(filteredRecords, serviceQuestions, 'service', 'U');
  const antiResults = getQuestionResults(filteredRecords, antiCorruptionQuestions, 'anti', 'A');
  const serviceSkm4 = serviceResults.reduce((sum, result) => sum + result.weightedNrr, 0);
  const antiSkm4 = antiResults.reduce((sum, result) => sum + result.weightedNrr, 0);

  return {
    serviceName,
    records: filteredRecords,
    serviceResults,
    antiResults,
    serviceSkm4: round3(serviceSkm4),
    serviceSkm100: round2(serviceSkm4 * 25),
    antiSkm4: round3(antiSkm4),
    antiSkm100: round2(antiSkm4 * 25),
  };
};

export const getServiceQuality = (score: number) => {
  if (score >= 88.31) return 'A (Sangat Baik)';
  if (score >= 76.61) return 'B (Baik)';
  if (score >= 65) return 'C (Kurang Baik)';
  if (score >= 25) return 'D (Tidak Baik)';
  return '-';
};

const cell = (value: string | number, bold = false) => ({
  value,
  fontWeight: bold ? 'bold' as const : undefined,
});

const buildSummarySheet = (summary: ReturnType<typeof getSurveySummary>): Row[] => [
  [cell('Persentase Pemenuhan Target', true)],
  [cell('Total Target', true), summary.overallTarget],
  [cell('Total Respon', true), summary.overallResponded],
  [cell('Persentase Keseluruhan', true), `${summary.overallPercent}%`],
  [],
  [cell('Summary Survey Pengisian Layanan Sekretariat', true)],
  [cell('Nama Layanan', true), cell('Target', true), cell('Respon', true), cell('GAP', true), cell('Persentase', true)],
  ...summary.serviceSummary.map((row) => [
    row.name,
    row.target,
    row.responded,
    row.gap,
    `${row.percent}%`,
  ]),
];

const buildMonitoringSheet = (records: SurveyRecord[]): Row[] => {
  const header = [
    'Tanggal',
    'Nama Lengkap',
    'Direktorat',
    'Jenis Layanan',
    ...serviceQuestions.flatMap((question, index) => [
      `Kepuasan ${index + 1}`,
      `Skala Kepuasan ${index + 1}`,
      `Pertanyaan Kepuasan ${index + 1}`,
    ]),
    ...antiCorruptionQuestions.flatMap((question, index) => [
      `Anti Korupsi ${index + 1}`,
      `Skala Anti Korupsi ${index + 1}`,
      `Pertanyaan Anti Korupsi ${index + 1}`,
    ]),
    'Kritik/Saran',
  ];

  return [
    header.map((item) => cell(item, true)),
    ...records.map((record) => [
      new Date(record.createdAt).toLocaleString('id-ID'),
      record.profile.name,
      record.profile.directorate,
      record.profile.serviceType,
      ...serviceQuestions.flatMap((question, index) => {
        const answer = record.responses[`service-${index + 1}`] ?? '';
        return [answer, answerToScale(answer), question];
      }),
      ...antiCorruptionQuestions.flatMap((question, index) => {
        const answer = record.responses[`anti-${index + 1}`] ?? '';
        return [answer, answerToScale(answer), question];
      }),
      record.comments,
    ]),
  ];
};

export const downloadAdminSummaryExcel = async (records: SurveyRecord[]) => {
  const summary = getSurveySummary(records);
  const sheets: Sheet<Blob>[] = [{
    sheet: 'Summary',
    data: buildSummarySheet(summary),
    columns: [{ width: 58 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 16 }],
  }];

  await writeXlsxFile(sheets).toFile(`summary-survei-${new Date().toISOString().slice(0, 10)}.xlsx`);
};

export const downloadMonitoringExcel = async (records: SurveyRecord[]) => {
  const sheets: Sheet<Blob>[] = [{
    sheet: 'Response Detail',
    data: buildMonitoringSheet(records),
    columns: [
      { width: 22 },
      { width: 24 },
      { width: 30 },
      { width: 52 },
      ...Array.from({ length: serviceQuestions.length + antiCorruptionQuestions.length }).flatMap(() => [
        { width: 22 },
        { width: 14 },
        { width: 58 },
      ]),
      { width: 46 },
    ],
  }];

  await writeXlsxFile(sheets).toFile(`detail-response-survei-${new Date().toISOString().slice(0, 10)}.xlsx`);
};

const buildSkmSheet = (calculation: SkmCalculation): Row[] => {
  const header = [
    cell('No. Resp', true),
    ...calculation.serviceResults.map((result) => cell(result.code, true)),
    null,
    cell('No. Resp', true),
    ...calculation.antiResults.map((result) => cell(result.code, true)),
  ];
  const maxQuestionCount = Math.max(calculation.serviceResults.length, calculation.antiResults.length);

  return [
    [cell('Perhitungan SKM', true), calculation.serviceName || 'Semua Layanan'],
    [],
    [cell('Nilai Unsur Pelayanan', true), ...Array.from({ length: calculation.serviceResults.length - 1 }).map(() => null), null, cell('Nilai Unsur Persepsi Anti Korupsi', true)],
    header,
    ...calculation.records.map((record, index) => [
      index + 1,
      ...calculation.serviceResults.map((_, questionIndex) => answerToScale(record.responses[`service-${questionIndex + 1}`] ?? '') || ''),
      null,
      index + 1,
      ...calculation.antiResults.map((_, questionIndex) => answerToScale(record.responses[`anti-${questionIndex + 1}`] ?? '') || ''),
    ]),
    [
      cell('Nilai Unsur', true),
      ...calculation.serviceResults.map((result) => result.total),
      null,
      cell('Nilai Unsur', true),
      ...calculation.antiResults.map((result) => result.total),
    ],
    [
      cell('NRR / Unsur', true),
      ...calculation.serviceResults.map((result) => result.nrr),
      null,
      cell('NRR / Unsur', true),
      ...calculation.antiResults.map((result) => result.nrr),
    ],
    [
      cell('NRR tertimbang / unsur', true),
      ...calculation.serviceResults.map((result) => result.weightedNrr),
      null,
      cell('NRR tertimbang / unsur', true),
      ...calculation.antiResults.map((result) => result.weightedNrr),
    ],
    [],
    [cell('SKM Unit Pelayanan', true), calculation.serviceSkm100, getServiceQuality(calculation.serviceSkm100)],
    [cell('Indeks Persepsi Anti Korupsi', true), calculation.antiSkm100, getServiceQuality(calculation.antiSkm100)],
    [],
    [cell('Keterangan Unsur', true)],
    ...Array.from({ length: maxQuestionCount }).map((_, index) => [
      calculation.serviceResults[index]?.code ?? '',
      calculation.serviceResults[index]?.question ?? '',
      null,
      calculation.antiResults[index]?.code ?? '',
      calculation.antiResults[index]?.question ?? '',
    ]),
  ];
};

export const downloadSkmExcel = async (calculation: SkmCalculation) => {
  const totalColumns = 2 + calculation.serviceResults.length + calculation.antiResults.length;
  const sheets: Sheet<Blob>[] = [{
    sheet: 'Perhitungan SKM',
    data: buildSkmSheet(calculation),
    columns: Array.from({ length: totalColumns }).map((_, index) => ({ width: index === 0 ? 18 : 14 })),
  }];

  await writeXlsxFile(sheets).toFile(`perhitungan-skm-${new Date().toISOString().slice(0, 10)}.xlsx`);
};

const loadImageDataUrl = async (url: string) => {
  const response = await fetch(url);
  const blob = await response.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return { dataUrl, mimeType: blob.type };
};

const addGenesisLogo = async (doc: jsPDF) => {
  try {
    const logo = await loadImageDataUrl(GENESIS_LOGO_URL);
    const format = logo.mimeType.includes('jpeg') || logo.mimeType.includes('jpg') ? 'JPEG' : 'PNG';
    doc.addImage(logo.dataUrl, format, 40, 28, 90, 38);
  } catch {
    doc.setFontSize(12);
    doc.text('PT GENETIKA SOLUSI BISNIS', 40, 48);
  }
};

const drawTargetChart = (doc: jsPDF, summary: ReturnType<typeof getSurveySummary>, startY: number) => {
  doc.setFontSize(12);
  doc.text('Grafik Persentase Pemenuhan Target', 40, startY);
  const rows = summary.serviceSummary.slice(0, 8);
  rows.forEach((row, index) => {
    const y = startY + 20 + (index * 18);
    const width = Math.min(180, Math.max(2, row.percent * 1.8));
    doc.setFontSize(7);
    doc.text(row.name.slice(0, 48), 40, y + 8);
    doc.setFillColor(226, 236, 255);
    doc.rect(250, y, 180, 10, 'F');
    doc.setFillColor(15, 78, 184);
    doc.rect(250, y, width, 10, 'F');
    doc.setFontSize(8);
    doc.text(`${row.percent}%`, 440, y + 8);
  });
};

const getAverageScale = (records: SurveyRecord[], prefix: 'service' | 'anti') => {
  const keys = prefix === 'service' ? serviceQuestions : antiCorruptionQuestions;
  const values = keys.map((_, index) => {
    const scales = records
      .map((record) => answerToScale(record.responses[`${prefix}-${index + 1}`] ?? ''))
      .filter((value): value is number => typeof value === 'number');
    if (scales.length === 0) return 0;
    return Number((scales.reduce((sum, value) => sum + value, 0) / scales.length).toFixed(2));
  });

  return values;
};

const drawAverageChart = (doc: jsPDF, title: string, values: number[], startY: number, startX: number) => {
  doc.setFontSize(12);
  doc.text(title, startX, startY);
  values.forEach((value, index) => {
    const y = startY + 18 + (index * 16);
    doc.setFontSize(8);
    doc.text(`P${index + 1}`, startX, y + 8);
    doc.setFillColor(226, 236, 255);
    doc.rect(startX + 30, y, 120, 9, 'F');
    doc.setFillColor(15, 78, 184);
    doc.rect(startX + 30, y, value * 30, 9, 'F');
    doc.text(value ? value.toString() : '-', startX + 160, y + 8);
  });
};

export const downloadAdminSummaryPDF = async (records: SurveyRecord[]) => {
  const summary = getSurveySummary(records);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  await addGenesisLogo(doc);
  doc.setFontSize(16);
  doc.text('Report Summary Survei Layanan', 150, 48);
  doc.setFontSize(9);
  doc.text(`Tanggal: ${new Date().toLocaleDateString('id-ID')}`, 150, 64);
  doc.text(`Total respon: ${summary.overallResponded}/${summary.overallTarget} (${summary.overallPercent}%)`, 150, 78);

  drawTargetChart(doc, summary, 110);

  autoTable(doc, {
    startY: 280,
    head: [['Nama Layanan', 'Target', 'Respon', 'GAP', 'Persentase']],
    body: summary.serviceSummary.map((row) => [row.name, row.target, row.responded, row.gap, `${row.percent}%`]),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: '#0f4eb8', textColor: '#ffffff' },
    margin: { left: 40, right: 40 },
  });

  doc.save(`summary-survei-${new Date().toISOString().slice(0, 10)}.pdf`);
};

export const downloadMonitoringPDF = async (records: SurveyRecord[]) => {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  await addGenesisLogo(doc);

  doc.setFontSize(16);
  doc.text('Monitoring Response Survei', 150, 48);
  doc.setFontSize(9);
  doc.text(`Tanggal: ${new Date().toLocaleDateString('id-ID')}`, 150, 64);
  doc.text(`Total response: ${records.length}`, 150, 78);

  drawAverageChart(doc, 'Grafik Rata-rata Skala Kepuasan Layanan', getAverageScale(records, 'service'), 105, 40);
  drawAverageChart(doc, 'Grafik Rata-rata Skala Persepsi Anti Korupsi', getAverageScale(records, 'anti'), 105, 420);

  autoTable(doc, {
    startY: 300,
    head: [[
      'Tanggal',
      'Nama',
      'Direktorat',
      'Layanan',
      ...serviceQuestions.map((_, index) => `K${index + 1}`),
      ...antiCorruptionQuestions.map((_, index) => `A${index + 1}`),
      'Kritik/Saran',
    ]],
    body: records.map((record) => {
      return [
        new Date(record.createdAt).toLocaleString('id-ID'),
        record.profile.name,
        record.profile.directorate,
        record.profile.serviceType,
        ...serviceQuestions.map((_, index) => answerToScale(record.responses[`service-${index + 1}`] ?? '') || '-'),
        ...antiCorruptionQuestions.map((_, index) => answerToScale(record.responses[`anti-${index + 1}`] ?? '') || '-'),
        record.comments,
      ];
    }),
    styles: { fontSize: 7, cellPadding: 3 },
    headStyles: { fillColor: '#0f4eb8', textColor: '#ffffff' },
    margin: { left: 40, right: 40 },
  });

  doc.save(`monitoring-response-${new Date().toISOString().slice(0, 10)}.pdf`);
};

export const downloadSkmPDF = async (calculation: SkmCalculation) => {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  await addGenesisLogo(doc);

  doc.setFontSize(15);
  doc.text('Report Perhitungan SKM', 150, 48);
  doc.setFontSize(9);
  doc.text(`Layanan: ${calculation.serviceName || 'Semua Layanan'}`, 150, 64);
  doc.text(`Jumlah responden: ${calculation.records.length}`, 150, 78);

  const maxQuestionCount = Math.max(calculation.serviceResults.length, calculation.antiResults.length);
  const body: Array<Array<string | number>> = calculation.records.map((record, index) => [
    index + 1,
    ...calculation.serviceResults.map((_, questionIndex) => answerToScale(record.responses[`service-${questionIndex + 1}`] ?? '') || ''),
    index + 1,
    ...calculation.antiResults.map((_, questionIndex) => answerToScale(record.responses[`anti-${questionIndex + 1}`] ?? '') || ''),
  ]);

  body.push([
    'Nilai Unsur',
    ...calculation.serviceResults.map((result) => result.total),
    'Nilai Unsur',
    ...calculation.antiResults.map((result) => result.total),
  ]);
  body.push([
    'NRR / Unsur',
    ...calculation.serviceResults.map((result) => result.nrr),
    'NRR / Unsur',
    ...calculation.antiResults.map((result) => result.nrr),
  ]);
  body.push([
    'NRR tertimbang',
    ...calculation.serviceResults.map((result) => result.weightedNrr),
    'NRR tertimbang',
    ...calculation.antiResults.map((result) => result.weightedNrr),
  ]);

  autoTable(doc, {
    startY: 105,
    head: [[
      'No. Resp',
      ...calculation.serviceResults.map((result) => result.code),
      'No. Resp',
      ...calculation.antiResults.map((result) => result.code),
    ]],
    body,
    styles: { fontSize: 7, cellPadding: 3, halign: 'center' },
    headStyles: { fillColor: '#0f4eb8', textColor: '#ffffff' },
    margin: { left: 32, right: 32 },
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 18,
    head: [['Indikator', 'Nilai Skala 4', 'Nilai Skala 100', 'Mutu']],
    body: [
      ['SKM Unit Pelayanan', calculation.serviceSkm4, calculation.serviceSkm100, getServiceQuality(calculation.serviceSkm100)],
      ['Indeks Persepsi Anti Korupsi', calculation.antiSkm4, calculation.antiSkm100, getServiceQuality(calculation.antiSkm100)],
    ],
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: '#0f4eb8', textColor: '#ffffff' },
    margin: { left: 32, right: 32 },
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 18,
    head: [['Unsur Pelayanan', 'Pertanyaan', 'Unsur Anti Korupsi', 'Pertanyaan']],
    body: Array.from({ length: maxQuestionCount }).map((_, index) => [
      calculation.serviceResults[index]?.code ?? '',
      calculation.serviceResults[index]?.question ?? '',
      calculation.antiResults[index]?.code ?? '',
      calculation.antiResults[index]?.question ?? '',
    ]),
    styles: { fontSize: 7, cellPadding: 3 },
    headStyles: { fillColor: '#0f4eb8', textColor: '#ffffff' },
    margin: { left: 32, right: 32 },
  });

  doc.save(`report-skm-${new Date().toISOString().slice(0, 10)}.pdf`);
};
