import writeXlsxFile, { Row, Sheet } from 'write-excel-file/browser';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  antiCorruptionQuestions,
  serviceQuestions,
} from '../survey-constants';
import { GENESIS_LOGO_URL, serviceTypes, withBasePath } from '../services';
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
  [cell('Persentase Pemenuhan Responden', true)],
  [cell('Total Responden Layanan', true), summary.overallPopulation],
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
    'No.',
    'Tanggal',
    'Nama Lengkap',
    'Satuan Kerja',
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
    ...records.map((record, index) => [
      index + 1,
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
      { width: 8 },
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

const addGenesisLogo = async (doc: jsPDF, x = 40, y = 28, width = 90, height = 53) => {
  try {
    const logo = await loadImageDataUrl(withBasePath('/genetika-1-warna.png'));
    const format = logo.mimeType.includes('jpeg') || logo.mimeType.includes('jpg') ? 'JPEG' : 'PNG';
    doc.addImage(logo.dataUrl, format, x, y, width, height);
  } catch {
    try {
      const logo = await loadImageDataUrl(GENESIS_LOGO_URL);
      const format = logo.mimeType.includes('jpeg') || logo.mimeType.includes('jpg') ? 'JPEG' : 'PNG';
      doc.addImage(logo.dataUrl, format, x, y, width, height);
    } catch {
      doc.setFontSize(12);
      doc.text('PT GENETIKA SOLUSI BISNIS', x, y + 20);
    }
  }
};

const drawTargetChart = (doc: jsPDF, summary: ReturnType<typeof getSurveySummary>, startY: number) => {
  doc.setFontSize(12);
  doc.text('Grafik Persentase Pemenuhan Responden', 40, startY);
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

const getDownloadedAtText = () => new Date().toLocaleString('id-ID');

const drawStyledReportFrame = async (
  doc: jsPDF,
  titleLines: string[],
  metaLines: string[],
  options: { logoWidth?: number; logoHeight?: number } = {},
) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const titleX = pageWidth > 700 ? 310 : 275;

  doc.setFillColor(248, 251, 255);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  doc.setFillColor(15, 78, 184);
  doc.triangle(pageWidth - 230, 0, pageWidth, 0, pageWidth - 120, 76, 'F');
  doc.setFillColor(111, 191, 68);
  doc.triangle(pageWidth - 70, 0, pageWidth, 0, pageWidth, 112, 'F');
  doc.setFillColor(15, 78, 184);
  doc.triangle(0, pageHeight - 56, 0, pageHeight, pageWidth, pageHeight, 'F');
  doc.setFillColor(111, 191, 68);
  doc.triangle(pageWidth - 190, pageHeight, pageWidth, pageHeight, pageWidth - 38, pageHeight - 30, 'F');

  await addGenesisLogo(doc, 40, 32, options.logoWidth ?? 120, options.logoHeight ?? 70);

  doc.setTextColor(10, 35, 72);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(pageWidth > 700 ? 24 : 28);
  titleLines.forEach((line, index) => {
    doc.text(line, titleX, 72 + (index * 30));
  });
  doc.setFillColor(111, 191, 68);
  doc.roundedRect(titleX, 72 + (titleLines.length * 30), 54, 4, 2, 2, 'F');

  doc.setFontSize(9);
  metaLines.forEach((line, index) => {
    doc.text(line, titleX, 104 + (titleLines.length * 30) + (index * 14));
  });
};

const drawStyledReportContinuationBackground = (doc: jsPDF) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setFillColor(248, 251, 255);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');
  doc.setFillColor(15, 78, 184);
  doc.triangle(pageWidth - 230, 0, pageWidth, 0, pageWidth - 120, 76, 'F');
  doc.setFillColor(111, 191, 68);
  doc.triangle(pageWidth - 70, 0, pageWidth, 0, pageWidth, 112, 'F');
  doc.setFillColor(15, 78, 184);
  doc.triangle(0, pageHeight - 56, 0, pageHeight, pageWidth, pageHeight, 'F');
  doc.setFillColor(111, 191, 68);
  doc.triangle(pageWidth - 190, pageHeight, pageWidth, pageHeight, pageWidth - 38, pageHeight - 30, 'F');
};

const drawStyledPageNumber = (doc: jsPDF, pageNumber: number, totalPages: number) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setPage(pageNumber);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.text(`${pageNumber}/${totalPages}`, pageWidth - 56, pageHeight - 18);
};

const getCurrentPdfPage = (doc: jsPDF) => (
  (doc as any).internal?.getCurrentPageInfo?.().pageNumber as number | undefined
) ?? 1;

const styledAutoTablePageHooks = () => ({
  willDrawPage: (data: { doc: jsPDF }) => {
    if (getCurrentPdfPage(data.doc) > 1) {
      drawStyledReportContinuationBackground(data.doc);
    }
  },
});

const applyStyledReportPageNumbers = (doc: jsPDF) => {
  const totalPages = doc.getNumberOfPages();

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    drawStyledPageNumber(doc, pageNumber, totalPages);
  }
};

const drawRankingReportFrame = async (
  doc: jsPDF,
  pageNumber: number,
  totalPages: number,
  period: string,
  totalRespondents: number,
  completedServices: number,
  totalServices: number,
  completedRespondents: number,
  completedSurveys: number,
  totalSurveys: number,
) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setFillColor(248, 251, 255);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  doc.setFillColor(15, 78, 184);
  doc.triangle(pageWidth - 210, 0, pageWidth, 0, pageWidth - 94, 72, 'F');
  doc.setFillColor(111, 191, 68);
  doc.triangle(pageWidth - 64, 0, pageWidth, 0, pageWidth, 100, 'F');
  doc.setFillColor(15, 78, 184);
  doc.triangle(0, pageHeight - 72, 0, pageHeight, pageWidth, pageHeight, 'F');
  doc.setFillColor(111, 191, 68);
  doc.triangle(pageWidth - 180, pageHeight, pageWidth, pageHeight, pageWidth - 40, pageHeight - 32, 'F');

  await addGenesisLogo(doc, 40, 34, 130, 76);

  doc.setTextColor(10, 35, 72);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(30);
  doc.text('LAPORAN', 275, 84);
  doc.setFontSize(20);
  doc.text('PEMENUHAN SURVEY', 275, 112);
  doc.setFillColor(111, 191, 68);
  doc.roundedRect(275, 130, 54, 4, 2, 2, 'F');

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Diunduh: ${period}`, 275, 156);

  doc.setFillColor(255, 255, 255);
  doc.roundedRect(352, 206, 190, 62, 8, 8, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(352, 206, 190, 62, 8, 8, 'S');
  doc.setFillColor(15, 78, 184);
  doc.circle(390, 237, 17, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.text('R', 386, 242);
  doc.setTextColor(10, 35, 72);
  doc.setFontSize(7.5);
  doc.text('TOTAL RESPONDEN', 438, 226);
  doc.setTextColor(15, 78, 184);
  doc.setFontSize(22);
  doc.text(String(totalRespondents), 438, 252);

  doc.setTextColor(15, 78, 184);
  doc.setFontSize(12);
  doc.text('RINGKASAN', 72, 218);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text([
    'Laporan ini menyajikan informasi mengenai pemenuhan survey',
    'berdasarkan layanan yang tersedia. Data diperoleh dari hasil',
    'pengumpulan dan pengolahan data survey saat laporan diunduh.',
  ], 72, 238, { lineHeightFactor: 1.45 });

  const servicePercent = totalServices > 0 ? Math.round((completedServices / totalServices) * 100) : 0;
  const respondentPercent = totalRespondents > 0 ? Math.round((completedRespondents / totalRespondents) * 100) : 0;
  const surveyPercent = totalSurveys > 0 ? Math.round((completedSurveys / totalSurveys) * 100) : 0;
  const drawMetricTable = (x: number, title: string, value: string, percent: number) => {
    const width = 160;
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, 282, width, 54, 7, 7, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, 282, width, 54, 7, 7, 'S');
    doc.setFillColor(15, 78, 184);
    doc.roundedRect(x, 282, width, 18, 7, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(title, x + 10, 295);
    doc.setTextColor(10, 35, 72);
    doc.setFontSize(8);
    doc.text(value, x + 10, 320);
    doc.setTextColor(15, 78, 184);
    doc.setFontSize(12);
    doc.text(`${percent}%`, x + width - 12, 321, { align: 'right' });
  };

  drawMetricTable(40, 'LAYANAN SELESAI', `${completedServices}/${totalServices} layanan`, servicePercent);
  drawMetricTable(218, 'RESPONDEN MENGISI', `${completedRespondents}/${totalRespondents} responden`, respondentPercent);
  drawMetricTable(396, 'SURVEY TERISI', `${completedSurveys}/${totalSurveys} survey`, surveyPercent);

  doc.setFillColor(15, 78, 184);
  doc.roundedRect(36, 360, 170, 28, 5, 5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('PEMENUHAN SURVEY', 76, 378);

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('KETERANGAN', 40, pageHeight - 98);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text([
    'Persentase menunjukkan tingkat pemenuhan survey untuk masing-masing layanan.',
    'Semakin tinggi persentase, semakin baik tingkat pemenuhan survey.',
  ], 40, pageHeight - 82, { lineHeightFactor: 1.35 });

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.text(`${pageNumber}/${totalPages}`, pageWidth - 56, pageHeight - 18);
};

export const downloadSurveyFulfillmentRankingPDF = async (
  records: SurveyRecord[],
  availableServices = serviceTypes,
  populationCounts: Record<string, number> = {},
  totalRespondents?: number,
  completedRespondents?: number,
) => {
  const summary = getSurveySummary(records, availableServices, populationCounts);
  const rows = [...summary.serviceSummary].sort((left, right) => (
    right.percent - left.percent
    || right.responded - left.responded
    || left.name.localeCompare(right.name)
  ));
  const rowsPerPage = 7;
  const pages = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const period = getDownloadedAtText();
  const respondentTotal = totalRespondents ?? summary.uniqueRespondents;
  const completedRespondentTotal = completedRespondents ?? new Set(records.map((record) => (
    `${record.blastGroupId || ''}-${record.profile.name}-${record.profile.directorate}`
  ))).size;
  const totalSurveyPopulation = summary.serviceSummary.reduce((sum, row) => sum + row.population, 0);
  const completedServices = rows.filter((row) => row.percent >= 100).length;

  for (let pageIndex = 0; pageIndex < pages; pageIndex += 1) {
    if (pageIndex > 0) doc.addPage();
    await drawRankingReportFrame(
      doc,
      pageIndex + 1,
      pages,
      period,
      respondentTotal,
      completedServices,
      rows.length,
      completedRespondentTotal,
      summary.overallResponded,
      totalSurveyPopulation,
    );

    doc.setFillColor(255, 255, 255);
    doc.roundedRect(32, 382, 532, 286, 10, 10, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(32, 382, 532, 286, 10, 10, 'S');

    const pageRows = rows.slice(pageIndex * rowsPerPage, (pageIndex + 1) * rowsPerPage);
    pageRows.forEach((row, index) => {
      const y = 422 + (index * 36);
      const barWidth = 198;
      const barX = 292;
      const fillWidth = Math.min(barWidth, Math.max(0, (row.percent / 100) * barWidth));

      doc.setFillColor(111, 191, 68);
      doc.circle(52, y + 7, 3, 'F');
      doc.setTextColor(10, 35, 72);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.2);
      doc.text(doc.splitTextToSize(row.name, 220), 62, y + 9);
      doc.setFillColor(226, 232, 240);
      doc.roundedRect(barX, y, barWidth, 8, 4, 4, 'F');
      if (fillWidth > 0) {
        doc.setFillColor(15, 78, 184);
        doc.roundedRect(barX, y, fillWidth, 8, 4, 4, 'F');
      }
      doc.setTextColor(15, 78, 184);
      doc.setFontSize(8.5);
      doc.text(`${row.percent}%`, 548, y + 8, { align: 'right' });
      doc.setDrawColor(226, 232, 240);
      doc.line(48, y + 27, 548, y + 27);
    });
  }

  doc.save(`ranking-pemenuhan-survey-${new Date().toISOString().slice(0, 10)}.pdf`);
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

  await drawStyledReportFrame(
    doc,
    ['LAPORAN', 'SUMMARY SURVEY'],
    [
      `Diunduh: ${getDownloadedAtText()}`,
      `Total respon: ${summary.overallResponded}/${summary.overallPopulation} (${summary.overallPercent}%)`,
    ],
  );

  doc.setTextColor(15, 78, 184);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('SUMMARY SURVEY PENGISIAN LAYANAN SEKRETARIAT', 40, 224);

  autoTable(doc, {
    ...styledAutoTablePageHooks(),
    startY: 248,
    head: [['Nama Layanan', 'Jumlah Responden', 'Target', 'Respon', 'GAP', 'Persentase']],
    body: summary.serviceSummary.map((row) => [row.name, row.population, row.target, row.responded, row.gap, `${row.percent}%`]),
    styles: { fontSize: 8, cellPadding: 5, textColor: '#0f172a', lineColor: '#dbe7f6', lineWidth: 0.5 },
    headStyles: { fillColor: '#0f4eb8', textColor: '#ffffff' },
    alternateRowStyles: { fillColor: '#f8fbff' },
    margin: { left: 40, right: 40, bottom: 70 },
  });

  applyStyledReportPageNumbers(doc);
  doc.save(`summary-survei-${new Date().toISOString().slice(0, 10)}.pdf`);
};

export const downloadMonitoringPDF = async (records: SurveyRecord[], calculationScale: CalculationScale = 4) => {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  await drawStyledReportFrame(
    doc,
    ['LAPORAN', 'DETAIL RESPONSE'],
    [
      `Diunduh: ${getDownloadedAtText()}`,
      `Total response: ${records.length}`,
      `Perhitungan: Skala ${calculationScale}`,
    ],
    { logoWidth: 112, logoHeight: 66 },
  );

  doc.setTextColor(15, 78, 184);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('DETAIL RESPONSE SELURUH RESPONDEN', 40, 218);

  autoTable(doc, {
    ...styledAutoTablePageHooks(),
    startY: 242,
    head: [[
      'No.',
      'Tanggal',
      'Nama',
      'Satuan Kerja',
      'Layanan',
      ...serviceQuestions.map((_, index) => `K${index + 1}`),
      ...antiCorruptionQuestions.map((_, index) => `A${index + 1}`),
      'Kritik/Saran',
    ]],
    body: records.map((record, index) => {
      return [
        index + 1,
        new Date(record.createdAt).toLocaleString('id-ID'),
        record.profile.name,
        record.profile.directorate,
        record.profile.serviceType,
        ...serviceQuestions.map((_, index) => answerToScale(record.responses[`service-${index + 1}`] ?? '', calculationScale) || '-'),
        ...antiCorruptionQuestions.map((_, index) => answerToScale(record.responses[`anti-${index + 1}`] ?? '', calculationScale) || '-'),
        record.comments,
      ];
    }),
    styles: { fontSize: 6.5, cellPadding: 3, textColor: '#0f172a', lineColor: '#dbe7f6', lineWidth: 0.4 },
    headStyles: { fillColor: '#0f4eb8', textColor: '#ffffff' },
    alternateRowStyles: { fillColor: '#f8fbff' },
    margin: { left: 40, right: 40, top: 40, bottom: 62 },
  });

  applyStyledReportPageNumbers(doc);
  doc.save(`monitoring-response-${new Date().toISOString().slice(0, 10)}.pdf`);
};

export const downloadSkmPDF = async (calculation: SkmCalculation) => {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  await drawStyledReportFrame(
    doc,
    ['LAPORAN', 'PERHITUNGAN SKM'],
    [
      `Diunduh: ${getDownloadedAtText()}`,
      `Layanan: ${calculation.serviceName || 'Semua Layanan'}`,
      `Jumlah responden: ${calculation.records.length} | Skala ${calculation.calculationScale}`,
    ],
    { logoWidth: 112, logoHeight: 66 },
  );

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

  doc.setTextColor(15, 78, 184);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('PERHITUNGAN SKM PER LAYANAN', 40, 218);

  autoTable(doc, {
    ...styledAutoTablePageHooks(),
    startY: 242,
    head: [[
      'No. Resp',
      ...calculation.serviceResults.map((result) => result.code),
      'No. Resp',
      ...calculation.antiResults.map((result) => result.code),
    ]],
    body,
    styles: { fontSize: 6.8, cellPadding: 3, halign: 'center', textColor: '#0f172a', lineColor: '#dbe7f6', lineWidth: 0.4 },
    headStyles: { fillColor: '#0f4eb8', textColor: '#ffffff' },
    alternateRowStyles: { fillColor: '#f8fbff' },
    margin: { left: 40, right: 40, top: 40, bottom: 62 },
  });

  autoTable(doc, {
    ...styledAutoTablePageHooks(),
    startY: (doc as any).lastAutoTable.finalY + 18,
    head: [['Indikator', `Nilai Skala ${calculation.calculationScale}`, 'Nilai Skala 100', 'Mutu']],
    body: [
      ['SKM Unit Pelayanan', calculation.serviceSkmScale, calculation.serviceSkm100, getServiceQuality(calculation.serviceSkm100)],
      ['Indeks Persepsi Anti Korupsi', calculation.antiSkmScale, calculation.antiSkm100, getServiceQuality(calculation.antiSkm100)],
    ],
    styles: { fontSize: 8, cellPadding: 4, textColor: '#0f172a', lineColor: '#dbe7f6', lineWidth: 0.4 },
    headStyles: { fillColor: '#0f4eb8', textColor: '#ffffff' },
    alternateRowStyles: { fillColor: '#f8fbff' },
    margin: { left: 40, right: 40, top: 40, bottom: 62 },
  });

  autoTable(doc, {
    ...styledAutoTablePageHooks(),
    startY: (doc as any).lastAutoTable.finalY + 18,
    head: [['Unsur Pelayanan', 'Pertanyaan', 'Unsur Anti Korupsi', 'Pertanyaan']],
    body: Array.from({ length: maxQuestionCount }).map((_, index) => [
      calculation.serviceResults[index]?.code ?? '',
      calculation.serviceResults[index]?.question ?? '',
      calculation.antiResults[index]?.code ?? '',
      calculation.antiResults[index]?.question ?? '',
    ]),
    styles: { fontSize: 7, cellPadding: 3, textColor: '#0f172a', lineColor: '#dbe7f6', lineWidth: 0.4 },
    headStyles: { fillColor: '#0f4eb8', textColor: '#ffffff' },
    alternateRowStyles: { fillColor: '#f8fbff' },
    margin: { left: 40, right: 40, top: 40, bottom: 62 },
  });

  applyStyledReportPageNumbers(doc);
  doc.save(`report-skm-${new Date().toISOString().slice(0, 10)}.pdf`);
};
