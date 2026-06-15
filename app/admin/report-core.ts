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

const sampleSizeTable = [
  [10, 10], [15, 14], [20, 19], [25, 24], [30, 28], [35, 32], [40, 36], [45, 40],
  [50, 44], [55, 48], [60, 52], [65, 56], [70, 59], [75, 63], [80, 66], [85, 70],
  [90, 73], [95, 76], [100, 80], [110, 86], [120, 92], [130, 97], [140, 103],
  [150, 108], [160, 113], [170, 118], [180, 123], [190, 127], [200, 132],
  [210, 136], [220, 140], [230, 144], [240, 148], [250, 152], [260, 155],
  [270, 159], [280, 162], [290, 165], [300, 169], [320, 175], [340, 181],
  [360, 186], [380, 191], [400, 196], [420, 201], [440, 205], [460, 210],
  [480, 214], [500, 217], [550, 226], [600, 234], [650, 242], [700, 248],
  [750, 254], [800, 260], [850, 265], [900, 269], [950, 274], [1000, 278],
  [1100, 285], [1200, 291], [1300, 297], [1400, 302], [1500, 306], [1600, 310],
  [1700, 313], [1800, 317], [1900, 320], [2000, 322], [2200, 327], [2400, 331],
  [2600, 335], [2800, 338], [3000, 341], [3500, 346], [4000, 351], [4500, 354],
  [5000, 357], [6000, 361], [7000, 364], [8000, 367], [9000, 368], [10000, 370],
  [15000, 375], [20000, 377], [30000, 379], [40000, 380], [50000, 381],
  [75000, 382], [1000000, 384],
] as const;

export const getKrejcieMorganSampleSize = (population: number) => {
  if (population <= 0) return 0;
  if (population < 10) return population;

  const match = [...sampleSizeTable].reverse().find(([populationLimit]) => population >= populationLimit);
  return Math.min(population, match?.[1] ?? population);
};

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

export const getSurveySummary = (
  records: SurveyRecord[],
  availableServices = serviceTypes,
  populationCounts: Record<string, number> = {},
) => {
  const actualCounts = records.reduce<Record<string, number>>((acc, record) => {
    const key = record.profile.serviceType;
    if (!key) return acc;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const serviceNames = Array.from(new Set(availableServices.filter(Boolean)));
  const activeServiceNames = new Set(serviceNames);
  const filteredCounts = Object.fromEntries(
    Object.entries(actualCounts).filter(([service]) => activeServiceNames.has(service)),
  );
  const targets = serviceNames.map((name) => ({ name, target: 10 }));

  const serviceSummary = targets.map((service) => {
    const responded = filteredCounts[service.name] ?? 0;
    const population = populationCounts[service.name] ?? responded;
    const target = getKrejcieMorganSampleSize(population);
    const gap = Math.max(0, target - responded);
    const targetPercent = target > 0 ? Math.round((responded / target) * 100) : 0;
    const percent = population > 0 ? Math.round((responded / population) * 100) : 0;
    return {
      name: service.name,
      population,
      target,
      responded,
      gap,
      percent,
      targetPercent,
      fulfillmentPercent: percent,
    };
  });

  const overallTarget = serviceSummary.reduce((sum, row) => sum + row.target, 0);
  const overallPopulation = serviceSummary.reduce((sum, row) => sum + row.population, 0);
  const overallResponded = serviceSummary.reduce((sum, row) => sum + row.responded, 0);
  const overallTargetPercent = overallTarget > 0 ? Math.round((overallResponded / overallTarget) * 100) : 0;
  const overallPercent = overallPopulation > 0 ? Math.round((overallResponded / overallPopulation) * 100) : 0;

  return {
    totalSurveys: records.length,
    uniqueRespondents: new Set(records.map((record) => `${record.profile.name}-${record.profile.directorate}-${record.profile.serviceType}`)).size,
    serviceSummary,
    overallPopulation,
    overallTarget,
    overallResponded,
    overallPercent,
    overallTargetPercent,
    overallPopulationPercent: overallPercent,
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
