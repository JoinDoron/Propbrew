import type { NextRequest } from 'next/server';
import { reviewLogin } from '@/server/review-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) { return reviewLogin(request); }
