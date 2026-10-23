import { z } from 'zod';
import { readLibrary, mutate } from '@/lib/library';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
export async function GET(){try{return Response.json(await readLibrary(),{headers});}catch(e){return Response.json({error:e instanceof Error?e.message:'数据库读取失败'},{status:500,headers});}}
export async function POST(req:Request){try{const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return Response.json({error:'请求来源无效'},{status:403,headers});if(Number(req.headers.get('content-length')||0)>100000)return Response.json({error:'请求过大'},{status:413});const data=z.object({action:z.string()}).passthrough().parse(await req.json());return Response.json(await mutate(data.action,data),{headers});}catch(e){return Response.json({error:e instanceof Error?e.message:'操作失败'},{status:400,headers});}}
