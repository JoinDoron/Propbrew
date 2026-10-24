import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export async function GET() {
  return NextResponse.json({ ok: true, service: 'reeve-api', version: 'v1', time: new Date().toISOString() });
}
