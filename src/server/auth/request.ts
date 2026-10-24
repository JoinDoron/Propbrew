import 'server-only';
import { nativeRequestOriginAllowed } from './mode';

export async function accountJson(request: Request): Promise<unknown> {
  if (!nativeRequestOriginAllowed(request)) throw new Error('origin');
  if (request.headers.get('Content-Type')?.split(';',1)[0].trim().toLowerCase() !== 'application/json') throw new Error('body');
  const reader=request.body?.getReader();if(!reader)throw new Error('body');
  const parts:Uint8Array[]=[];let size=0;
  try {
    for(;;) {const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>4096){await reader.cancel();throw new Error('body');}parts.push(part.value);}
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  } finally { reader.releaseLock(); }
}
export function accountResponse(body: unknown,status=200) {return Response.json(body,{status,headers:{'Cache-Control':'no-store'}});}
