import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { getActor } from '@/server/session';
import { requiredString } from '@/lib/request-validation';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  const actor = await getActor();
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'file is required.' }, { status: 400 });
  if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: 'File exceeds 15 MB.' }, { status: 413 });
  const purpose = requiredString(form.get('purpose'), 'purpose', 80);
  const blob = await put(`tenants/${actor.tenantId ?? 'platform'}/${crypto.randomUUID()}-${file.name}`, file, { access: 'private', addRandomSuffix: true });
  return NextResponse.json({ ok: true, url: blob.url, purpose, contentType: file.type, size: file.size });
}
