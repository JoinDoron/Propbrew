import { z } from 'zod';
import { nativeAuthEnabled } from '@/server/auth/mode';
import { getNativeIdentity,listCompanies,provisionCompany,consumeAuthAttempt } from '@/server/auth/company';
import { accountJson,accountResponse } from '@/server/auth/request';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET() {
  if(!nativeAuthEnabled())return accountResponse({error:'Not found'},404);
  const identity=await getNativeIdentity();if(!identity)return accountResponse({error:'Sign in to continue.'},401);
  return accountResponse({companies:await listCompanies(identity),activeCompanyId:identity.session.activeCompanyId??null});
}
export async function POST(request:Request) {
  if(!nativeAuthEnabled())return accountResponse({error:'Not found'},404);
  const identity=await getNativeIdentity();if(!identity)return accountResponse({error:'Sign in to continue.'},401);
  let body:unknown;
  try{body=await accountJson(request);}catch{return accountResponse({error:'Send a small JSON request from your Propbrew account.'},400);}
  const parsed=z.object({companyName:z.string().trim().min(2).max(120)}).strict().safeParse(body);
  if(!parsed.success)return accountResponse({error:'Enter a valid company name.'},400);
  try {
    await consumeAuthAttempt('company-create',identity.user.id,5,24*3600);
    const companyId=await provisionCompany(identity,parsed.data.companyName);
    return accountResponse({companyId},201);
  }catch{return accountResponse({error:'The company could not be created. Please try again later.'},409);}
}
