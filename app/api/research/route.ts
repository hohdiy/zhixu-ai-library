import { z } from 'zod';
import { readLibrary, saveAnalysis, saveBrief } from '@/lib/library';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
export async function GET(){try{return Response.json(await readLibrary(true),{headers});}catch(e){return Response.json({error:String(e)},{status:500,headers});}}
export async function POST(req:Request){try{const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return Response.json({error:'请求来源无效'},{status:403,headers});const a=z.object({action:z.enum(['analysis','brief'])}).passthrough().parse(await req.json());return Response.json(a.action==='analysis'?await saveAnalysis(a):a.action==='brief'?await saveBrief(a):{error:'不支持的操作'},{headers,status:['analysis','brief'].includes(a.action)?200:400});}catch(e){return Response.json({error:e instanceof Error?e.message:'写入失败'},{status:400,headers});}}
