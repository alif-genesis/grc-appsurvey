import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { DEFAULT_SURVEY_CAMPAIGN_ID } from './services';

export const ADMIN_SURVEY_COOKIE = 'grc_active_survey_id';

export const getSurveyScope = (request?: NextRequest) => (
  request?.cookies.get(ADMIN_SURVEY_COOKIE)?.value || DEFAULT_SURVEY_CAMPAIGN_ID
);

export const scopeFilter = (query: any, includeLegacy = false, request?: NextRequest) => {
  const scope = getSurveyScope(request);
  if (includeLegacy && scope === DEFAULT_SURVEY_CAMPAIGN_ID) {
    return query.or(`campaign_id.eq.${scope},campaign_id.eq.komdigi-default,campaign_id.is.null`);
  }
  return query.eq('campaign_id', scope);
};

export const getRequiredEnv = (key: string) => {
  const value = process.env[key];
  if (!value) throw new Error(`${key} belum diset`);
  return value;
};

export const getSupabase = () => createClient(
  getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
  getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);

export const formatServerError = (error: unknown, fallback: string) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const details = error as {
      message?: string;
      code?: string;
      details?: string;
      hint?: string;
    };
    const message = [
      details.message,
      details.code ? `Code: ${details.code}` : '',
      details.details ? `Details: ${details.details}` : '',
      details.hint ? `Hint: ${details.hint}` : '',
    ].filter(Boolean).join(' | ');

    if (message) return message;

    try {
      const serialized = JSON.stringify(error);
      return serialized && serialized !== '{}' ? serialized : fallback;
    } catch {
      return fallback;
    }
  }
  return typeof error === 'string' && error ? error : fallback;
};
