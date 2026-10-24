import { z } from 'zod';
import { nativeAuthEnabled } from '@/server/auth/mode';
import { getNativeIdentity,activateCompany } from '@/server/auth/company';
import { accountJson,accountResponse } from '@/server/auth/request';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
  if(!nativeAuthEnabled())return accountResponse({error:'Not found'},404);
  const identity=await getNativeIdentity();if(!identity)return accountResponse({error:'Sign in to continue.'},401);
  let body:unknown;try{body=await accountJson(request);}catch{return accountResponse({error:'Send a small JSON request from your Propbrew account.'},400);}
  const parsed=z.object({companyId:z.uuid()}).strict().safeParse(body);
  if(!parsed.success)return accountResponse({error:'Choose an available company.'},400);
  try{await activateCompany(identity,parsed.data.companyId);return accountResponse({companyId:parsed.data.companyId});}
  catch{return accountResponse({error:'That company is unavailable.'},404);}
}
