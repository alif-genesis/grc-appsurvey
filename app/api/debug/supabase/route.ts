import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const mask = (value?: string) => {
  if (!value) return 'belum diset';
  if (value.length <= 12) return 'tersedia';
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
};

const formatError = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const details = error as {
      message?: string;
      code?: string;
      details?: string;
      hint?: string;
    };
    return {
      message: details.message || '',
      code: details.code || '',
      details: details.details || '',
      hint: details.hint || '',
    };
  }
  return String(error || 'Unknown error');
};

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return NextResponse.json({
      ok: false,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: mask(url),
        SUPABASE_SERVICE_ROLE_KEY: mask(serviceRoleKey),
      },
      table: 'belum dicek',
      error: 'Env Supabase belum lengkap di Vercel.',
    }, { status: 500 });
  }

  try {
    const supabase = createClient(url, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    const checks = await Promise.all([
      supabase.from('survey_records').select('id').limit(1),
      supabase.from('blast_records').select('id').limit(1),
    ]);
    const surveyError = checks[0].error;
    const blastError = checks[1].error;

    if (surveyError || blastError) {
      return NextResponse.json({
        ok: false,
        env: {
          NEXT_PUBLIC_SUPABASE_URL: mask(url),
          SUPABASE_SERVICE_ROLE_KEY: mask(serviceRoleKey),
        },
        tables: {
          survey_records: surveyError ? formatError(surveyError) : 'bisa diakses',
          blast_records: blastError ? formatError(blastError) : 'bisa diakses',
        },
      }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: mask(url),
        SUPABASE_SERVICE_ROLE_KEY: mask(serviceRoleKey),
      },
      tables: {
        survey_records: 'bisa diakses',
        blast_records: 'bisa diakses',
      },
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: mask(url),
        SUPABASE_SERVICE_ROLE_KEY: mask(serviceRoleKey),
      },
      table: 'survey_records belum terkonfirmasi',
      error: formatError(error),
    }, { status: 500 });
  }
}
