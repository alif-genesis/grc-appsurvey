import { NextResponse } from 'next/server';
import { getPublicEmailSenders } from '../email-senders';

export async function GET() {
  return NextResponse.json({
    senders: getPublicEmailSenders(),
  });
}
