import writeXlsxFile, { Row, Sheet } from 'write-excel-file/browser';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  antiCorruptionQuestions,
  serviceQuestions,
} from '../survey-constants';
import { GENESIS_LOGO_URL, serviceTypes } from '../services';
import {
  answerToScale,
  getServiceQuality,
  getSurveySummary,
  type CalculationScale,
  type SkmCalculation,
  type SurveyRecord,
} from './report-core';

export {
  answerToScale,
  getServiceQuality,
  getSkmCalculation,
  getSurveySummary,
  loadSurveyRecords,
  serviceTargets,
} from './report-core';
export type { CalculationScale, SkmCalculation, SkmQuestionResult, SurveyRecord } from './report-core';

const cell = (value: string | number, bold = false) => ({
  value,
  fontWeight: bold ? 'bold' as const : undefined,
});

const formulaCell = (value: string, bold = false) => ({
  value,
  type: 'Formula' as const,
  fontWeight: bold ? 'bold' as const : undefined,
});

const excelColumn = (columnNumber: number) => {
  let column = '';
  let value = columnNumber;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    column = String.fromCharCode(65 + remainder) + column;
    value = Math.floor((value - 1) / 26);
  }
  return column;
};

const qualityFormula = (scoreCell: string) => (
  `IF(${scoreCell}>=88.31,"A (Sangat Baik)",IF(${scoreCell}>=76.61,"B (Baik)",IF(${scoreCell}>=65,"C (Kurang Baik)",IF(${scoreCell}>=25,"D (Tidak Baik)","-"))))`
);

const buildSummarySheet = (summary: ReturnType<typeof getSurveySummary>): Row[] => [
  [cell('Persentase Pemenuhan Target', true)],
  [cell('Total Target', true), summary.overallTarget],
  [cell('Total Respon', true), summary.overallResponded],
  [cell('Persentase Keseluruhan', true), `${summary.overallPercent}%`],
  [],
  [cell('Summary Survey Pengisian Layanan Sekretariat', true)],
  [cell('Nama Layanan', true), cell('Jumlah Responden', true), cell('Target', true), cell('Respon', true), cell('GAP', true), cell('Persentase', true)],
  ...summary.serviceSummary.map((row) => [
    row.name,
    row.population,
    row.target,
    row.responded,
    row.gap,
    `${row.percent}%`,
  ]),
];

const buildMonitoringSheet = (records: SurveyRecord[], calculationScale: CalculationScale): Row[] => {
  const header = [
    'Tanggal',
    'Nama Lengkap',
    'Direktorat',
    'Jenis Layanan',
    ...serviceQuestions.flatMap((question, index) => [
      `Kepuasan ${index + 1}`,
      `Skala ${calculationScale} Kepuasan ${index + 1}`,
      `Pertanyaan Kepuasan ${index + 1}`,
    ]),
    ...antiCorruptionQuestions.flatMap((question, index) => [
      `Anti Korupsi ${index + 1}`,
      `Skala ${calculationScale} Anti Korupsi ${index + 1}`,
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
        return [answer, answerToScale(answer, calculationScale), question];
      }),
      ...antiCorruptionQuestions.flatMap((question, index) => {
        const answer = record.responses[`anti-${index + 1}`] ?? '';
        return [answer, answerToScale(answer, calculationScale), question];
      }),
      record.comments,
    ]),
  ];
};

export const downloadAdminSummaryExcel = async (
  records: SurveyRecord[],
  availableServices = serviceTypes,
  populationCounts: Record<string, number> = {},
) => {
  const summary = getSurveySummary(records, availableServices, populationCounts);
  const sheets: Sheet<Blob>[] = [{
    sheet: 'Summary',
    data: buildSummarySheet(summary),
    columns: [{ width: 58 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 16 }],
  }];

  await writeXlsxFile(sheets).toFile(`summary-survei-${new Date().toISOString().slice(0, 10)}.xlsx`);
};

export const downloadMonitoringExcel = async (records: SurveyRecord[], calculationScale: CalculationScale = 4) => {
  const sheets: Sheet<Blob>[] = [{
    sheet: 'Response Detail',
    data: buildMonitoringSheet(records, calculationScale),
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
  const dataStartRow = 7;
  const dataEndRow = dataStartRow + calculation.records.length - 1;
  const totalRow = dataStartRow + calculation.records.length;
  const nrrRow = totalRow + 1;
  const weightedRow = totalRow + 2;
  const serviceSkmScaleRow = weightedRow + 2;
  const serviceSkm100Row = serviceSkmScaleRow + 1;
  const antiSkmScaleRow = serviceSkm100Row + 1;
  const antiSkm100Row = antiSkmScaleRow + 1;
  const serviceStartColumn = 2;
  const serviceEndColumn = serviceStartColumn + calculation.serviceResults.length - 1;
  const antiStartColumn = serviceEndColumn + 3;
  const antiEndColumn = antiStartColumn + calculation.antiResults.length - 1;
  const getDataRange = (columnNumber: number) => {
    const column = excelColumn(columnNumber);
    return calculation.records.length > 0 ? `${column}${dataStartRow}:${column}${dataEndRow}` : '';
  };
  const totalFormula = (columnNumber: number) => {
    const range = getDataRange(columnNumber);
    return range ? `SUM(${range})` : '0';
  };
  const nrrFormula = (columnNumber: number) => {
    const column = excelColumn(columnNumber);
    const range = getDataRange(columnNumber);
    return range ? `IF(COUNT(${range})=0,0,${column}${totalRow}/COUNT(${range}))` : '0';
  };
  const weightedFormula = (columnNumber: number, questionCount: number) => {
    const column = excelColumn(columnNumber);
    return questionCount > 0 ? `${column}${nrrRow}/${questionCount}` : '0';
  };
  const sumWeightedFormula = (startColumn: number, endColumn: number) => (
    startColumn <= endColumn
      ? `ROUND(SUM(${excelColumn(startColumn)}${weightedRow}:${excelColumn(endColumn)}${weightedRow}),3)`
      : '0'
  );
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
    [cell('Skala penilaian', true), `Skala ${calculation.calculationScale}`],
    [],
    [cell('Nilai Unsur Pelayanan', true), ...Array.from({ length: calculation.serviceResults.length - 1 }).map(() => null), null, cell('Nilai Unsur Persepsi Anti Korupsi', true)],
    header,
    ...calculation.records.map((record, index) => [
      index + 1,
      ...calculation.serviceResults.map((_, questionIndex) => answerToScale(record.responses[`service-${questionIndex + 1}`] ?? '', calculation.calculationScale) || ''),
      null,
      index + 1,
      ...calculation.antiResults.map((_, questionIndex) => answerToScale(record.responses[`anti-${questionIndex + 1}`] ?? '', calculation.calculationScale) || ''),
    ]),
    [
      cell('Nilai Unsur', true),
      ...calculation.serviceResults.map((_, index) => formulaCell(totalFormula(serviceStartColumn + index))),
      null,
      cell('Nilai Unsur', true),
      ...calculation.antiResults.map((_, index) => formulaCell(totalFormula(antiStartColumn + index))),
    ],
    [
      cell('NRR / Unsur', true),
      ...calculation.serviceResults.map((_, index) => formulaCell(nrrFormula(serviceStartColumn + index))),
      null,
      cell('NRR / Unsur', true),
      ...calculation.antiResults.map((_, index) => formulaCell(nrrFormula(antiStartColumn + index))),
    ],
    [
      cell('NRR tertimbang / unsur', true),
      ...calculation.serviceResults.map((_, index) => formulaCell(weightedFormula(serviceStartColumn + index, calculation.serviceResults.length))),
      null,
      cell('NRR tertimbang / unsur', true),
      ...calculation.antiResults.map((_, index) => formulaCell(weightedFormula(antiStartColumn + index, calculation.antiResults.length))),
    ],
    [],
    [cell(`SKM Unit Pelayanan (Skala ${calculation.calculationScale})`, true), formulaCell(sumWeightedFormula(serviceStartColumn, serviceEndColumn), true)],
    [cell('SKM Unit Pelayanan (Skala 100)', true), formulaCell(`ROUND(B${serviceSkmScaleRow}*${100 / calculation.maxScale},2)`, true), formulaCell(qualityFormula(`B${serviceSkm100Row}`))],
    [cell(`Indeks Persepsi Anti Korupsi (Skala ${calculation.calculationScale})`, true), formulaCell(sumWeightedFormula(antiStartColumn, antiEndColumn), true)],
    [cell('Indeks Persepsi Anti Korupsi (Skala 100)', true), formulaCell(`ROUND(B${antiSkmScaleRow}*${100 / calculation.maxScale},2)`, true), formulaCell(qualityFormula(`B${antiSkm100Row}`))],
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
  const totalColumns = 3 + calculation.serviceResults.length + calculation.antiResults.length;
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

const getAverageScale = (records: SurveyRecord[], prefix: 'service' | 'anti', calculationScale: CalculationScale) => {
  const keys = prefix === 'service' ? serviceQuestions : antiCorruptionQuestions;
  const values = keys.map((_, index) => {
    const scales = records
      .map((record) => answerToScale(record.responses[`${prefix}-${index + 1}`] ?? '', calculationScale))
      .filter((value): value is number => typeof value === 'number');
    if (scales.length === 0) return 0;
    return Number((scales.reduce((sum, value) => sum + value, 0) / scales.length).toFixed(2));
  });

  return values;
};

const drawAverageChart = (
  doc: jsPDF,
  title: string,
  values: number[],
  calculationScale: CalculationScale,
  startY: number,
  startX: number,
) => {
  doc.setFontSize(12);
  doc.text(title, startX, startY);
  values.forEach((value, index) => {
    const y = startY + 18 + (index * 16);
    doc.setFontSize(8);
    doc.text(`P${index + 1}`, startX, y + 8);
    doc.setFillColor(226, 236, 255);
    doc.rect(startX + 30, y, 120, 9, 'F');
    doc.setFillColor(15, 78, 184);
    doc.rect(startX + 30, y, (value / calculationScale) * 120, 9, 'F');
    doc.text(value ? value.toString() : '-', startX + 160, y + 8);
  });
};

export const downloadAdminSummaryPDF = async (
  records: SurveyRecord[],
  availableServices = serviceTypes,
  populationCounts: Record<string, number> = {},
) => {
  const summary = getSurveySummary(records, availableServices, populationCounts);
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
    head: [['Nama Layanan', 'Jumlah Responden', 'Target', 'Respon', 'GAP', 'Persentase']],
    body: summary.serviceSummary.map((row) => [row.name, row.population, row.target, row.responded, row.gap, `${row.percent}%`]),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: '#0f4eb8', textColor: '#ffffff' },
    margin: { left: 40, right: 40 },
  });

  doc.save(`summary-survei-${new Date().toISOString().slice(0, 10)}.pdf`);
};

export const downloadMonitoringPDF = async (records: SurveyRecord[], calculationScale: CalculationScale = 4) => {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  await addGenesisLogo(doc);

  doc.setFontSize(16);
  doc.text('Monitoring Response Survei', 150, 48);
  doc.setFontSize(9);
  doc.text(`Tanggal: ${new Date().toLocaleDateString('id-ID')}`, 150, 64);
  doc.text(`Total response: ${records.length}`, 150, 78);
  doc.text(`Perhitungan: Skala ${calculationScale}`, 150, 92);

  drawAverageChart(doc, `Grafik Rata-rata Skala ${calculationScale} Kepuasan Layanan`, getAverageScale(records, 'service', calculationScale), calculationScale, 110, 40);
  drawAverageChart(doc, `Grafik Rata-rata Skala ${calculationScale} Persepsi Anti Korupsi`, getAverageScale(records, 'anti', calculationScale), calculationScale, 110, 420);

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
        ...serviceQuestions.map((_, index) => answerToScale(record.responses[`service-${index + 1}`] ?? '', calculationScale) || '-'),
        ...antiCorruptionQuestions.map((_, index) => answerToScale(record.responses[`anti-${index + 1}`] ?? '', calculationScale) || '-'),
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
  doc.text(`Perhitungan: Skala ${calculation.calculationScale}`, 150, 92);

  const maxQuestionCount = Math.max(calculation.serviceResults.length, calculation.antiResults.length);
  const body: Array<Array<string | number>> = calculation.records.map((record, index) => [
    index + 1,
    ...calculation.serviceResults.map((_, questionIndex) => answerToScale(record.responses[`service-${questionIndex + 1}`] ?? '', calculation.calculationScale) || ''),
    index + 1,
    ...calculation.antiResults.map((_, questionIndex) => answerToScale(record.responses[`anti-${questionIndex + 1}`] ?? '', calculation.calculationScale) || ''),
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
    head: [['Indikator', `Nilai Skala ${calculation.calculationScale}`, 'Nilai Skala 100', 'Mutu']],
    body: [
      ['SKM Unit Pelayanan', calculation.serviceSkmScale, calculation.serviceSkm100, getServiceQuality(calculation.serviceSkm100)],
      ['Indeks Persepsi Anti Korupsi', calculation.antiSkmScale, calculation.antiSkm100, getServiceQuality(calculation.antiSkm100)],
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
