import {
  antiCorruptionOptions,
  antiCorruptionQuestions,
  serviceOptions,
  serviceQuestions,
} from '../survey-constants';
import { serviceTypes } from '../services';
import { loadSurveyRecords, type SurveyRecord } from '../survey-utils';

export { loadSurveyRecords };
export type { SurveyRecord } from '../survey-utils';

export const serviceTargets = serviceTypes.map((name) => ({ name, target: 10 }));

export type CalculationScale = 4 | 5;

export const answerToScale = (answer: string, calculationScale: CalculationScale = 4) => {
  const serviceIndex = serviceOptions.indexOf(answer);
  if (serviceIndex >= 0) {
    const scale4Value = serviceIndex + 1;
    return calculationScale === 5 && scale4Value >= 3 ? scale4Value + 1 : scale4Value;
  }

  const antiIndex = antiCorruptionOptions.indexOf(answer);
  if (antiIndex >= 0) {
    const scale4Value = antiIndex + 1;
    return calculationScale === 5 && scale4Value >= 3 ? scale4Value + 1 : scale4Value;
  }

  return '';
};

export const getSurveySummary = (records: SurveyRecord[], availableServices = serviceTypes) => {
  const actualCounts = records.reduce<Record<string, number>>((acc, record) => {
    const key = record.profile.serviceType;
    if (!key) return acc;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const serviceNames = Array.from(new Set([
    ...availableServices,
    ...records.map((record) => record.profile.serviceType).filter(Boolean),
  ]));
  const targets = serviceNames.map((name) => ({ name, target: 10 }));

  const serviceSummary = targets.map((service) => {
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
  calculationScale: CalculationScale;
  maxScale: number;
  records: SurveyRecord[];
  serviceResults: SkmQuestionResult[];
  antiResults: SkmQuestionResult[];
  serviceSkmScale: number;
  serviceSkm100: number;
  antiSkmScale: number;
  antiSkm100: number;
};

const round3 = (value: number) => Number(value.toFixed(3));
const round2 = (value: number) => Number(value.toFixed(2));

const getQuestionResults = (
  records: SurveyRecord[],
  questions: string[],
  prefix: 'service' | 'anti',
  codePrefix: string,
  calculationScale: CalculationScale,
) => {
  const weight = questions.length > 0 ? 1 / questions.length : 0;

  return questions.map((question, index) => {
    const total = records.reduce((sum, record) => {
      const scale = answerToScale(record.responses[`${prefix}-${index + 1}`] ?? '', calculationScale);
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

export const getSkmCalculation = (
  records: SurveyRecord[],
  serviceName: string,
  calculationScale: CalculationScale = 4,
): SkmCalculation => {
  const filteredRecords = serviceName
    ? records.filter((record) => record.profile.serviceType === serviceName)
    : records;
  const maxScale = calculationScale;
  const serviceResults = getQuestionResults(filteredRecords, serviceQuestions, 'service', 'U', calculationScale);
  const antiResults = getQuestionResults(filteredRecords, antiCorruptionQuestions, 'anti', 'A', calculationScale);
  const serviceSkmScale = serviceResults.reduce((sum, result) => sum + result.weightedNrr, 0);
  const antiSkmScale = antiResults.reduce((sum, result) => sum + result.weightedNrr, 0);

  return {
    serviceName,
    calculationScale,
    maxScale,
    records: filteredRecords,
    serviceResults,
    antiResults,
    serviceSkmScale: round3(serviceSkmScale),
    serviceSkm100: round2(serviceSkmScale * (100 / maxScale)),
    antiSkmScale: round3(antiSkmScale),
    antiSkm100: round2(antiSkmScale * (100 / maxScale)),
  };
};

export const getServiceQuality = (score: number) => {
  if (score >= 88.31) return 'A (Sangat Baik)';
  if (score >= 76.61) return 'B (Baik)';
  if (score >= 65) return 'C (Kurang Baik)';
  if (score >= 25) return 'D (Tidak Baik)';
  return '-';
};
